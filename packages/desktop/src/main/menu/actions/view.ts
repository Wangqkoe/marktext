import { ipcMain, type BrowserWindow, type Menu, type MenuItem } from 'electron'
import { COMMANDS } from '../../commands'
import type { CommandManager } from '../../commands'
import type { LayoutAction, LayoutMenuState } from '@shared/types/layout'
import type { ViewMode, ViewModeState } from '@shared/types/viewMode'

type Win = BrowserWindow | null | undefined

const typewriterModeMenuItemId = 'typewriterModeMenuItem'
const focusModeMenuItemId = 'focusModeMenuItem'

const toggleTypeMode = (win: Win, type: ViewMode): void => {
  if (win && win.webContents) {
    win.webContents.send('mt::toggle-view-mode-entry', type)
  }
}

const sendLayoutAction = (win: Win, action: LayoutAction): void => {
  if (win && win.webContents) {
    win.webContents.send('mt::layout-action', action)
  }
}

export const debugToggleDevTools = (win: Win): void => {
  if (win && global.MARKTEXT_DEBUG) {
    win.webContents.toggleDevTools()
  }
}

export const debugReloadWindow = (win: Win): void => {
  if (win && global.MARKTEXT_DEBUG) {
    ipcMain.emit('window-reload-by-id', win.id)
  }
}

export const showCommandPalette = (win: Win): void => {
  if (win && win.webContents) {
    win.webContents.send('mt::show-command-palette')
  }
}

export const toggleFocusMode = (win: Win): void => {
  toggleTypeMode(win, 'focus')
}

export const toggleSourceCodeMode = (win: Win): void => {
  toggleTypeMode(win, 'sourceCode')
}

export const toggleSidebar = (win: Win): void => {
  sendLayoutAction(win, { type: 'toggleSidebar' })
}

export const toggleTabBar = (win: Win): void => {
  sendLayoutAction(win, { type: 'toggleTabBar' })
}

export const showTabBar = (win: Win): void => {
  sendLayoutAction(win, { type: 'showTabBar' })
}

export const showTableOfContents = (win: Win): void => {
  sendLayoutAction(win, { type: 'selectSidebarView', view: 'toc' })
}

export const toggleTypewriterMode = (win: Win): void => {
  toggleTypeMode(win, 'typewriter')
}

export const reloadImageCache = (win: Win): void => {
  if (win && win.webContents) {
    win.webContents.send('mt::invalidate-image-cache')
  }
}

// --- Commands -------------------------------------------------------------

export const loadViewCommands = (commandManager: CommandManager): void => {
  commandManager.add(COMMANDS.VIEW_COMMAND_PALETTE, showCommandPalette)
  commandManager.add(COMMANDS.VIEW_FOCUS_MODE, toggleFocusMode)
  commandManager.add(COMMANDS.VIEW_FORCE_RELOAD_IMAGES, reloadImageCache)
  commandManager.add(COMMANDS.VIEW_SOURCE_CODE_MODE, toggleSourceCodeMode)
  commandManager.add(COMMANDS.VIEW_TOGGLE_SIDEBAR, toggleSidebar)
  commandManager.add(COMMANDS.VIEW_TOGGLE_TABBAR, toggleTabBar)
  commandManager.add(COMMANDS.VIEW_TOGGLE_TOC, showTableOfContents)
  commandManager.add(COMMANDS.VIEW_TYPEWRITER_MODE, toggleTypewriterMode)

  commandManager.add(COMMANDS.VIEW_DEV_RELOAD, debugReloadWindow)
  commandManager.add(COMMANDS.VIEW_TOGGLE_DEV_TOOLS, debugToggleDevTools)
}

// --- IPC events -------------------------------------------------------------

// NOTE: Don't use static `getMenuItemById` here, instead request the menu by
//       window id from `AppMenu` manager.

export const viewModeStateChanged = (applicationMenu: Menu, changes: ViewModeState): void => {
  const disableMenuByName = (id: string, value: boolean): void => {
    const menuItem: MenuItem = applicationMenu.getMenuItemById(id)!
    menuItem.enabled = value
  }
  const changeMenuByName = (id: string, value: boolean): void => {
    const menuItem: MenuItem = applicationMenu.getMenuItemById(id)!
    menuItem.checked = value
  }

  if (typeof changes.sourceCode === 'boolean') {
    changeMenuByName('sourceCodeModeMenuItem', changes.sourceCode)
    disableMenuByName(focusModeMenuItemId, !changes.sourceCode)
    disableMenuByName(typewriterModeMenuItemId, !changes.sourceCode)
  }
  if (typeof changes.typewriter === 'boolean') {
    changeMenuByName(typewriterModeMenuItemId, changes.typewriter)
  }
  if (typeof changes.focus === 'boolean') {
    changeMenuByName(focusModeMenuItemId, changes.focus)
  }
}

export const layoutMenuStateChanged = (applicationMenu: Menu, state: LayoutMenuState): void => {
  applicationMenu.getMenuItemById('sideBarMenuItem')!.checked = state.sidebarVisible
  applicationMenu.getMenuItemById('tabBarMenuItem')!.checked = state.tabBarVisible
}
