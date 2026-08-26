import path from 'node:path'
import { app } from 'electron'
import { CrashDraftStore } from '../crashDraftRecovery'
import type { CrashDraftCheckpoint } from '@shared/workspace'

type CrashDraftRequest =
  | { readonly kind: 'checkpoint'; readonly checkpoint: CrashDraftCheckpoint }
  | { readonly kind: 'saved'; readonly write: { readonly writeId: string; readonly documentId: string; readonly documentRevision: number } }
  | { readonly kind: 'discard'; readonly documentId: string; readonly documentRevision: number }

export interface CrashDraftWebContents {
  readonly id: number
  on?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
  removeListener?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
}

export interface CrashDraftIpcMain {
  handle(channel: 'mt::workspace::crash-draft', listener: (event: { readonly sender: CrashDraftWebContents }, request: CrashDraftRequest) => Promise<unknown>): void
  removeHandler?(channel: 'mt::workspace::crash-draft'): void
}

/** The sender identity comes from Electron, never from a renderer-supplied window id. */
export class CrashDraftElectronAdapter {
  private readonly endpoints = new Set<string>()

  constructor(readonly store = new CrashDraftStore(path.join(app.getPath('userData'), 'crash-drafts'))) {}

  attach(webContents: CrashDraftWebContents): () => void {
    const id = String(webContents.id)
    this.endpoints.add(id)
    const detach = (): void => {
      this.endpoints.delete(id)
      webContents.removeListener?.('destroyed', detach)
      webContents.removeListener?.('did-start-navigation', detach)
    }
    webContents.on?.('destroyed', detach)
    webContents.on?.('did-start-navigation', detach)
    return detach
  }

  async handle(sender: CrashDraftWebContents, request: CrashDraftRequest): Promise<unknown> {
    if (!this.endpoints.has(String(sender.id))) return { durable: false, reason: 'unauthenticated endpoint' }
    switch (request.kind) {
      case 'checkpoint': return this.store.checkpoint(request.checkpoint)
      case 'saved': return this.store.acknowledgeSave(request.write)
      case 'discard': return this.store.discard(request.documentId, request.documentRevision)
    }
  }
}

export const registerCrashDraftIpc = (ipc: CrashDraftIpcMain, adapter: CrashDraftElectronAdapter): (() => void) => {
  ipc.removeHandler?.('mt::workspace::crash-draft')
  ipc.handle('mt::workspace::crash-draft', (event, request) => adapter.handle(event.sender, request))
  return () => ipc.removeHandler?.('mt::workspace::crash-draft')
}

export const createProductionCrashDraftAdapter = (): CrashDraftElectronAdapter => new CrashDraftElectronAdapter()

export type { CrashDraftRequest }
