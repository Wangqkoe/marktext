import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { CrashDraftStore } from '../crashDraftRecovery'
import type { CrashDraftCheckpoint } from '@shared/workspace'

export type CrashDraftRequest =
  | { readonly kind: 'checkpoint'; readonly checkpoint: CrashDraftCheckpoint }
  | { readonly kind: 'saved'; readonly receipt: string }
  | { readonly kind: 'discard'; readonly receipt: string }
  | { readonly kind: 'mark-clean' }

export type CrashDraftResponse =
  | { readonly durable: true; readonly receipt?: string }
  | { readonly durable: false; readonly reason: string }

export interface CrashDraftWebContents {
  readonly id: number
  on?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
  removeListener?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
}

export interface CrashDraftIpcMain {
  handle(channel: 'mt::workspace::crash-draft', listener: (event: { readonly sender: CrashDraftWebContents }, request: CrashDraftRequest) => Promise<CrashDraftResponse>): void
  removeHandler?(channel: 'mt::workspace::crash-draft'): void
}

/** The sender identity comes from Electron, never from a renderer-supplied window id. */
export class CrashDraftElectronAdapter {
  private readonly endpoints = new Set<string>()
  private readonly endpointEpochs = new Map<string, string>()
  private readonly receipts = new Map<string, { readonly endpointEpoch: string; readonly write: { readonly writeId: string; readonly documentId: string; readonly documentRevision: number } }>()

  constructor(readonly store = new CrashDraftStore(path.join(app.getPath('userData'), 'crash-drafts'))) {}

  attach(webContents: CrashDraftWebContents): () => void {
    const id = String(webContents.id)
    this.endpoints.add(id)
    const endpointEpoch = randomUUID()
    this.endpointEpochs.set(id, endpointEpoch)
    const detach = (): void => {
      this.endpoints.delete(id)
      if (this.endpointEpochs.get(id) === endpointEpoch) this.endpointEpochs.delete(id)
      for (const [receipt, pending] of this.receipts) if (pending.endpointEpoch === endpointEpoch) this.receipts.delete(receipt)
      webContents.removeListener?.('destroyed', detach)
      webContents.removeListener?.('did-start-navigation', detach)
    }
    webContents.on?.('destroyed', detach)
    webContents.on?.('did-start-navigation', detach)
    return detach
  }

  async handle(sender: CrashDraftWebContents, request: CrashDraftRequest): Promise<CrashDraftResponse> {
    if (!this.endpoints.has(String(sender.id))) return { durable: false, reason: 'unauthenticated endpoint' }
    switch (request.kind) {
      case 'checkpoint': {
        const write = this.store.beginCheckpoint(request.checkpoint)
        const ack = await this.store.acknowledge(write)
        if (!ack.durable) return ack
        const receipt = randomUUID()
        this.receipts.set(receipt, { endpointEpoch: this.endpointEpochs.get(String(sender.id))!, write })
        return { durable: true, receipt }
      }
      case 'saved': return this.resolve(sender, request.receipt, 'saved')
      case 'discard': return this.resolve(sender, request.receipt, 'discard')
      case 'mark-clean': return this.store.markCleanShutdown()
    }
  }

  private async resolve(sender: CrashDraftWebContents, receipt: string, action: 'saved' | 'discard'): Promise<CrashDraftResponse> {
    const pending = this.receipts.get(receipt)
    if (!pending || pending.endpointEpoch !== this.endpointEpochs.get(String(sender.id))) return { durable: false, reason: 'stale checkpoint receipt' }
    const result = action === 'saved'
      ? this.store.acknowledgeSave(pending.write)
      : this.store.discard(pending.write.documentId, pending.write.documentRevision)
    const ack = await result
    if (ack.durable) this.receipts.delete(receipt)
    return ack
  }
}

export const registerCrashDraftIpc = (ipc: CrashDraftIpcMain, adapter: CrashDraftElectronAdapter): (() => void) => {
  ipc.removeHandler?.('mt::workspace::crash-draft')
  ipc.handle('mt::workspace::crash-draft', (event, request) => adapter.handle(event.sender, request))
  return () => ipc.removeHandler?.('mt::workspace::crash-draft')
}

export const createProductionCrashDraftAdapter = (): CrashDraftElectronAdapter => new CrashDraftElectronAdapter()
