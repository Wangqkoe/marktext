import { createHash, randomUUID } from 'crypto'
import fsPromises from 'fs/promises'
import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { writeFile } from '../filesystem'
import type {
  CanonicalFileKey,
  DiskRevision,
  DocumentId,
  FileKey,
  FileObservationIdentity,
  FileObservationPurpose,
  OverwriteRequest,
  OverwriteToken
} from '@shared/workspace/fileObservation'

export type {
  CanonicalFileKey,
  DiskRevision,
  DocumentId,
  FileKey,
  FileObservationPurpose,
  OverwriteToken
}

export interface FileObservationStorage {
  canonicalize(pathname: string): Promise<CanonicalFileKey>
  read(fileKey: CanonicalFileKey): Promise<Buffer | null>
  write(fileKey: CanonicalFileKey, bytes: Buffer): Promise<void>
}

/** Raw filesystem event; it deliberately carries no claimed write origin. */
export interface FileObservationEvent {
  readonly raw?: true
}

export interface FileObservationWatchFactory {
  watch(fileKey: CanonicalFileKey, onChange: (event: FileObservationEvent) => void): () => void
}

export type PeerDiskState = 'clean' | 'dirty'

export interface DiskChange {
  readonly kind: 'reload' | 'conflict'
  readonly fileKey: CanonicalFileKey
  readonly diskRevision: DiskRevision | null
}

export interface FileObservationSubscriber {
  readonly documentId: DocumentId
  readonly documentRevision: number
  /** This public input is untrusted; the hub canonicalizes it before use. */
  readonly fileKey: FileKey
  getState(): PeerDiskState
  onDiskChange(change: DiskChange): void
}

/** Runtime validation additionally requires object identity in a private WeakSet. */
export interface FileObservationLease {
  readonly fileKey: CanonicalFileKey
  readonly generation: number
  readonly subscriberId: DocumentId
}

export interface GuardedSaveRequest extends FileObservationIdentity {
  readonly bytes: Buffer
  readonly ownerLease: FileObservationLease
  readonly purpose?: FileObservationPurpose
  readonly overwriteToken?: OverwriteToken
}

export type GuardedSaveResult =
  | {
    readonly status: 'saved'
    readonly writeId: string
    readonly fileKey: CanonicalFileKey
    readonly diskRevision: DiskRevision
    readonly documentId: DocumentId
    readonly documentRevision: number
    readonly ownerLease: FileObservationLease
  }
  | {
    readonly status: 'conflict'
    readonly fileKey: CanonicalFileKey
    readonly observedDiskRevision: DiskRevision | null
  }
  | { readonly status: 'rejected'; readonly reason: string }

interface SubscriberSlot {
  readonly lease: FileObservationLease
  readonly subscriber: FileObservationSubscriber & { readonly fileKey: CanonicalFileKey }
  lastObservedDiskRevision?: DiskRevision | null
}

interface PendingWriterEvent {
  readonly writeId: string
  readonly documentId: DocumentId
  readonly fileKey: CanonicalFileKey
  readonly intendedHash: DiskRevision
  readonly landedHash: DiskRevision
  readonly expiresAt: number
}

interface FileEntry {
  epoch: number
  readonly subscribers: Map<DocumentId, SubscriberSlot>
  readonly closeWatcher: () => void
  readonly pendingWriterEvents: Map<string, PendingWriterEvent>
}

interface TokenBinding extends OverwriteRequest {
  readonly fileKey: CanonicalFileKey
  used: boolean
}

export interface FileObservationHubOptions {
  readonly now?: () => number
  readonly pendingOwnWriteTtlMs?: number
  readonly maxPendingOwnWrites?: number
}

const sha256 = (bytes: Buffer): DiskRevision => createHash('sha256').update(bytes).digest('hex')

const equalRevision = (left: DiskRevision | null, right: DiskRevision | null): boolean =>
  left === right

const DEFAULT_PENDING_OWN_WRITE_TTL_MS = 10_000
const DEFAULT_MAX_PENDING_OWN_WRITES = 64

/**
 * Main-process owner for canonical file observation and guarded writes. Every
 * public pathname is canonicalized before it can select a watcher, queue, CAS
 * record, lease, or overwrite capability.
 */
export class FileObservationHub {
  private readonly entries = new Map<CanonicalFileKey, FileEntry>()
  private readonly queues = new Map<CanonicalFileKey, Promise<void>>()
  private readonly tokenBindings = new WeakMap<OverwriteToken, TokenBinding>()
  private readonly leases = new WeakSet<FileObservationLease>()
  private readonly acknowledgedSaves = new WeakSet<object>()
  private readonly now: () => number
  private readonly pendingOwnWriteTtlMs: number
  private readonly maxPendingOwnWrites: number
  private nextGeneration = 1
  private nextEpoch = 1

  constructor(
    private readonly storage: FileObservationStorage,
    private readonly watchers: FileObservationWatchFactory,
    options: FileObservationHubOptions = {}
  ) {
    this.now = options.now ?? Date.now
    this.pendingOwnWriteTtlMs = options.pendingOwnWriteTtlMs ?? DEFAULT_PENDING_OWN_WRITE_TTL_MS
    this.maxPendingOwnWrites = options.maxPendingOwnWrites ?? DEFAULT_MAX_PENDING_OWN_WRITES
  }

  canonicalFileKey(pathname: string): Promise<CanonicalFileKey> {
    return this.storage.canonicalize(pathname)
  }

  async getDiskRevision(pathname: FileKey): Promise<DiskRevision | null> {
    return this.readRevision(await this.canonicalFileKey(pathname))
  }

  async subscribe(subscriber: FileObservationSubscriber): Promise<FileObservationLease> {
    const fileKey = await this.canonicalFileKey(subscriber.fileKey)
    const canonicalSubscriber = { ...subscriber, fileKey }
    const entry = this.entries.get(fileKey) ?? this.createEntry(fileKey)
    const old = entry.subscribers.get(subscriber.documentId)
    if (old) {
      this.leases.delete(old.lease)
      entry.subscribers.delete(subscriber.documentId)
    }
    const lease = this.createLease(fileKey, subscriber.documentId)
    entry.subscribers.set(subscriber.documentId, { lease, subscriber: canonicalSubscriber })
    return lease
  }

  /** Atomically revokes source ownership and advances epoch before target activation. */
  async handoff(
    source: FileObservationLease,
    successor: FileObservationSubscriber
  ): Promise<FileObservationLease | undefined> {
    const successorKey = await this.canonicalFileKey(successor.fileKey)
    if (source.fileKey !== successorKey || !this.isCurrent(source)) return undefined
    const entry = this.entries.get(source.fileKey)
    if (!entry) return undefined
    const existingSuccessor = entry.subscribers.get(successor.documentId)
    if (existingSuccessor) {
      this.leases.delete(existingSuccessor.lease)
      entry.subscribers.delete(successor.documentId)
    }
    entry.epoch = this.nextEpoch++
    this.leases.delete(source)
    entry.subscribers.delete(source.subscriberId)
    const lease = this.createLease(successorKey, successor.documentId)
    entry.subscribers.set(successor.documentId, {
      lease,
      subscriber: { ...successor, fileKey: successorKey }
    })
    return lease
  }

  release(lease: FileObservationLease): boolean {
    const entry = this.entries.get(lease.fileKey)
    const slot = entry?.subscribers.get(lease.subscriberId)
    if (!entry || !slot || !this.leases.has(lease) || slot.lease !== lease) return false
    this.leases.delete(lease)
    entry.subscribers.delete(lease.subscriberId)
    if (entry.subscribers.size === 0) {
      entry.closeWatcher()
      this.entries.delete(lease.fileKey)
    }
    return true
  }

  isCurrent(lease: FileObservationLease): boolean {
    return (
      this.leases.has(lease) &&
      this.entries.get(lease.fileKey)?.subscribers.get(lease.subscriberId)?.lease === lease
    )
  }

  async refreshDocumentRevision(
    lease: FileObservationLease,
    documentRevision: number
  ): Promise<boolean> {
    return this.serialize(lease.fileKey, async() => {
      const entry = this.entries.get(lease.fileKey)
      const slot = entry?.subscribers.get(lease.subscriberId)
      if (!entry || !slot || !this.isCurrent(lease)) return false
      entry.subscribers.set(lease.subscriberId, {
        ...slot,
        subscriber: { ...slot.subscriber, documentRevision }
      })
      return true
    })
  }

  currentDocumentRevision(lease: FileObservationLease): number | undefined {
    if (!this.isCurrent(lease)) return undefined
    return this.entries.get(lease.fileKey)?.subscribers.get(lease.subscriberId)?.subscriber
      .documentRevision
  }

  async issueOverwriteToken(request: OverwriteRequest): Promise<OverwriteToken> {
    const fileKey = await this.canonicalFileKey(request.fileKey)
    const token = Object.freeze({ purpose: request.purpose })
    this.tokenBindings.set(token, { ...request, fileKey, used: false })
    return token
  }

  async save(request: GuardedSaveRequest): Promise<GuardedSaveResult> {
    const fileKey = await this.canonicalFileKey(request.fileKey)
    return this.serialize(fileKey, async() => {
      if (!this.matchesOwner(request, fileKey)) {
        return { status: 'rejected', reason: 'stale or mismatched owner lease' }
      }
      const current = await this.readRevision(fileKey)
      if (!equalRevision(current, request.observedDiskRevision)) {
        if (request.purpose && request.purpose !== 'save') {
          if (!this.consumeValidOverwriteToken(request, fileKey, current)) {
            return {
              status: 'rejected',
              reason: 'stale, replayed, or mismatched overwrite authorization'
            }
          }
        } else {
          return { status: 'conflict', fileKey, observedDiskRevision: current }
        }
      } else if (request.purpose && request.purpose !== 'save') {
        return {
          status: 'rejected',
          reason: 'overwrite authorization is only valid for a changed disk revision'
        }
      }

      const writeId = randomUUID()
      const intendedHash = sha256(request.bytes)
      try {
        await this.storage.write(fileKey, request.bytes)
        const persisted = await this.storage.read(fileKey)
        const landedHash = persisted ? sha256(persisted) : null
        if (landedHash !== intendedHash) {
          return { status: 'conflict', fileKey, observedDiskRevision: landedHash }
        }
        if (!this.matchesOwner(request, fileKey)) {
          return { status: 'rejected', reason: 'owner changed before save acknowledgment' }
        }
        this.recordPendingWriterEvent(fileKey, {
          writeId,
          documentId: request.documentId,
          fileKey,
          intendedHash,
          landedHash,
          expiresAt: this.now() + this.pendingOwnWriteTtlMs
        })
        return Object.freeze({
          status: 'saved' as const,
          writeId,
          fileKey,
          diskRevision: landedHash,
          documentId: request.documentId,
          documentRevision: request.documentRevision,
          ownerLease: request.ownerLease
        })
      } catch (error) {
        this.removePendingWriterEvent(fileKey, writeId)
        throw error
      }
    })
  }

  /** A saved ACK is accepted exactly once by its current owner lease and revision. */
  async acceptsSaveAck(
    result: Extract<GuardedSaveResult, { readonly status: 'saved' }>,
    current: Pick<FileObservationIdentity, 'documentId' | 'documentRevision' | 'fileKey'> & {
      readonly ownerLease: FileObservationLease
    }
  ): Promise<boolean> {
    const fileKey = await this.canonicalFileKey(current.fileKey)
    if (this.acknowledgedSaves.has(result)) return false
    if (
      result.documentId !== current.documentId ||
      result.documentRevision !== current.documentRevision ||
      result.fileKey !== fileKey ||
      fileKey !== current.ownerLease.fileKey ||
      result.ownerLease !== current.ownerLease ||
      !this.isCurrent(current.ownerLease)
    ) {
      return false
    }
    this.acknowledgedSaves.add(result)
    return true
  }

  async pendingOwnWriteCount(pathname: FileKey): Promise<number> {
    const entry = this.entries.get(await this.canonicalFileKey(pathname))
    if (!entry) return 0
    this.prunePendingWriterEvents(entry)
    return entry.pendingWriterEvents.size
  }

  close(): void {
    for (const entry of this.entries.values()) entry.closeWatcher()
    this.entries.clear()
    this.queues.clear()
  }

  private createLease(fileKey: CanonicalFileKey, subscriberId: DocumentId): FileObservationLease {
    const lease = Object.freeze({ fileKey, generation: this.nextGeneration++, subscriberId })
    this.leases.add(lease)
    return lease
  }

  private createEntry(fileKey: CanonicalFileKey): FileEntry {
    const entry: FileEntry = {
      epoch: this.nextEpoch++,
      subscribers: new Map(),
      pendingWriterEvents: new Map(),
      closeWatcher: this.watchers.watch(fileKey, () => {
        const eventEpoch = entry.epoch
        this.serialize(fileKey, () => this.handleWatchEvent(fileKey, entry, eventEpoch)).catch(
          (error: unknown) => {
            console.error('Failed to handle file observation event:', error)
          }
        )
      })
    }
    this.entries.set(fileKey, entry)
    return entry
  }

  private async handleWatchEvent(
    fileKey: CanonicalFileKey,
    entry: FileEntry,
    eventEpoch: number
  ): Promise<void> {
    const slots = [...entry.subscribers.values()]
    const revision = await this.readRevision(fileKey)
    // An event that began before a handoff/subscriber generation change is inert.
    if (this.entries.get(fileKey) !== entry || entry.epoch !== eventEpoch) return
    const writers = this.consumePendingWriterEvents(entry, fileKey, revision)
    for (const slot of slots) {
      if (!this.isCurrent(slot.lease)) continue
      if (slot.lastObservedDiskRevision === revision) continue
      slot.lastObservedDiskRevision = revision
      if (writers.has(slot.subscriber.documentId)) continue
      slot.subscriber.onDiskChange({
        kind: slot.subscriber.getState() === 'clean' ? 'reload' : 'conflict',
        fileKey,
        diskRevision: revision
      })
    }
  }

  private async readRevision(fileKey: CanonicalFileKey): Promise<DiskRevision | null> {
    const bytes = await this.storage.read(fileKey)
    return bytes ? sha256(bytes) : null
  }

  private matchesOwner(request: GuardedSaveRequest, fileKey: CanonicalFileKey): boolean {
    const slot = this.entries.get(fileKey)?.subscribers.get(request.ownerLease.subscriberId)
    return (
      request.ownerLease.fileKey === fileKey &&
      request.ownerLease.subscriberId === request.documentId &&
      slot?.lease === request.ownerLease &&
      slot.subscriber.documentRevision === request.documentRevision &&
      this.isCurrent(request.ownerLease)
    )
  }

  private recordPendingWriterEvent(fileKey: CanonicalFileKey, pending: PendingWriterEvent): void {
    const entry = this.entries.get(fileKey)
    if (!entry) return
    this.prunePendingWriterEvents(entry)
    while (entry.pendingWriterEvents.size >= this.maxPendingOwnWrites) {
      const oldest = entry.pendingWriterEvents.keys().next().value as string | undefined
      if (!oldest) break
      entry.pendingWriterEvents.delete(oldest)
    }
    entry.pendingWriterEvents.set(pending.writeId, pending)
  }

  private consumePendingWriterEvents(
    entry: FileEntry,
    fileKey: CanonicalFileKey,
    revision: DiskRevision | null
  ): Set<DocumentId> {
    this.prunePendingWriterEvents(entry)
    const writers = new Set<DocumentId>()
    for (const [writeId, pending] of entry.pendingWriterEvents) {
      if (
        pending.fileKey === fileKey &&
        pending.intendedHash === pending.landedHash &&
        pending.landedHash === revision
      ) {
        writers.add(pending.documentId)
        entry.pendingWriterEvents.delete(writeId)
      }
    }
    return writers
  }

  private removePendingWriterEvent(fileKey: CanonicalFileKey, writeId: string): void {
    this.entries.get(fileKey)?.pendingWriterEvents.delete(writeId)
  }

  private prunePendingWriterEvents(entry: FileEntry): void {
    const now = this.now()
    for (const [writeId, pending] of entry.pendingWriterEvents) {
      if (pending.expiresAt <= now) entry.pendingWriterEvents.delete(writeId)
    }
  }

  private consumeValidOverwriteToken(
    request: GuardedSaveRequest,
    fileKey: CanonicalFileKey,
    current: DiskRevision | null
  ): boolean {
    const token = request.overwriteToken
    if (!token || request.purpose === undefined || request.purpose === 'save') return false
    const binding = this.tokenBindings.get(token)
    if (!binding || binding.used || token.purpose !== request.purpose) return false
    if (
      binding.documentId !== request.documentId ||
      binding.documentRevision !== request.documentRevision ||
      binding.fileKey !== fileKey ||
      binding.observedDiskRevision !== current ||
      binding.purpose !== request.purpose
    ) {
      return false
    }
    binding.used = true
    return true
  }

  private async serialize<T>(fileKey: CanonicalFileKey, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(fileKey) ?? Promise.resolve()
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => barrier)
    this.queues.set(fileKey, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(fileKey) === tail) this.queues.delete(fileKey)
    }
  }
}

export interface FileKeyCasePolicy {
  readonly caseSensitive?: boolean
}

const normalizePath = (pathname: string, caseSensitive: boolean): string => {
  const normalized = path.normalize(path.resolve(pathname))
  return caseSensitive ? normalized : normalized.toLocaleLowerCase()
}

/** Resolves existing ancestors so a new child below a symlink gets its canonical parent key. */
export class NodeFileObservationStorage implements FileObservationStorage {
  private readonly caseSensitive: boolean

  constructor(policy: FileKeyCasePolicy = {}) {
    // macOS commonly mounts case-insensitive volumes; callers can opt into a
    // case-sensitive volume explicitly rather than relying on process.platform.
    this.caseSensitive = policy.caseSensitive ?? process.platform === 'linux'
  }

  async canonicalize(pathname: string): Promise<CanonicalFileKey> {
    const suffix: string[] = []
    let candidate = path.resolve(pathname)
    for (;;) {
      try {
        const resolved = await fsPromises.realpath(candidate)
        return normalizePath(path.join(resolved, ...suffix), this.caseSensitive) as CanonicalFileKey
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        const parent = path.dirname(candidate)
        if (parent === candidate) {
          return normalizePath(path.resolve(pathname), this.caseSensitive) as CanonicalFileKey
        }
        suffix.unshift(path.basename(candidate))
        candidate = parent
      }
    }
  }

  async read(fileKey: CanonicalFileKey): Promise<Buffer | null> {
    try {
      return await fsPromises.readFile(fileKey)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  write(fileKey: CanonicalFileKey, bytes: Buffer): Promise<void> {
    return writeFile(fileKey, bytes, undefined, undefined)
  }
}

export class ChokidarFileObservationWatchFactory implements FileObservationWatchFactory {
  watch(fileKey: CanonicalFileKey, onChange: (event: FileObservationEvent) => void): () => void {
    const watcher: FSWatcher = chokidar.watch(fileKey, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 150 }
    })
    const rawEvent = (): void => onChange({})
    watcher.on('add', rawEvent).on('change', rawEvent).on('unlink', rawEvent)
    return () => {
      watcher.close().catch((error: unknown) => {
        console.error('Failed to close file observation watcher:', error)
      })
    }
  }
}

/** Deterministic adapters including virtual case/symlink canonicalization and delayed reads. */
export class MemoryFileObservationStorage implements FileObservationStorage {
  readonly files = new Map<CanonicalFileKey, Buffer>()
  private readonly parentAliases = new Map<string, string>()
  writeBarrier?: Promise<void>
  readBarrier?: Promise<void>
  onRead?: () => void
  onWrite?: (fileKey: CanonicalFileKey, bytes: Buffer) => void

  constructor(private readonly policy: FileKeyCasePolicy = {}) {}

  aliasParent(sourceParent: string, targetParent: string): void {
    this.parentAliases.set(this.normalize(sourceParent), this.normalize(targetParent))
  }

  async canonicalize(pathname: string): Promise<CanonicalFileKey> {
    let candidate = this.normalize(pathname)
    for (const [sourceParent, targetParent] of this.parentAliases) {
      if (candidate === sourceParent || candidate.startsWith(`${sourceParent}${path.sep}`)) {
        candidate = `${targetParent}${candidate.slice(sourceParent.length)}`
        break
      }
    }
    return candidate as CanonicalFileKey
  }

  private normalize(pathname: string): string {
    return normalizePath(pathname, this.policy.caseSensitive ?? false)
  }

  async read(fileKey: CanonicalFileKey): Promise<Buffer | null> {
    this.onRead?.()
    await this.readBarrier
    const bytes = this.files.get(fileKey)
    return bytes ? Buffer.from(bytes) : null
  }

  async write(fileKey: CanonicalFileKey, bytes: Buffer): Promise<void> {
    await this.writeBarrier
    this.files.set(fileKey, Buffer.from(bytes))
    this.onWrite?.(fileKey, Buffer.from(bytes))
  }
}

export class MemoryFileObservationWatchFactory implements FileObservationWatchFactory {
  readonly activeWatchers = new Map<CanonicalFileKey, Set<(event: FileObservationEvent) => void>>()

  watch(fileKey: CanonicalFileKey, onChange: (event: FileObservationEvent) => void): () => void {
    const callbacks =
      this.activeWatchers.get(fileKey) ?? new Set<(event: FileObservationEvent) => void>()
    callbacks.add(onChange)
    this.activeWatchers.set(fileKey, callbacks)
    return () => {
      callbacks.delete(onChange)
      if (callbacks.size === 0) this.activeWatchers.delete(fileKey)
    }
  }

  emit(fileKey: CanonicalFileKey, event: FileObservationEvent = {}): void {
    for (const callback of [...(this.activeWatchers.get(fileKey) ?? [])]) callback(event)
  }
}
