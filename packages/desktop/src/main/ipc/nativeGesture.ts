import type { WebContents } from 'electron'
import type { ElectronNativeGestureAdapter, NativeGestureBeginRequest } from '../nativeGesture/electron'

export interface NativeGestureIpcMain {
  handle(
    channel: 'mt::workspace::native-gesture-begin',
    listener: (event: { readonly sender: WebContents }, request: NativeGestureBeginRequest) => boolean
  ): void
  removeHandler?(channel: 'mt::workspace::native-gesture-begin'): void
}

/** T07's only IPC ingress: renderer source presses are bound to their sender endpoint. */
export const registerNativeGestureIpc = (
  ipc: NativeGestureIpcMain,
  adapter: ElectronNativeGestureAdapter
): (() => void) => {
  ipc.removeHandler?.('mt::workspace::native-gesture-begin')
  ipc.handle('mt::workspace::native-gesture-begin', (event, request) => adapter.begin(event.sender, request))
  return () => ipc.removeHandler?.('mt::workspace::native-gesture-begin')
}
