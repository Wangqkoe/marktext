import { BrowserWindow, screen, type WebContents } from 'electron'
import { UiohookKey, uIOhook, type UiohookKeyboardEvent, type UiohookMouseEvent } from 'uiohook-napi'
import type { TabTransferElectronAdapter } from '../ipc/transfer'
import {
  NativeGestureAdapter,
  isSupportedWindowsNativeGestureCapability,
  type NativeGestureCapability,
  type NativeGestureInput
} from './index'

export interface NativeGestureBeginRequest { readonly gestureId: string }
export interface NativeGestureCommitMessage { readonly gestureId: string }

/**
 * Windows-only uiohook bridge. It is intentionally one process-global observer:
 * a second source press replaces the prior active gesture, and dispose stops the
 * helper and releases every listener.
 */
export class ElectronNativeGestureAdapter {
  private started = false
  private readonly adapter = new NativeGestureAdapter({
    capability: () => this.capability(),
    endpointCurrent: endpoint => this.transfer().transport.authenticate(endpoint)
  })

  private readonly onMouseMove = (event: UiohookMouseEvent): void => this.input({ kind: 'move', x: event.x, y: event.y })
  private readonly onMouseUp = (event: UiohookMouseEvent): void => {
    // uiohook uses button 1 for the primary (left) mouse button. Do not
    // inspect injected/remote flags: the event-level and session checks are
    // the product trust boundary.
    if (event.button === 1) this.input({ kind: 'left-up', x: event.x, y: event.y })
  }

  private readonly onKeyDown = (event: UiohookKeyboardEvent): void => {
    if (event.keycode === UiohookKey.Escape) this.adapter.input({ kind: 'escape' })
  }

  constructor(private readonly transfer: () => TabTransferElectronAdapter) {}

  start(): boolean {
    try {
      if (this.started) return this.available()
      if (!this.supportedShape()) return false
      uIOhook.on('mousemove', this.onMouseMove)
      uIOhook.on('mouseup', this.onMouseUp)
      uIOhook.on('keydown', this.onKeyDown)
      uIOhook.start()
      this.started = true
      if (!this.available()) throw new Error('native gesture capability changed while starting')
      return true
    } catch {
      this.removeListeners()
      try { uIOhook.stop() } catch {}
      this.started = false
      return false
    }
  }

  begin(sender: WebContents, request: NativeGestureBeginRequest): boolean {
    if (!this.start() || !validGestureId(request.gestureId)) return false
    const endpoint = this.transfer().endpointFor(sender as never)
    const window = BrowserWindow.fromWebContents(sender)
    if (!endpoint || !window || window.isDestroyed()) return false
    return this.adapter.begin({
      gestureId: request.gestureId,
      source: {
        endpoint,
        getBounds: () => window.getBounds(),
        dipToPhysical: bounds => screen.dipToScreenRect(window, bounds)
      },
      commit: ({ gestureId }) => {
        if (!this.transfer().transport.authenticate(endpoint) || sender.isDestroyed()) return
        sender.send('mt::workspace::native-gesture-commit', { gestureId } satisfies NativeGestureCommitMessage)
      }
    })
  }

  blur(): void { this.adapter.blur() }
  timeout(gestureId: string): void { this.adapter.timeout(gestureId) }

  dispose(): void {
    this.adapter.dispose()
    this.removeListeners()
    if (this.started) {
      try { uIOhook.stop() } catch {}
      this.started = false
    }
  }

  private input(input: NativeGestureInput): void { this.adapter.input(input) }

  private supportedShape(): boolean { return isSupportedWindowsNativeGestureCapability(this.capability(true)) }
  private available(): boolean { return isSupportedWindowsNativeGestureCapability(this.capability(this.started)) }

  private capability(observerReady = this.started): NativeGestureCapability {
    return {
      platform: process.platform,
      observerReady,
      electronMajor: Number.parseInt(process.versions.electron.split('.')[0] ?? '', 10),
      displays: screen.getAllDisplays().map(display => ({
        id: display.id,
        primary: display.id === screen.getPrimaryDisplay().id,
        scaleFactor: display.scaleFactor,
        bounds: { ...display.bounds }
      }))
    }
  }

  private removeListeners(): void {
    uIOhook.removeListener('mousemove', this.onMouseMove)
    uIOhook.removeListener('mouseup', this.onMouseUp)
    uIOhook.removeListener('keydown', this.onKeyDown)
  }
}

const validGestureId = (gestureId: string): boolean => gestureId.length > 0 && gestureId.length <= 128
