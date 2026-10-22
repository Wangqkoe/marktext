import { app, BrowserWindow } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'
import log from 'electron-log'

// Far enough outside every monitor layout that no part of the window is visible.
const OFFSCREEN_POSITION = -32000

/**
 * Local E2E runs set MARKTEXT_E2E_BACKGROUND=1 so test windows never cover the
 * desktop or take keyboard focus from whatever the developer is doing. The
 * PERF_TESTING guard keeps the switch inert outside Playwright launches.
 */
export const isE2eBackground = (): boolean =>
  process.env.PERF_TESTING === 'true' && process.env.MARKTEXT_E2E_BACKGROUND === '1'

// Background windows are never activated by the OS, so focus is tracked here
// instead and every focus API answers from this one record.
let focusedWindow: BrowserWindow | null = null

const setFocusedWindow = (win: BrowserWindow | null): void => {
  if (focusedWindow === win) return
  const previous = focusedWindow
  focusedWindow = win
  if (previous && !previous.isDestroyed()) previous.emit('blur')
  if (win) win.emit('focus')
}

// Without OS focus the renderer reports document.hasFocus() === false and skips
// :focus-visible; DevTools focus emulation restores what a focused page reports.
const emulateDocumentFocus = (win: BrowserWindow): void => {
  try {
    win.webContents.debugger.attach('1.3')
    win.webContents.debugger
      .sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
      .catch((error: unknown) => log.warn('E2E focus emulation failed:', error))
  } catch (error) {
    log.warn('E2E focus emulation unavailable:', error)
  }
}

/**
 * Must run before the app is ready because of the command-line switches:
 * Windows reports an off-screen window as occluded, and Chromium then
 * throttles its timers and animation frames, which slows specs into timeouts.
 */
export const configureE2eBackground = (): void => {
  if (!isE2eBackground()) return
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

  BrowserWindow.getFocusedWindow = () =>
    focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : null
  BrowserWindow.prototype.focus = function(this: BrowserWindow) {
    if (!this.isVisible()) this.showInactive()
    setFocusedWindow(this)
  }
  BrowserWindow.prototype.isFocused = function(this: BrowserWindow) {
    return focusedWindow === this
  }

  app.on('browser-window-created', (_event, win) => {
    emulateDocumentFocus(win)
    win.once('closed', () => {
      if (focusedWindow !== win) return
      // Like the OS, hand focus to the most recently opened remaining window.
      const remaining = BrowserWindow.getAllWindows().filter((other) => other !== win && other.isVisible())
      setFocusedWindow(remaining.at(-1) ?? null)
    })
  })
}

export const applyBackgroundWindowOptions = (options: BrowserWindowConstructorOptions): void => {
  if (!isE2eBackground()) return
  options.x = OFFSCREEN_POSITION
  options.y = OFFSCREEN_POSITION
  options.show = false
  options.skipTaskbar = true
  options.webPreferences = { ...options.webPreferences, backgroundThrottling: false }
}

/** Shows and focuses the window through the tracked focus, never activating it. */
export const revealInBackground = (win: BrowserWindow): void => {
  win.focus()
}
