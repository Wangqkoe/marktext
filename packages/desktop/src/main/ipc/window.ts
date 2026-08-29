import {
  BrowserWindow,
  Menu,
  MenuItem,
  ipcMain,
  type IpcMainEvent,
  type WebContents
} from 'electron'
import log from 'electron-log'
import type { MenuTemplate, MenuTemplateItem, MenuPopupPosition } from '@shared/types/menu'

const windowFromEvent = (event: IpcMainEvent): BrowserWindow | null =>
  BrowserWindow.fromWebContents(event.sender)

interface PopupEntry {
  sender: WebContents
  popupId: string
  selected: boolean
  onSenderDestroyed: () => void
}
const popups = new Map<number, PopupEntry>()

const closePopup = (windowId: number, popup: PopupEntry): void => {
  if (popups.get(windowId) !== popup) return
  popup.sender.removeListener('destroyed', popup.onSenderDestroyed)
  popups.delete(windowId)
  try {
    popup.sender.send('mt::menu::closed', {
      windowId,
      popupId: popup.popupId,
      selected: popup.selected
    })
  } catch {
    /* sender destroyed */
  }
}

const buildMenu = (template: MenuTemplate | undefined, windowId: number, popup: PopupEntry): Menu => {
  const menu = new Menu()
  for (const item of template || []) {
    if (item.type === 'separator') {
      menu.append(new MenuItem({ type: 'separator' }))
      continue
    }
    const id = item.id
    menu.append(
      new MenuItem({
        label: item.label,
        type: item.type as 'normal' | 'submenu' | 'checkbox' | 'radio' | undefined,
        accelerator: item.accelerator,
        enabled: item.enabled !== false,
        checked: !!item.checked,
        click: () => {
          if (popups.get(windowId) !== popup) return
          if (popup.selected) return
          popup.selected = true
          try {
            popup.sender.send('mt::menu::click', { windowId, id, popupId: popup.popupId })
          } catch {
            /* sender destroyed */
          } finally {
            closePopup(windowId, popup)
          }
        },
        submenu: item.submenu ? buildMenu(item.submenu as MenuTemplateItem[], windowId, popup) : undefined
      })
    )
  }
  return menu
}

export const registerWindowHandlers = (): void => {
  ipcMain.on('mt::win::minimize', (event) => {
    const win = windowFromEvent(event)
    if (win) win.minimize()
  })
  ipcMain.on('mt::win::toggle-maximize', (event) => {
    const win = windowFromEvent(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('mt::win::maximize', (event) => {
    const win = windowFromEvent(event)
    if (win) win.maximize()
  })
  ipcMain.on('mt::win::unmaximize', (event) => {
    const win = windowFromEvent(event)
    if (win) win.unmaximize()
  })
  ipcMain.on('mt::win::close', (event) => {
    const win = windowFromEvent(event)
    if (win) win.close()
  })
  ipcMain.on('mt::win::set-fullscreen', (event, flag: boolean) => {
    const win = windowFromEvent(event)
    if (win) win.setFullScreen(!!flag)
  })
  ipcMain.on('mt::win::toggle-fullscreen', (event) => {
    const win = windowFromEvent(event)
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  ipcMain.handle('mt::win::is-maximized', (event) => {
    const win = windowFromEvent(event as unknown as IpcMainEvent)
    return !!win && win.isMaximized()
  })
  ipcMain.handle('mt::win::is-fullscreen', (event) => {
    const win = windowFromEvent(event as unknown as IpcMainEvent)
    return !!win && win.isFullScreen()
  })

  ipcMain.on('mt::menu::popup', (event, template: MenuTemplate, position?: MenuPopupPosition, popupId?: string) => {
    const win = windowFromEvent(event)
    if (!win) return
    // Stash sender BEFORE menu.popup so buildMenu click handlers can resolve
    // it, but make sure we still clean up the map entry if menu.popup throws
    // — otherwise the entry leaks and a later popup for the same window could
    // route clicks to a dead sender.
    const existing = popups.get(win.id)
    if (existing) closePopup(win.id, existing)
    const popup: PopupEntry = {
      sender: event.sender,
      popupId: popupId || '',
      selected: false,
      onSenderDestroyed: () => undefined
    }
    popup.onSenderDestroyed = () => closePopup(win.id, popup)
    event.sender.once('destroyed', popup.onSenderDestroyed)
    popups.set(win.id, popup)
    try {
      const menu = buildMenu(template, win.id, popup)
      menu.popup({
        window: win,
        x: position?.x,
        y: position?.y,
        // On Windows this may run before the chosen MenuItem.click. Keep the
        // one active session until click, the next popup, or sender teardown.
        callback: () => undefined
      })
    } catch (err) {
      closePopup(win.id, popup)
      log.error('menu popup failed:', err)
    }
  })

  ipcMain.on('mt::menu::popup-application', (event, position?: MenuPopupPosition) => {
    const win = windowFromEvent(event)
    if (!win) return
    try {
      const appMenu = Menu.getApplicationMenu()
      if (!appMenu) return
      appMenu.popup({ window: win, x: position?.x, y: position?.y })
    } catch (err) {
      log.error('application menu popup failed:', err)
    }
  })
}
