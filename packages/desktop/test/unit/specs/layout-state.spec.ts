import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  const testWindow = globalThis as unknown as { window?: { path?: { sep: string } } }
  testWindow.window ??= {}
  testWindow.window.path ??= { sep: '/' }
})

vi.mock('@/store/bufferedState', () => ({ debouncedSendBufferedState: vi.fn() }))

import { useLayoutStore } from '@/store/layout'

const mockWindow = window as unknown as {
  electron?: { ipcRenderer: { on: Mock; send: Mock; invoke: Mock } }
  marktext?: { env: { windowId: number } }
}

describe('canonical shell layout state', () => {
  beforeEach(() => {
    mockWindow.electron = {
      ipcRenderer: {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn(() => Promise.resolve(false))
      }
    }
    mockWindow.marktext = { env: { windowId: 1 } }
    localStorage.clear()
    setActivePinia(createPinia())
  })

  describe('sidebar width normalization', () => {
    it.each([
      [220, 220],
      [280, 280],
      ['320', 320],
      [219, 220],
      [0, 220],
      [-50, 220],
      [undefined, 255],
      [null, 255],
      ['', 255],
      ['not-a-width', 255],
      [Number.NaN, 255],
      [Number.POSITIVE_INFINITY, 255]
    ])('normalizes %j to %dpx', (input, expected) => {
      const layoutStore = useLayoutStore()

      layoutStore.setSidebarWidth(input)

      expect(layoutStore.sidebarWidth).toBe(expected)
      expect(localStorage.getItem('side-bar-width')).toBe(String(expected))
    })
  })

  it('creates buffered state with only canonical layout fields', () => {
    const layoutStore = useLayoutStore()
    layoutStore.showSidebar('search')
    layoutStore.setSidebarWidth(318)
    layoutStore.toggleTabBar()

    expect(layoutStore.createBufferedState()).toEqual({
      sidebarVisible: true,
      sidebarView: 'search',
      sidebarWidth: 318,
      tabBarVisible: true
    })
  })

  it('restores every value from a canonical buffered snapshot', () => {
    const layoutStore = useLayoutStore()

    layoutStore.restoreLayout({
      sidebarVisible: true,
      sidebarView: 'toc',
      sidebarWidth: 337,
      tabBarVisible: false
    })

    expect({
      sidebarVisible: layoutStore.sidebarVisible,
      sidebarView: layoutStore.sidebarView,
      sidebarWidth: layoutStore.sidebarWidth,
      tabBarVisible: layoutStore.tabBarVisible
    }).toEqual({
      sidebarVisible: true,
      sidebarView: 'toc',
      sidebarWidth: 337,
      tabBarVisible: false
    })
  })

  it.each(['files', 'search', 'toc'] as const)(
    'restores the canonical %s sidebar view',
    (sidebarView) => {
      const layoutStore = useLayoutStore()

      layoutStore.restoreLayout({
        sidebarVisible: false,
        sidebarView,
        sidebarWidth: 255,
        tabBarVisible: true
      })

      expect(layoutStore.sidebarView).toBe(sidebarView)
      expect(layoutStore.sidebarVisible).toBe(false)
      expect(layoutStore.tabBarVisible).toBe(true)
    }
  )

  it.each([
    ['files', 'files'],
    ['search', 'search'],
    ['toc', 'toc'],
    ['', 'files'],
    [undefined, 'files'],
    ['unknown', 'files']
  ] as const)('maps the legacy %j sidebar view to %s', (rightColumn, expected) => {
    const layoutStore = useLayoutStore()

    layoutStore.restoreLayout({
      rightColumn,
      showSideBar: true,
      showTabBar: true,
      sideBarWidth: 299
    })

    expect(layoutStore.sidebarView).toBe(expected)
    expect(layoutStore.sidebarVisible).toBe(true)
    expect(layoutStore.tabBarVisible).toBe(true)
    expect(layoutStore.sidebarWidth).toBe(299)
  })

  it('keeps legacy names out of live layout state after compatibility restore', () => {
    const layoutStore = useLayoutStore()

    layoutStore.restoreLayout({
      rightColumn: '',
      showSideBar: true,
      showTabBar: true,
      sideBarWidth: 45
    })

    expect(layoutStore.$state).toEqual({
      sidebarView: 'files',
      sidebarVisible: true,
      tabBarVisible: true,
      sidebarWidth: 220
    })
  })

  it('maps a legacy snapshot with no sidebar view or width to canonical defaults', () => {
    const layoutStore = useLayoutStore()

    layoutStore.restoreLayout({ showSideBar: false, showTabBar: false })

    expect(layoutStore.sidebarView).toBe('files')
    expect(layoutStore.sidebarWidth).toBe(255)
  })

  it('prefers canonical fields when a transitional snapshot also has legacy fields', () => {
    const layoutStore = useLayoutStore()

    layoutStore.restoreLayout({
      sidebarVisible: false,
      sidebarView: 'search',
      sidebarWidth: 321,
      tabBarVisible: false,
      rightColumn: 'toc',
      showSideBar: true,
      sideBarWidth: 299,
      showTabBar: true
    })

    expect({
      sidebarVisible: layoutStore.sidebarVisible,
      sidebarView: layoutStore.sidebarView,
      sidebarWidth: layoutStore.sidebarWidth,
      tabBarVisible: layoutStore.tabBarVisible
    }).toEqual({
      sidebarVisible: false,
      sidebarView: 'search',
      sidebarWidth: 321,
      tabBarVisible: false
    })
  })

  it('selects a canonical sidebar view and opens the sidebar', () => {
    const layoutStore = useLayoutStore()

    layoutStore.selectSidebarView('search')

    expect(layoutStore.sidebarView).toBe('search')
    expect(layoutStore.sidebarVisible).toBe(true)
  })

  it('rejects invalid sidebar views received through the runtime action boundary', () => {
    const layoutStore = useLayoutStore()
    layoutStore.listenForLayoutActions()
    const registration = mockWindow.electron?.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'mt::layout-action'
    )
    expect(registration).toBeDefined()

    registration?.[1]({}, { type: 'selectSidebarView', view: '' })

    expect(layoutStore.sidebarView).toBe('files')
    expect(layoutStore.sidebarVisible).toBe(false)
  })

  it('synchronizes menu checkmarks once and treats the active view as a no-op', () => {
    const layoutStore = useLayoutStore()
    const menuUpdates = () =>
      mockWindow.electron!.ipcRenderer.send.mock.calls.filter(
        ([channel]) => channel === 'mt::layout-menu-state-changed'
      )

    layoutStore.selectSidebarView('search')

    expect(menuUpdates()).toEqual([
      ['mt::layout-menu-state-changed', 1, { sidebarVisible: true, tabBarVisible: false }]
    ])

    layoutStore.selectSidebarView('search')
    expect(menuUpdates()).toHaveLength(1)

    layoutStore.toggleTabBar()
    expect(menuUpdates()).toHaveLength(2)
    expect(menuUpdates()[1]).toEqual([
      'mt::layout-menu-state-changed',
      1,
      { sidebarVisible: true, tabBarVisible: true }
    ])
  })

  it('does not restore session layout when restoration is disabled', () => {
    const layoutStore = useLayoutStore()
    layoutStore.initializeLayout({
      sidebarVisible: false,
      tabBarVisible: true,
      restoreSessionLayout: false
    })

    layoutStore.restoreLayout({
      rightColumn: 'toc',
      showSideBar: true,
      showTabBar: false,
      sideBarWidth: 345
    })

    expect(layoutStore.createBufferedState()).toEqual({
      sidebarVisible: false,
      sidebarView: 'files',
      sidebarWidth: 255,
      tabBarVisible: true
    })
  })

  it('hides the complete sidebar without clearing its selected view or width', () => {
    const layoutStore = useLayoutStore()
    layoutStore.selectSidebarView('toc')
    layoutStore.setSidebarWidth(301)

    layoutStore.hideSidebar()

    expect(layoutStore.sidebarVisible).toBe(false)
    expect(layoutStore.sidebarView).toBe('toc')
    expect(layoutStore.sidebarWidth).toBe(301)
    expect(layoutStore.effectiveSidebarWidth).toBe(0)
  })

  it('exposes intention-revealing visibility and tab-bar transitions', () => {
    const layoutStore = useLayoutStore()

    layoutStore.showSidebar('search')
    expect([layoutStore.sidebarVisible, layoutStore.sidebarView]).toEqual([true, 'search'])

    layoutStore.toggleSidebar()
    expect(layoutStore.sidebarVisible).toBe(false)

    layoutStore.toggleSidebar()
    expect([layoutStore.sidebarVisible, layoutStore.sidebarView]).toEqual([true, 'search'])

    expect(layoutStore.tabBarVisible).toBe(false)
    layoutStore.toggleTabBar()
    expect(layoutStore.tabBarVisible).toBe(true)
  })

  it('closes a Folder root into visible Files without changing the tab bar', () => {
    const layoutStore = useLayoutStore()
    layoutStore.selectSidebarView('toc')
    layoutStore.toggleTabBar()

    layoutStore.closeFolderLayout({ scheduleBufferUpdate: false })

    expect(layoutStore.sidebarView).toBe('files')
    expect(layoutStore.sidebarVisible).toBe(true)
    expect(layoutStore.tabBarVisible).toBe(true)
  })
})
