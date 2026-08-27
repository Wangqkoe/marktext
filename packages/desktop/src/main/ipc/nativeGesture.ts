import type { WebContents } from 'electron'
import { isNativeGestureBeginRequest, type NativeGestureBeginRequest } from '../nativeGesture/electron'

export interface NativeGestureIpcMain {
  handle(
    channel: 'mt::workspace::native-gesture-begin',
    listener: (event: { readonly sender: WebContents }, request: unknown) => boolean
  ): void
  removeHandler?(channel: 'mt::workspace::native-gesture-begin'): void
}

export interface NativeGestureBeginAdapter {
  begin(sender: WebContents, request: NativeGestureBeginRequest): boolean
}

/** T07's only IPC ingress: renderer source presses are bound to their sender endpoint. */
export const registerNativeGestureIpc = (
  ipc: NativeGestureIpcMain,
  adapter: NativeGestureBeginAdapter
): (() => void) => {
  ipc.removeHandler?.('mt::workspace::native-gesture-begin')
  ipc.handle('mt::workspace::native-gesture-begin', (event, request) => {
    if (!isNativeGestureBeginRequest(request)) return false
    return adapter.begin(event.sender, request)
  })
  return () => ipc.removeHandler?.('mt::workspace::native-gesture-begin')
}
