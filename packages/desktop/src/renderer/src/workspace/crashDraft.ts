import type { CrashDraftCheckpoint, CrashDraftRecoveryPayload } from '@shared/workspace'

export type CrashDraftEndpointRequest =
  | { readonly kind: 'checkpoint'; readonly checkpoint: CrashDraftCheckpoint }
  | { readonly kind: 'saved'; readonly receipt: string }
  | { readonly kind: 'discard'; readonly receipt: string }
  | { readonly kind: 'recover' }
  | { readonly kind: 'mark-clean' }

export type CrashDraftEndpointResponse =
  | { readonly durable: true; readonly receipt?: string; readonly recoveries?: readonly CrashDraftRecoveryPayload[] }
  | { readonly durable: false; readonly reason: string }

/** Typed, narrow renderer endpoint; the controller never sees the durable store. */
export const createElectronCrashDraftPort = (): { request(request: CrashDraftEndpointRequest): Promise<CrashDraftEndpointResponse> } => ({
  request: request => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', request) as Promise<CrashDraftEndpointResponse>
})
