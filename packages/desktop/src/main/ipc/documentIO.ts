import {
  ChokidarFileObservationWatchFactory,
  FileObservationHub,
  NodeFileObservationStorage
} from '../filesystem/fileObservation'
import { BrowserWindow, dialog, type SaveDialogReturnValue, type WebContents } from 'electron'
import { DocumentIOCoordinator, type DocumentIoEndpoint } from '../filesystem/documentIO'
import type {
  DocumentIoCloseDecision,
  DocumentIoCloseDecisionRequest,
  DocumentIoRequest,
  DocumentIoObservation,
  DocumentIoTargetSelection,
  DocumentIoTargetSelectionRequest,
  DocumentSaveAck
} from '@shared/workspace/documentIo'

export interface DocumentIoWebContents {
  readonly id: number
  isDestroyed?(): boolean
  send(channel: 'mt::workspace::document-io-observation', observation: DocumentIoObservation): void
  on?(
    event: 'destroyed' | 'did-start-navigation',
    listener: (details: { readonly isMainFrame?: boolean; readonly isSameDocument?: boolean }) => void
  ): void
  removeListener?(
    event: 'destroyed' | 'did-start-navigation',
    listener: (details: { readonly isMainFrame?: boolean; readonly isSameDocument?: boolean }) => void
  ): void
}

export interface DocumentIoIpcMain {
  handle(
    channel: 'mt::workspace::document-io',
    listener: (event: { readonly sender: DocumentIoWebContents }, request: DocumentIoRequest) => Promise<DocumentSaveAck>
  ): void
  handle(
    channel: 'mt::workspace::choose-document-path',
    listener: (event: { readonly sender: DocumentIoWebContents }, request: DocumentIoTargetSelectionRequest) => Promise<DocumentIoTargetSelection>
  ): void
  handle(
    channel: 'mt::workspace::confirm-document-close',
    listener: (event: { readonly sender: DocumentIoWebContents }, request: DocumentIoCloseDecisionRequest) => Promise<DocumentIoCloseDecision>
  ): void
  removeHandler?(channel: 'mt::workspace::document-io' | 'mt::workspace::choose-document-path' | 'mt::workspace::confirm-document-close'): void
}

/** Keep Electron's native dialog shape at this narrow main-process boundary. */
export const toDocumentIoTargetSelection = (result: SaveDialogReturnValue): DocumentIoTargetSelection =>
  !result.canceled && result.filePath
    ? { status: 'selected', pathname: result.filePath }
    : { status: 'cancelled' }

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
    const detachForNavigation = (details: {
      readonly isMainFrame?: boolean
      readonly isSameDocument?: boolean
    }): void => {
      if (details.isMainFrame && !details.isSameDocument) detach()
    }
    const detach = (): void => {
      if (this.detachBySender.get(senderId) !== detach) return
      this.detachBySender.delete(senderId)
      releaseEndpoint()
      webContents.removeListener?.('destroyed', detach)
      webContents.removeListener?.('did-start-navigation', detachForNavigation)
    }
    this.detachBySender.set(senderId, detach)
    webContents.on?.('destroyed', detach)
    webContents.on?.('did-start-navigation', detachForNavigation)
    return detach
  }

  handle(sender: DocumentIoWebContents, request: DocumentIoRequest): Promise<DocumentSaveAck> {
    return this.coordinator.request(String(sender.id), request)
  }

  async chooseSaveTarget(
    sender: DocumentIoWebContents,
    request: DocumentIoTargetSelectionRequest
  ): Promise<DocumentIoTargetSelection> {
    const window = BrowserWindow.fromWebContents(sender as unknown as WebContents)
    const result = window
      ? await dialog.showSaveDialog(window, { defaultPath: request.suggestedPath })
      : await dialog.showSaveDialog({ defaultPath: request.suggestedPath })
    return toDocumentIoTargetSelection(result)
  }

  async confirmClose(
    sender: DocumentIoWebContents,
    request: DocumentIoCloseDecisionRequest
  ): Promise<DocumentIoCloseDecision> {
    const window = BrowserWindow.fromWebContents(sender as unknown as WebContents)
    const result = window
      ? await dialog.showMessageBox(window, {
        type: 'warning',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: `Save changes to ${request.title}?`,
        noLink: true
      })
      : await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: `Save changes to ${request.title}?`,
        noLink: true
      })
    return result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel'
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
  ipc.removeHandler?.('mt::workspace::choose-document-path')
  ipc.removeHandler?.('mt::workspace::confirm-document-close')
  ipc.handle('mt::workspace::document-io', (event, request) => adapter.handle(event.sender, request))
  ipc.handle('mt::workspace::choose-document-path', (event, request) =>
    adapter.chooseSaveTarget(event.sender, request)
  )
  ipc.handle('mt::workspace::confirm-document-close', (event, request) =>
    adapter.confirmClose(event.sender, request)
  )
  return () => {
    ipc.removeHandler?.('mt::workspace::document-io')
    ipc.removeHandler?.('mt::workspace::choose-document-path')
    ipc.removeHandler?.('mt::workspace::confirm-document-close')
  }
}

export const createProductionDocumentIoAdapter = (): DocumentIoElectronAdapter =>
  new DocumentIoElectronAdapter(
    new DocumentIOCoordinator(
      new FileObservationHub(new NodeFileObservationStorage(), new ChokidarFileObservationWatchFactory())
    )
  )
