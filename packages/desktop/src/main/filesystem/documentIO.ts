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

interface BindingReservation {
  readonly token: string
  readonly endpoint: DocumentIoEndpoint
  readonly documentId: string
  readonly documentRevision: number
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
  private readonly reservations = new Map<string, BindingReservation>()

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
      if (request.documentRevision < this.highestRevision(binding.endpoint, binding.documentId, binding.documentRevision)) {
        return rejected(request, 'stale document revision')
      }
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
    const endpoint = this.endpoints.get(senderId)
    this.endpoints.delete(senderId)
    if (endpoint) this.clearReservationsFor(endpoint)
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
    this.reservations.clear()
  }

  private async bind(
    endpoint: DocumentIoEndpoint,
    request: DocumentIoBindingRequest
  ): Promise<DocumentSaveAck> {
    const reservation = this.reserve(endpoint, request.documentId, request.documentRevision)
    if (!reservation) return rejected(request, 'stale document revision')
    let lease: FileObservationLease | undefined
    try {
      const fileKey = await this.hub.canonicalFileKey(request.pathname)
      if (!this.isCurrentReservation(reservation)) return rejected(request, 'stale bind')
      const observedDiskRevision = await this.hub.getDiskRevision(fileKey)
      if (!this.isCurrentReservation(reservation)) return rejected(request, 'stale bind')
      const latest = this.findBinding(endpoint, request.documentId)
      if (latest && latest.documentRevision > request.documentRevision) {
        return rejected(request, 'stale document revision')
      }
      const ownerFence = randomUUID()
      let binding!: Binding
      const subscriber: FileObservationSubscriber = {
        documentId: request.documentId,
        documentRevision: request.documentRevision,
        fileKey,
        getState: () => (binding.dirty ? 'dirty' : 'clean'),
        onDiskChange: (change) => this.notify(binding, change)
      }
      lease = latest?.fileKey === fileKey
        ? await this.hub.handoff(latest.lease, subscriber)
        : await this.hub.subscribe(subscriber)
      if (lease && latest?.fileKey === fileKey && this.bindings.get(latest.ownerFence) === latest) {
        // Handoff has already revoked this lease; never leave a stale binding
        // behind if a newer reservation supersedes this bind before publish.
        this.bindings.delete(latest.ownerFence)
      }
      if (!lease || !this.isCurrentReservation(reservation)) return rejected(request, 'stale bind')
      binding = {
        endpoint,
        documentId: request.documentId,
        ownerFence,
        fileKey,
        observedDiskRevision,
        documentRevision: request.documentRevision,
        dirty: request.dirty,
        lease,
        saveAcks: new Map()
      }
      if (!this.isCurrentReservation(reservation)) return rejected(request, 'stale bind')
      if (latest && latest.fileKey !== fileKey) this.revokeBinding(latest)
      this.bindings.set(ownerFence, binding)
      lease = undefined
      return {
        status: 'bound',
        requestId: request.requestId,
        documentId: request.documentId,
        ownerFence
      }
    } finally {
      if (lease) this.hub.release(lease)
      this.clearReservation(reservation)
    }
  }

  private async save(binding: Binding, request: DocumentIoSaveRequest): Promise<DocumentSaveAck> {
    if (request.documentRevision < this.highestRevision(binding.endpoint, binding.documentId, binding.documentRevision)) {
      return rejected(request, 'stale document revision')
    }
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
      purpose: 'save',
      canWrite: () => {
        const current = this.bindings.get(binding.ownerFence)
        return (
          current !== undefined &&
          current.endpoint === binding.endpoint &&
          current.documentRevision === request.documentRevision &&
          request.documentRevision >= this.highestRevision(binding.endpoint, binding.documentId, binding.documentRevision)
        )
      }
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

  private findBinding(endpoint: DocumentIoEndpoint, documentId: string): Binding | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.endpoint === endpoint && binding.documentId === documentId) return binding
    }
    return undefined
  }

  private reserve(
    endpoint: DocumentIoEndpoint,
    documentId: string,
    documentRevision: number
  ): BindingReservation | undefined {
    const current = this.findBinding(endpoint, documentId)
    const existing = this.reservations.get(this.reservationKey(endpoint, documentId))
    const highest = Math.max(current?.documentRevision ?? -1, existing?.documentRevision ?? -1)
    if (documentRevision <= highest) return undefined
    const reservation = { token: randomUUID(), endpoint, documentId, documentRevision }
    this.reservations.set(this.reservationKey(endpoint, documentId), reservation)
    return reservation
  }

  private highestRevision(endpoint: DocumentIoEndpoint, documentId: string, revision: number): number {
    return Math.max(revision, this.reservations.get(this.reservationKey(endpoint, documentId))?.documentRevision ?? -1)
  }

  private isCurrentReservation(reservation: BindingReservation): boolean {
    return (
      this.endpoints.get(reservation.endpoint.id) === reservation.endpoint &&
      this.reservations.get(this.reservationKey(reservation.endpoint, reservation.documentId)) === reservation
    )
  }

  private clearReservation(reservation: BindingReservation): void {
    const key = this.reservationKey(reservation.endpoint, reservation.documentId)
    if (this.reservations.get(key) === reservation) this.reservations.delete(key)
  }

  private clearReservationsFor(endpoint: DocumentIoEndpoint): void {
    for (const [key, reservation] of this.reservations) {
      if (reservation.endpoint === endpoint) this.reservations.delete(key)
    }
  }

  private reservationKey(endpoint: DocumentIoEndpoint, documentId: string): string {
    return `${endpoint.id}:${documentId}`
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
