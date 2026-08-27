import type { NativeExternalReleasePoint } from 'main_renderer/tabTransfer'

export interface NativeGestureCommitMessage { readonly gestureId: string; readonly releasePoint: NativeExternalReleasePoint }

/** Scripted PointerEvents cannot establish the native global-gesture session. */
export const isTrustedPrimaryTabPress = (event: Pick<PointerEvent, 'button' | 'isTrusted'>): boolean =>
  event.isTrusted === true && event.button === 0

/** T07's renderer edge exposes only source-press registration and native commit. */
export const createElectronNativeGesturePort = (): {
  begin(gestureId: string): Promise<boolean>
  bindCommit(handler: (message: NativeGestureCommitMessage) => void): () => void
} => ({
  begin: gestureId => window.electron.ipcRenderer.invoke('mt::workspace::native-gesture-begin', { gestureId }) as Promise<boolean>,
  bindCommit: handler => window.electron.ipcRenderer.on(
    'mt::workspace::native-gesture-commit',
    (_event, payload) => handler(payload as NativeGestureCommitMessage)
  )
})
