export type SidebarView = 'files' | 'search' | 'toc'

export interface LayoutState {
  sidebarVisible: boolean
  sidebarView: SidebarView
  /** Expanded sidebar width in CSS pixels; normalized to at least 220px. */
  sidebarWidth: number
  tabBarVisible: boolean
}

export type LayoutMenuState = Pick<LayoutState, 'sidebarVisible' | 'tabBarVisible'>

export type LayoutAction =
  | { type: 'toggleSidebar' }
  | { type: 'toggleTabBar' }
  | { type: 'showTabBar' }
  | { type: 'selectSidebarView'; view: SidebarView }
