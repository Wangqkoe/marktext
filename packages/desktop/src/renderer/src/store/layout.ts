import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import bus from '../bus'
import { usePreferencesStore } from './preferences'
import { debouncedSendBufferedState } from './bufferedState'
import {
  isSidebarView,
  type LayoutState as CanonicalLayout,
  type LegacyLayoutState,
  type SidebarView
} from '@shared/types/preferences'

export type { SidebarView } from '@shared/types/preferences'

type LegacyLayoutPartial = LegacyLayoutState

type CanonicalLayoutPartial = { [Field in keyof CanonicalLayout]?: unknown }

type PersistedLayoutPartial = LegacyLayoutPartial & CanonicalLayoutPartial

interface SetLayoutOptions {
  scheduleBufferUpdate?: boolean
}

const normalizeSideBarWidth = (width: unknown): number => {
  if (
    (typeof width !== 'number' && typeof width !== 'string') ||
    (typeof width === 'string' && width.trim() === '')
  ) {
    return 255
  }
  const numericWidth = Number(width)
  return Number.isFinite(numericWidth) ? Math.max(numericWidth, 220) : 255
}

type LegacyBufferedLayout = Required<LegacyLayoutState>

const hasOwn = (state: object, key: keyof PersistedLayoutPartial): boolean =>
  Object.prototype.hasOwnProperty.call(state, key)

const createCanonicalLayoutState = (state: unknown): CanonicalLayout | null => {
  if (!state || typeof state !== 'object') return null
  const snapshot = state as PersistedLayoutPartial
  const rawSidebarView = hasOwn(snapshot, 'sidebarView')
    ? snapshot.sidebarView
    : snapshot.rightColumn
  const rawSidebarVisible = hasOwn(snapshot, 'sidebarVisible')
    ? snapshot.sidebarVisible
    : snapshot.showSideBar
  const rawTabBarVisible = hasOwn(snapshot, 'tabBarVisible')
    ? snapshot.tabBarVisible
    : snapshot.showTabBar
  const rawSidebarWidth = hasOwn(snapshot, 'sidebarWidth')
    ? snapshot.sidebarWidth
    : snapshot.sideBarWidth

  return {
    sidebarView: isSidebarView(rawSidebarView) ? rawSidebarView : 'files',
    sidebarVisible: !!rawSidebarVisible,
    tabBarVisible: !!rawTabBarVisible,
    sidebarWidth: normalizeSideBarWidth(rawSidebarWidth)
  }
}

const initialWidth = localStorage.getItem('side-bar-width')
const initialSideBarWidth = normalizeSideBarWidth(initialWidth)

export const useLayoutStore = defineStore('layout', () => {
  const rightColumn = ref<string>('files')
  const showSideBar = ref(false)
  const showTabBar = ref(false)
  const sideBarWidth = ref<number>(initialSideBarWidth)
  const sidebarView = ref<SidebarView>('files')
  const sidebarVisible = computed<boolean>(() => showSideBar.value)
  const tabBarVisible = computed<boolean>(() => showTabBar.value)
  const sidebarWidth = computed<number>(() => sideBarWidth.value)

  const effectiveSidebarWidth = computed<number>(() =>
    sidebarVisible.value ? sidebarWidth.value : 0
  )
  // Legacy spelling retained until ticket 03 contracts the old layout interface.
  const effectiveSideBarWidth = effectiveSidebarWidth

  function SET_LAYOUT(
    layout: LegacyLayoutPartial,
    { scheduleBufferUpdate = true }: SetLayoutOptions = {}
  ): void {
    if (layout.showSideBar !== undefined) {
      const { windowId } = window.marktext?.env ?? {}
      window.electron.ipcRenderer.send(
        'mt::update-sidebar-menu',
        Number(windowId),
        !!layout.showSideBar
      )
      const preferencesStore = usePreferencesStore()
      preferencesStore.SET_SINGLE_PREFERENCE({
        type: 'sideBarVisibility',
        value: !!layout.showSideBar
      })
    }
    // Keep the legacy fields synchronized while canonical state is introduced.
    if (layout.rightColumn !== undefined) rightColumn.value = layout.rightColumn
    if (isSidebarView(layout.rightColumn)) sidebarView.value = layout.rightColumn
    if (layout.showSideBar !== undefined) showSideBar.value = !!layout.showSideBar
    if (layout.showTabBar !== undefined) showTabBar.value = !!layout.showTabBar
    if (layout.sideBarWidth !== undefined) {
      SET_SIDE_BAR_WIDTH(layout.sideBarWidth, { scheduleBufferUpdate: false })
    }
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function CREATE_BUFFERED_STATE(): LegacyBufferedLayout {
    return {
      rightColumn: rightColumn.value,
      showSideBar: showSideBar.value,
      showTabBar: showTabBar.value,
      sideBarWidth: sideBarWidth.value
    }
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const layout = createCanonicalLayoutState(state)
    if (!layout) return

    SET_SIDE_BAR_WIDTH(layout.sidebarWidth, { scheduleBufferUpdate: false })
    SET_LAYOUT(
      {
        rightColumn: layout.sidebarView,
        showSideBar: layout.sidebarVisible,
        showTabBar: layout.tabBarVisible
      },
      { scheduleBufferUpdate: false }
    )
    DISPATCH_LAYOUT_MENU_ITEMS()
  }

  function TOGGLE_LAYOUT_ENTRY(entryName: 'showSideBar' | 'showTabBar'): void {
    if (entryName === 'showSideBar') {
      showSideBar.value = !showSideBar.value
      const preferencesStore = usePreferencesStore()
      preferencesStore.SET_SINGLE_PREFERENCE({
        type: 'sideBarVisibility',
        value: !!showSideBar.value
      })
    } else if (entryName === 'showTabBar') {
      showTabBar.value = !showTabBar.value
    }
    debouncedSendBufferedState()
  }

  function SET_SIDE_BAR_WIDTH(
    width: unknown,
    { scheduleBufferUpdate = true }: SetLayoutOptions = {}
  ): void {
    const normalizedWidth = normalizeSideBarWidth(width)
    localStorage.setItem('side-bar-width', String(normalizedWidth))
    sideBarWidth.value = normalizedWidth
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function LISTEN_FOR_LAYOUT(): void {
    window.electron.ipcRenderer.on('mt::set-view-layout', (_e, layout) => {
      const incomingLayout = layout as unknown as LegacyLayoutPartial
      if (isSidebarView(incomingLayout.rightColumn)) {
        selectSidebarView(incomingLayout.rightColumn)
      } else {
        SET_LAYOUT(incomingLayout)
      }
      DISPATCH_LAYOUT_MENU_ITEMS()
    })

    window.electron.ipcRenderer.on('mt::toggle-view-layout-entry', (_e, entryName) => {
      TOGGLE_LAYOUT_ENTRY(entryName as 'showSideBar' | 'showTabBar')
      DISPATCH_LAYOUT_MENU_ITEMS()
    })

    bus.on('view:toggle-layout-entry', (entryName: unknown) => {
      const name = entryName as 'showSideBar' | 'showTabBar'
      TOGGLE_LAYOUT_ENTRY(name)
      const { windowId } = window.marktext?.env ?? {}
      window.electron.ipcRenderer.send('mt::view-layout-changed', Number(windowId), {
        [name]: name === 'showSideBar' ? showSideBar.value : showTabBar.value
      })
    })
  }

  function DISPATCH_LAYOUT_MENU_ITEMS(): void {
    const { windowId } = window.marktext?.env ?? {}
    window.electron.ipcRenderer.send('mt::view-layout-changed', Number(windowId), {
      showTabBar: showTabBar.value,
      showSideBar: showSideBar.value
    })
  }

  function CHANGE_SIDE_BAR_WIDTH(width: number | string): void {
    SET_SIDE_BAR_WIDTH(width)
  }

  // Canonical transitions route through legacy mutators until ticket 03 removes
  // them, keeping current IPC, preferences and buffered state synchronized.
  /**
   * Persists the expanded width and schedules a buffered-state update. Finite values clamp
   * to 220px; missing, blank, non-numeric and non-finite values become the 255px default.
   */
  function setSidebarWidth(width: unknown): void {
    SET_SIDE_BAR_WIDTH(width)
  }

  function selectSidebarView(view: SidebarView): void {
    if (sidebarVisible.value && sidebarView.value === view) return
    SET_LAYOUT({ rightColumn: view, showSideBar: true })
  }

  function showSidebar(view: SidebarView = sidebarView.value): void {
    selectSidebarView(view)
  }

  function hideSidebar(): void {
    SET_LAYOUT({ showSideBar: false })
  }

  function toggleSidebar(): void {
    if (sidebarVisible.value) {
      hideSidebar()
    } else {
      showSidebar()
    }
  }

  function toggleTabBar(): void {
    TOGGLE_LAYOUT_ENTRY('showTabBar')
  }

  /** Restores canonical or legacy persisted state and synchronizes menu checkmarks. */
  function restoreLayout(snapshot: unknown): void {
    RESTORE_BUFFERED_STATE(snapshot)
  }

  return {
    rightColumn,
    showSideBar,
    showTabBar,
    sideBarWidth,
    sidebarView,
    sidebarVisible,
    tabBarVisible,
    sidebarWidth,
    effectiveSideBarWidth,
    effectiveSidebarWidth,
    SET_LAYOUT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    TOGGLE_LAYOUT_ENTRY,
    SET_SIDE_BAR_WIDTH,
    LISTEN_FOR_LAYOUT,
    DISPATCH_LAYOUT_MENU_ITEMS,
    CHANGE_SIDE_BAR_WIDTH,
    setSidebarWidth,
    selectSidebarView,
    showSidebar,
    hideSidebar,
    toggleSidebar,
    toggleTabBar,
    restoreLayout
  }
})
