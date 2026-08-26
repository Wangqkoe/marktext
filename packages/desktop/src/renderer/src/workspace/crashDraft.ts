import type { CrashDraftCheckpoint } from '@shared/workspace'

export type CrashDraftEndpointRequest =
  | { readonly kind: 'checkpoint'; readonly checkpoint: CrashDraftCheckpoint }
  | { readonly kind: 'saved'; readonly write: { readonly writeId: string; readonly documentId: string; readonly documentRevision: number } }
  | { readonly kind: 'discard'; readonly documentId: string; readonly documentRevision: number }

/** Typed, narrow renderer endpoint; the controller never sees the durable store. */
export const createElectronCrashDraftPort = (): { request(request: CrashDraftEndpointRequest): Promise<unknown> } => ({
  request: request => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', request)
})
