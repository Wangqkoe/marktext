import {
  ChokidarFileObservationWatchFactory,
  FileObservationHub,
  NodeFileObservationStorage
} from '../filesystem/fileObservation'
import { DocumentIOCoordinator, type DocumentIoEndpoint } from '../filesystem/documentIO'
import type { DocumentIoRequest, DocumentIoObservation, DocumentSaveAck } from '@shared/workspace/documentIo'

export interface DocumentIoWebContents {
  readonly id: number
  isDestroyed?(): boolean
  send(channel: 'mt::workspace::document-io-observation', observation: DocumentIoObservation): void
  on?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
  removeListener?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
}

export interface DocumentIoIpcMain {
  handle(
    channel: 'mt::workspace::document-io',
    listener: (event: { readonly sender: DocumentIoWebContents }, request: DocumentIoRequest) => Promise<DocumentSaveAck>
  ): void
  removeHandler?(channel: 'mt::workspace::document-io'): void
}

/** Typed Electron adapter; payload window IDs are ignored in favour of event.sender. */
export class DocumentIoElectronAdapter {
  private readonly detachBySender = new Map<string, () => void>()

  constructor(private readonly coordinator: DocumentIOCoordinator) {}

  attach(webContents: DocumentIoWebContents, sessionId: string): () => void {
    const senderId = String(webContents.id)
    this.detach(senderId)
    const endpoint: DocumentIoEndpoint = {
      id: senderId,
      sessionId,
      send: (observation) => {
        if (!webContents.isDestroyed?.()) {
          webContents.send('mt::workspace::document-io-observation', observation)
        }
      }
    }
    const releaseEndpoint = this.coordinator.registerEndpoint(endpoint)
    const detach = (): void => {
      if (this.detachBySender.get(senderId) !== detach) return
      this.detachBySender.delete(senderId)
      releaseEndpoint()
      webContents.removeListener?.('destroyed', detach)
      webContents.removeListener?.('did-start-navigation', detach)
    }
    this.detachBySender.set(senderId, detach)
    webContents.on?.('destroyed', detach)
    webContents.on?.('did-start-navigation', detach)
    return detach
  }

  handle(sender: DocumentIoWebContents, request: DocumentIoRequest): Promise<DocumentSaveAck> {
    return this.coordinator.request(String(sender.id), request)
  }

  dispose(): void {
    for (const detach of [...this.detachBySender.values()]) detach()
    this.coordinator.dispose()
  }

  private detach(senderId: string): void {
    this.detachBySender.get(senderId)?.()
  }
}

/** T04b registration point. T06 adds transfer/startup handlers in its own section. */
export const registerDocumentIoIpc = (
  ipc: DocumentIoIpcMain,
  adapter: DocumentIoElectronAdapter
): (() => void) => {
  ipc.removeHandler?.('mt::workspace::document-io')
  ipc.handle('mt::workspace::document-io', (event, request) => adapter.handle(event.sender, request))
  return () => ipc.removeHandler?.('mt::workspace::document-io')
}

export const createProductionDocumentIoAdapter = (): DocumentIoElectronAdapter =>
  new DocumentIoElectronAdapter(
    new DocumentIOCoordinator(
      new FileObservationHub(new NodeFileObservationStorage(), new ChokidarFileObservationWatchFactory())
    )
  )
