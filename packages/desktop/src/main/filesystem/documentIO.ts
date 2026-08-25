import { randomUUID } from 'crypto'
import { encodeMarkdown } from './markdown'
import {
  FileObservationHub,
  type DiskChange,
  type FileObservationLease,
  type FileObservationSubscriber,
  type GuardedSaveResult
} from './fileObservation'
import type {
  DocumentIoBindingRequest,
  DocumentIoObservation,
  DocumentIoRequest,
  DocumentIoSaveRequest,
  DocumentSaveAck
} from '@shared/workspace/documentIo'
import type { CanonicalFileKey, DiskRevision } from '@shared/workspace/fileObservation'

/** The authenticated, current Electron endpoint; payload window IDs are never used. */
export interface DocumentIoEndpoint {
  readonly id: string
  readonly sessionId: string
  send(observation: DocumentIoObservation): void
}

interface Binding {
  readonly endpoint: DocumentIoEndpoint
  readonly documentId: string
  readonly ownerFence: string
  fileKey: CanonicalFileKey
  observedDiskRevision: DiskRevision | null
  documentRevision: number
  dirty: boolean
  lease: FileObservationLease
  readonly saveAcks: Map<string, DocumentSaveAck>
}

const rejected = (request: DocumentIoRequest, reason: string): DocumentSaveAck => ({
  status: 'rejected',
  requestId: request.requestId,
  documentId: request.documentId,
  ...(request.kind === 'bind' ? {} : { ownerFence: request.ownerFence }),
  reason
})

/**
 * The only production facade for T04's observer and guarded save core.  It
 * retains leases, canonical keys, revisions and watcher generations in main.
 */
export class DocumentIOCoordinator {
  private readonly endpoints = new Map<string, DocumentIoEndpoint>()
  private readonly bindings = new Map<string, Binding>()

  constructor(private readonly hub: FileObservationHub) {}

  registerEndpoint(endpoint: DocumentIoEndpoint): () => void {
    this.revokeEndpoint(endpoint.id)
    this.endpoints.set(endpoint.id, endpoint)
    return () => this.revokeEndpoint(endpoint.id)
  }

  async request(senderId: string, request: DocumentIoRequest): Promise<DocumentSaveAck> {
    const endpoint = this.endpoints.get(senderId)
    if (!endpoint) return rejected(request, 'unknown or revoked sender')
    if (request.kind === 'bind') return this.bind(endpoint, request)
    const binding = this.bindings.get(request.ownerFence)
    if (!binding || !this.isCurrentBinding(binding, endpoint, request.documentId)) {
      return rejected(request, 'stale or mismatched owner fence')
    }
    if (request.kind === 'unbind') {
      this.revokeBinding(binding)
      return { status: 'unbound', requestId: request.requestId, documentId: request.documentId }
    }
    if (request.kind === 'sync') {
      binding.documentRevision = request.documentRevision
      binding.dirty = request.dirty
      if (!(await this.hub.refreshDocumentRevision(binding.lease, request.documentRevision))) {
        return rejected(request, 'revoked observation lease')
      }
      return {
        status: 'bound',
        requestId: request.requestId,
        documentId: binding.documentId,
        ownerFence: binding.ownerFence
      }
    }
    const replay = binding.saveAcks.get(request.requestId)
    if (replay) return replay
    const ack = await this.save(binding, request)
    binding.saveAcks.set(request.requestId, ack)
    return ack
  }

  revokeEndpoint(senderId: string): void {
    this.endpoints.delete(senderId)
    for (const binding of [...this.bindings.values()]) {
      if (binding.endpoint.id === senderId) this.revokeBinding(binding)
    }
  }

  revokeOwner(ownerFence: string): void {
    const binding = this.bindings.get(ownerFence)
    if (binding) this.revokeBinding(binding)
  }

  dispose(): void {
    for (const binding of [...this.bindings.values()]) this.revokeBinding(binding)
    this.endpoints.clear()
  }

  private async bind(
    endpoint: DocumentIoEndpoint,
    request: DocumentIoBindingRequest
  ): Promise<DocumentSaveAck> {
    for (const binding of [...this.bindings.values()]) {
      if (binding.endpoint.id === endpoint.id && binding.documentId === request.documentId) {
        this.revokeBinding(binding)
      }
    }
    const fileKey = await this.hub.canonicalFileKey(request.pathname)
    const ownerFence = randomUUID()
    let binding!: Binding
    const subscriber: FileObservationSubscriber = {
      documentId: request.documentId,
      documentRevision: request.documentRevision,
      fileKey,
      getState: () => (binding.dirty ? 'dirty' : 'clean'),
      onDiskChange: (change) => this.notify(binding, change)
    }
    const lease = await this.hub.subscribe(subscriber)
    binding = {
      endpoint,
      documentId: request.documentId,
      ownerFence,
      fileKey,
      observedDiskRevision: await this.hub.getDiskRevision(fileKey),
      documentRevision: request.documentRevision,
      dirty: request.dirty,
      lease,
      saveAcks: new Map()
    }
    this.bindings.set(ownerFence, binding)
    return {
      status: 'bound',
      requestId: request.requestId,
      documentId: request.documentId,
      ownerFence
    }
  }

  private async save(binding: Binding, request: DocumentIoSaveRequest): Promise<DocumentSaveAck> {
    if (!(await this.hub.refreshDocumentRevision(binding.lease, request.documentRevision))) {
      return rejected(request, 'revoked observation lease')
    }
    binding.documentRevision = request.documentRevision
    const target = request.kind === 'save' ? binding.fileKey : request.targetPathname
    if (!target) return rejected(request, 'Save As and rename require a target path')
    const targetKey = await this.hub.canonicalFileKey(target)
    if (targetKey === binding.fileKey) return this.saveBound(binding, request)
    return this.saveAndRebind(binding, request, targetKey)
  }

  private async saveBound(binding: Binding, request: DocumentIoSaveRequest): Promise<DocumentSaveAck> {
    let result: GuardedSaveResult
    try {
      result = await this.guardedSave(
        binding,
        request,
        binding.lease,
        binding.fileKey,
        binding.observedDiskRevision
      )
    } catch (error) {
      return this.notDurable(request, error instanceof Error ? error.message : String(error))
    }
    if (result.status === 'conflict') return this.conflict(request, binding, result.observedDiskRevision)
    if (result.status !== 'saved') return this.notDurable(request, result.reason)
    if (!(await this.hub.acceptsSaveAck(result, { ...binding, ownerLease: binding.lease }))) {
      return this.notDurable(request, 'save acknowledgment was stale')
    }
    if (!this.isCurrentBinding(binding, binding.endpoint, request.documentId)) {
      return this.notDurable(request, 'binding changed before durable acknowledgment')
    }
    binding.observedDiskRevision = result.diskRevision
    binding.dirty = false
    return this.durable(request, binding, result.diskRevision)
  }

  private async saveAndRebind(
    binding: Binding,
    request: DocumentIoSaveRequest,
    targetKey: CanonicalFileKey
  ): Promise<DocumentSaveAck> {
    const temporaryId = `${binding.documentId}:rebind:${randomUUID()}`
    let temporaryBinding!: Binding
    const temporaryLease = await this.hub.subscribe({
      documentId: temporaryId,
      documentRevision: request.documentRevision,
      fileKey: targetKey,
      getState: () => 'dirty',
      onDiskChange: (change) => this.notify(temporaryBinding, change)
    })
    temporaryBinding = { ...binding, fileKey: targetKey, lease: temporaryLease, documentId: temporaryId }
    try {
      const expected = null
      let result: GuardedSaveResult
      try {
        result = await this.guardedSave(
          temporaryBinding,
          request,
          temporaryLease,
          targetKey,
          expected,
          temporaryId
        )
      } catch (error) {
        return this.notDurable(request, error instanceof Error ? error.message : String(error))
      }
      if (result.status === 'conflict') return this.conflict(request, binding, result.observedDiskRevision)
      if (result.status !== 'saved') return this.notDurable(request, result.reason)
      if (
        !(await this.hub.acceptsSaveAck(result, {
          documentId: temporaryId,
          documentRevision: request.documentRevision,
          fileKey: targetKey,
          ownerLease: temporaryLease
        }))
      ) {
        return this.notDurable(request, 'save acknowledgment was stale')
      }
      if (!this.isCurrentBinding(binding, binding.endpoint, request.documentId)) {
        return this.notDurable(request, 'binding changed before rebind')
      }
      const successor = await this.hub.subscribe({
        documentId: binding.documentId,
        documentRevision: request.documentRevision,
        fileKey: targetKey,
        getState: () => (binding.dirty ? 'dirty' : 'clean'),
        onDiskChange: (change) => this.notify(binding, change)
      })
      this.hub.release(temporaryLease)
      this.hub.release(binding.lease)
      binding.fileKey = targetKey
      binding.lease = successor
      binding.observedDiskRevision = result.diskRevision
      binding.dirty = false
      return this.durable(request, binding, result.diskRevision)
    } finally {
      if (this.hub.isCurrent(temporaryLease)) this.hub.release(temporaryLease)
    }
  }

  private guardedSave(
    binding: Binding,
    request: DocumentIoSaveRequest,
    lease: FileObservationLease,
    fileKey: CanonicalFileKey,
    observedDiskRevision: DiskRevision | null,
    documentId: string = binding.documentId
  ): Promise<GuardedSaveResult> {
    return this.hub.save({
      documentId,
      documentRevision: request.documentRevision,
      fileKey,
      observedDiskRevision,
      ownerLease: lease,
      bytes: encodeMarkdown(request.markdown, request.options),
      purpose: 'save'
    })
  }

  private notify(binding: Binding, change: DiskChange): void {
    if (!this.isCurrentBinding(binding, binding.endpoint, binding.documentId) || !this.hub.isCurrent(binding.lease)) return
    binding.endpoint.send({
      documentId: binding.documentId,
      ownerFence: binding.ownerFence,
      kind: change.kind
    })
  }

  private isCurrentBinding(binding: Binding, endpoint: DocumentIoEndpoint, documentId: string): boolean {
    return (
      this.endpoints.get(endpoint.id) === endpoint &&
      this.bindings.get(binding.ownerFence) === binding &&
      binding.endpoint.sessionId === endpoint.sessionId &&
      binding.documentId === documentId
    )
  }

  private revokeBinding(binding: Binding): void {
    if (this.bindings.get(binding.ownerFence) !== binding) return
    this.bindings.delete(binding.ownerFence)
    this.hub.release(binding.lease)
  }

  private durable(request: DocumentIoSaveRequest, binding: Binding, _diskRevision: DiskRevision): DocumentSaveAck {
    return {
      status: 'durable-success',
      requestId: request.requestId,
      documentId: binding.documentId,
      documentRevision: request.documentRevision,
      ownerFence: binding.ownerFence
    }
  }

  private conflict(
    request: DocumentIoSaveRequest,
    binding: Binding,
    _observedDiskRevision: DiskRevision | null
  ): DocumentSaveAck {
    return {
      status: 'conflict',
      requestId: request.requestId,
      documentId: binding.documentId,
      ownerFence: binding.ownerFence
    }
  }

  private notDurable(request: DocumentIoSaveRequest, reason?: string): DocumentSaveAck {
    return {
      status: 'not-durable',
      requestId: request.requestId,
      documentId: request.documentId,
      ownerFence: request.ownerFence,
      reason
    }
  }
}
