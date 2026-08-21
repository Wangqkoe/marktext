import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import bus from '../bus'
import { usePreferencesStore } from './preferences'
import { debouncedSendBufferedState } from './bufferedState'
import { isLayoutAction, isSidebarView } from '@shared/layout'
import type { LayoutState, SidebarView } from '@shared/types/layout'

export type { SidebarView } from '@shared/types/layout'

interface LegacyPersistedLayout {
  rightColumn?: unknown
  showSideBar?: unknown
  showTabBar?: unknown
  sideBarWidth?: unknown
}

type PersistedLayout = Partial<Record<keyof LayoutState, unknown>> & LegacyPersistedLayout

interface LayoutTransitionOptions {
  persistSidebarVisibility?: boolean
  scheduleBufferUpdate?: boolean
  synchronizeMenu?: 'always' | 'on-change' | false
}

interface InitializeLayoutOptions {
  sidebarVisible: boolean
  tabBarVisible: boolean
  restoreSessionLayout: boolean
}

interface OpenProjectLayoutOptions {
  scheduleBufferUpdate?: boolean
}

const normalizeSidebarWidth = (width: unknown): number => {
  if (
    (typeof width !== 'number' && typeof width !== 'string') ||
    (typeof width === 'string' && width.trim() === '')
  ) {
    return 255
  }
  const numericWidth = Number(width)
  return Number.isFinite(numericWidth) ? Math.max(numericWidth, 220) : 255
}

const hasOwn = (state: object, key: keyof PersistedLayout): boolean =>
  Object.prototype.hasOwnProperty.call(state, key)

const readPersistedLayout = (state: unknown): LayoutState | null => {
  if (!state || typeof state !== 'object') return null
  const snapshot = state as PersistedLayout
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
    sidebarWidth: normalizeSidebarWidth(rawSidebarWidth)
  }
}

const initialSidebarWidth = normalizeSidebarWidth(localStorage.getItem('side-bar-width'))

export const useLayoutStore = defineStore('layout', () => {
  const sidebarView = ref<SidebarView>('files')
  const sidebarVisible = ref(false)
  const tabBarVisible = ref(false)
  const sidebarWidth = ref(initialSidebarWidth)
  const effectiveSidebarWidth = computed(() => (sidebarVisible.value ? sidebarWidth.value : 0))
  let restoreSessionLayout = true

  const currentLayout = (): LayoutState => ({
    sidebarView: sidebarView.value,
    sidebarVisible: sidebarVisible.value,
    tabBarVisible: tabBarVisible.value,
    sidebarWidth: sidebarWidth.value
  })

  const synchronizeMenu = (): void => {
    const { windowId } = window.marktext?.env ?? {}
    window.electron.ipcRenderer.send('mt::layout-menu-state-changed', Number(windowId), {
      sidebarVisible: sidebarVisible.value,
      tabBarVisible: tabBarVisible.value
    })
  }

  const persistSidebarVisibility = (): void => {
    usePreferencesStore().SET_SINGLE_PREFERENCE({
      type: 'sideBarVisibility',
      value: sidebarVisible.value
    })
  }

  const applyLayout = (
    nextLayout: LayoutState,
    {
      persistSidebarVisibility: shouldPersistSidebarVisibility = false,
      scheduleBufferUpdate = true,
      synchronizeMenu: menuSynchronization = 'on-change'
    }: LayoutTransitionOptions = {}
  ): void => {
    const previousLayout = currentLayout()
    const didChange =
      previousLayout.sidebarView !== nextLayout.sidebarView ||
      previousLayout.sidebarVisible !== nextLayout.sidebarVisible ||
      previousLayout.tabBarVisible !== nextLayout.tabBarVisible ||
      previousLayout.sidebarWidth !== nextLayout.sidebarWidth
    const didChangeSidebarVisibility = previousLayout.sidebarVisible !== nextLayout.sidebarVisible

    sidebarView.value = nextLayout.sidebarView
    sidebarVisible.value = nextLayout.sidebarVisible
    tabBarVisible.value = nextLayout.tabBarVisible
    sidebarWidth.value = nextLayout.sidebarWidth

    if (previousLayout.sidebarWidth !== nextLayout.sidebarWidth) {
      localStorage.setItem('side-bar-width', String(nextLayout.sidebarWidth))
    }
    if (shouldPersistSidebarVisibility && didChangeSidebarVisibility) {
      persistSidebarVisibility()
    }
    if (scheduleBufferUpdate && didChange) {
      debouncedSendBufferedState()
    }
    if (menuSynchronization === 'always' || (menuSynchronization === 'on-change' && didChange)) {
      synchronizeMenu()
    }
  }

  function createBufferedState(): LayoutState {
    return currentLayout()
  }

  function initializeLayout({
    sidebarVisible: initialSidebarVisible,
    tabBarVisible: initialTabBarVisible,
    restoreSessionLayout: shouldRestoreSessionLayout
  }: InitializeLayoutOptions): void {
    restoreSessionLayout = shouldRestoreSessionLayout
    applyLayout(
      {
        ...currentLayout(),
        sidebarView: 'files',
        sidebarVisible: initialSidebarVisible,
        tabBarVisible: initialTabBarVisible
      },
      { scheduleBufferUpdate: false, synchronizeMenu: 'always' }
    )
  }

  function restoreLayout(snapshot: unknown): void {
    if (!restoreSessionLayout) return
    const layout = readPersistedLayout(snapshot)
    if (!layout) return
    applyLayout(layout, {
      persistSidebarVisibility: true,
      scheduleBufferUpdate: false,
      synchronizeMenu: 'always'
    })
  }

  function setSidebarWidth(width: unknown): void {
    const normalizedWidth = normalizeSidebarWidth(width)
    if (normalizedWidth === sidebarWidth.value) {
      localStorage.setItem('side-bar-width', String(normalizedWidth))
    }
    applyLayout({ ...currentLayout(), sidebarWidth: normalizedWidth }, { synchronizeMenu: false })
  }

  function selectSidebarView(view: SidebarView): void {
    if (sidebarVisible.value && sidebarView.value === view) return
    applyLayout(
      { ...currentLayout(), sidebarView: view, sidebarVisible: true },
      { persistSidebarVisibility: true }
    )
  }

  function showSidebar(view: SidebarView = sidebarView.value): void {
    selectSidebarView(view)
  }

  function hideSidebar(): void {
    if (!sidebarVisible.value) return
    applyLayout({ ...currentLayout(), sidebarVisible: false }, { persistSidebarVisibility: true })
  }

  function toggleSidebar(): void {
    if (sidebarVisible.value) hideSidebar()
    else showSidebar()
  }

  function showTabBar(): void {
    if (tabBarVisible.value) return
    applyLayout({ ...currentLayout(), tabBarVisible: true })
  }

  function toggleTabBar(): void {
    applyLayout({ ...currentLayout(), tabBarVisible: !tabBarVisible.value })
  }

  function openProjectLayout({ scheduleBufferUpdate = true }: OpenProjectLayoutOptions = {}): void {
    applyLayout(
      {
        ...currentLayout(),
        sidebarView: 'files',
        sidebarVisible: true,
        tabBarVisible: true
      },
      { persistSidebarVisibility: true, scheduleBufferUpdate }
    )
  }

  const handleLayoutAction = (action: unknown): void => {
    if (!isLayoutAction(action)) return

    switch (action.type) {
      case 'toggleSidebar':
        toggleSidebar()
        break
      case 'toggleTabBar':
        toggleTabBar()
        break
      case 'showTabBar':
        showTabBar()
        break
      case 'selectSidebarView':
        selectSidebarView(action.view)
        break
    }
  }

  function listenForLayoutActions(): void {
    window.electron.ipcRenderer.on('mt::layout-action', (_event, action) => {
      handleLayoutAction(action)
    })
    bus.on('view:layout-action', (action: unknown) => {
      handleLayoutAction(action)
    })
  }

  return {
    sidebarView,
    sidebarVisible,
    tabBarVisible,
    sidebarWidth,
    effectiveSidebarWidth,
    createBufferedState,
    initializeLayout,
    restoreLayout,
    setSidebarWidth,
    selectSidebarView,
    showSidebar,
    hideSidebar,
    toggleSidebar,
    showTabBar,
    toggleTabBar,
    openProjectLayout,
    listenForLayoutActions
  }
})
