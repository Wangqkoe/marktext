import type { LayoutAction, SidebarView } from './types/layout'

export const isSidebarView = (view: unknown): view is SidebarView =>
  view === 'files' || view === 'search' || view === 'toc'

export const isLayoutAction = (action: unknown): action is LayoutAction => {
  if (!action || typeof action !== 'object' || !('type' in action)) return false
  const candidate = action as { type: unknown; view?: unknown }

  switch (candidate.type) {
    case 'toggleSidebar':
    case 'toggleTabBar':
    case 'showTabBar':
      return true
    case 'selectSidebarView':
      return isSidebarView(candidate.view)
    default:
      return false
  }
}
