import type {
  DocumentIoAcceptReadRequest,
  DocumentIoBindingRequest,
  DocumentIoObservation,
  DocumentIoPort,
  DocumentIoReadOptions,
  DocumentIoReadResult,
  DocumentIoRequest,
  DocumentIoSaveRequest,
  DocumentIoCloseDecision,
  DocumentIoCloseDecisionRequest,
  DocumentIoSyncRequest,
  DocumentIoTargetSelection,
  DocumentIoTargetSelectionRequest,
  DocumentSaveAck
} from '@shared/workspace/documentIo'

export interface RendererDocumentBinding {
  readonly documentId: string
  readonly ownerFence: string
  readonly pathname: string
  readonly documentRevision: number
  readonly dirty: boolean
}

/**
 * Renderer-side narrow adapter. It holds no lease/capability and accepts a
 * durable result once only when its current binding still exactly matches.
 */
export class RendererDocumentIoAdapter {
  private readonly bindings = new Map<string, RendererDocumentBinding>()
  private readonly acceptedRequestIds = new Set<string>()
  private nextReadId = 0
  private readonly unsubscribe: () => void
  private disposed = false

  constructor(
    private readonly port: DocumentIoPort,
    private readonly onObservation: (observation: DocumentIoObservation) => void
  ) {
    this.unsubscribe = port.subscribe((observation) => this.receiveObservation(observation))
  }

  async bind(request: DocumentIoBindingRequest): Promise<DocumentSaveAck> {
    if (this.disposed) return this.rejected(request, 'renderer adapter is disposed')
    const ack = await this.port.request(request)
    if (this.disposed) {
      if (ack.status === 'bound') {
        await this.port.request({
          kind: 'unbind',
          requestId: `late-dispose:${ack.ownerFence}`,
          documentId: ack.documentId,
          ownerFence: ack.ownerFence
        })
      }
      return ack
    }
    if (ack.status !== 'bound' || ack.requestId !== request.requestId || ack.documentId !== request.documentId) {
      return ack
    }
    for (const [ownerFence, binding] of this.bindings) {
      if (binding.documentId === ack.documentId) this.bindings.delete(ownerFence)
    }
    this.bindings.set(ack.ownerFence, {
      documentId: ack.documentId,
      ownerFence: ack.ownerFence,
      pathname: request.pathname,
      documentRevision: request.documentRevision,
      dirty: request.dirty
    })
    return ack
  }

  async save(request: DocumentIoSaveRequest): Promise<DocumentSaveAck> {
    if (request.kind === 'save-as' && request.ownerFence === undefined) {
      if (this.disposed) return this.rejected(request, 'renderer adapter is disposed')
      const ack = await this.port.request(request)
      if (this.disposed) {
        if (ack.status === 'durable-success') {
          await this.port.request({
            kind: 'unbind',
            requestId: `late-dispose:${ack.ownerFence}`,
            documentId: ack.documentId,
            ownerFence: ack.ownerFence
          })
        }
        return this.rejected(request, 'renderer adapter was disposed before Save As acknowledgment')
      }
      if (
        ack.status === 'durable-success' &&
        ack.requestId === request.requestId &&
        ack.documentId === request.documentId &&
        ack.documentRevision === request.documentRevision &&
        !this.acceptedRequestIds.has(request.requestId)
      ) {
        this.acceptedRequestIds.add(request.requestId)
        this.bindings.set(ack.ownerFence, {
          documentId: ack.documentId,
          ownerFence: ack.ownerFence,
          pathname: request.targetPathname ?? '',
          documentRevision: request.documentRevision,
          dirty: false
        })
      }
      return ack
    }
    if (!request.ownerFence) return this.rejected(request, 'missing renderer owner fence')
    const binding = this.bindings.get(request.ownerFence)
    if (
      this.disposed ||
      !binding ||
      binding.documentId !== request.documentId ||
      binding.ownerFence !== request.ownerFence
    ) {
      return this.rejected(request, 'stale renderer owner fence')
    }
    const ack = await this.port.request(request)
    if (
      ack.status === 'durable-success' &&
      ack.requestId === request.requestId &&
      ack.documentId === binding.documentId &&
      ack.documentRevision === request.documentRevision &&
      ack.ownerFence === binding.ownerFence &&
      !this.acceptedRequestIds.has(request.requestId) &&
      this.bindings.get(binding.ownerFence) === binding
    ) {
      this.acceptedRequestIds.add(request.requestId)
      this.bindings.set(binding.ownerFence, {
        ...binding,
        pathname: request.kind === 'save' ? binding.pathname : request.targetPathname ?? binding.pathname,
        documentRevision: request.documentRevision,
        dirty: false
      })
    }
    return ack
  }

  async sync(request: DocumentIoSyncRequest): Promise<DocumentSaveAck> {
    const binding = this.bindings.get(request.ownerFence)
    if (
      this.disposed ||
      !binding ||
      binding.documentId !== request.documentId ||
      binding.ownerFence !== request.ownerFence
    ) {
      return this.rejected(request, 'stale renderer owner fence')
    }
    const ack = await this.port.request(request)
    if (
      ack.status === 'bound' &&
      ack.requestId === request.requestId &&
      ack.documentId === request.documentId &&
      ack.ownerFence === request.ownerFence &&
      this.bindings.get(binding.ownerFence) === binding
    ) {
      this.bindings.set(binding.ownerFence, {
        ...binding,
        documentRevision: request.documentRevision,
        dirty: request.dirty
      })
    }
    return ack
  }

  async unbind(documentId: string, ownerFence: string): Promise<DocumentSaveAck> {
    const binding = this.bindings.get(ownerFence)
    if (!binding || binding.documentId !== documentId) {
      return {
        status: 'rejected',
        requestId: `unbind:stale:${ownerFence}`,
        documentId,
        ownerFence,
        reason: 'stale renderer owner fence'
      }
    }
    this.bindings.delete(ownerFence)
    return this.port.request({
      kind: 'unbind',
      requestId: `unbind:${ownerFence}`,
      documentId,
      ownerFence
    })
  }

  /** Read the document's bound file through its current owner fence. */
  async read(documentId: string, options: DocumentIoReadOptions): Promise<DocumentIoReadResult> {
    const binding = this.bindingForDocument(documentId)
    const requestId = `read:${documentId}:${++this.nextReadId}`
    if (this.disposed || !binding || !this.port.read) {
      return { status: 'rejected', requestId, documentId, reason: 'no current file binding' }
    }
    const result = await this.port.read({ kind: 'read', requestId, documentId, ownerFence: binding.ownerFence, options })
    if (this.disposed || this.bindings.get(binding.ownerFence) !== binding) {
      return { status: 'rejected', requestId, documentId, reason: 'binding changed during read' }
    }
    return result
  }

  async acceptRead(documentId: string, ownerFence: string, readToken: string): Promise<DocumentSaveAck> {
    const request: DocumentIoAcceptReadRequest = {
      kind: 'accept-read',
      requestId: `accept-read:${documentId}:${++this.nextReadId}`,
      documentId,
      ownerFence,
      readToken
    }
    const binding = this.bindings.get(ownerFence)
    if (this.disposed || !binding || binding.documentId !== documentId || !this.port.acceptRead) {
      return { status: 'rejected', requestId: request.requestId, documentId, ownerFence, reason: 'stale renderer owner fence' }
    }
    return this.port.acceptRead(request)
  }

  private bindingForDocument(documentId: string): RendererDocumentBinding | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.documentId === documentId) return binding
    }
    return undefined
  }

  getBinding(ownerFence: string): RendererDocumentBinding | undefined {
    return this.bindings.get(ownerFence)
  }

  chooseSaveTarget(request: DocumentIoTargetSelectionRequest): Promise<DocumentIoTargetSelection> {
    return this.port.chooseSaveTarget?.(request) ?? Promise.resolve({ status: 'cancelled' })
  }

  confirmClose(request: DocumentIoCloseDecisionRequest): Promise<DocumentIoCloseDecision> {
    return this.port.confirmClose?.(request) ?? Promise.resolve('cancel')
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
    const bindings = [...this.bindings.values()]
    this.bindings.clear()
    await Promise.all(
      bindings.map((binding) =>
        this.port.request({
          kind: 'unbind',
          requestId: `dispose:${binding.ownerFence}`,
          documentId: binding.documentId,
          ownerFence: binding.ownerFence
        })
      )
    )
  }

  private receiveObservation(observation: DocumentIoObservation): void {
    if (this.disposed) return
    const binding = this.bindings.get(observation.ownerFence)
    if (
      !binding ||
      binding.documentId !== observation.documentId
    ) {
      return
    }
    this.onObservation(observation)
  }

  private rejected(request: DocumentIoRequest, reason: string): DocumentSaveAck {
    return {
      status: 'rejected',
      requestId: request.requestId,
      documentId: request.documentId,
      ...(request.kind === 'bind' ? {} : { ownerFence: request.ownerFence }),
      reason
    }
  }
}

/** Production typed preload transport. */
export const createElectronDocumentIoPort = (): DocumentIoPort => ({
  request: (request) => window.electron.ipcRenderer.invoke('mt::workspace::document-io', request),
  chooseSaveTarget: (request) =>
    window.electron.ipcRenderer.invoke('mt::workspace::choose-document-path', request),
  confirmClose: (request) =>
    window.electron.ipcRenderer.invoke('mt::workspace::confirm-document-close', request),
  read: (request) => window.electron.ipcRenderer.invoke('mt::workspace::document-io-read', request),
  acceptRead: (request) =>
    window.electron.ipcRenderer.invoke('mt::workspace::document-io-accept-read', request),
  subscribe: (listener) =>
    window.electron.ipcRenderer.on('mt::workspace::document-io-observation', (_event, observation) =>
      listener(observation)
    )
})
