export interface NativeGestureCommitMessage { readonly gestureId: string }

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
