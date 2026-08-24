import { createHash, randomUUID } from 'crypto'
import fsPromises from 'fs/promises'
import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { writeFile } from '../filesystem'
import type {
  DiskRevision,
  DocumentId,
  FileKey,
  FileObservationIdentity,
  FileObservationPurpose,
  OverwriteRequest,
  OverwriteToken
} from '@shared/workspace/fileObservation'

export type { DiskRevision, DocumentId, FileKey, FileObservationPurpose, OverwriteToken }

export interface FileObservationStorage {
  canonicalize(pathname: string): Promise<FileKey>
  read(fileKey: FileKey): Promise<Buffer | null>
  write(fileKey: FileKey, bytes: Buffer): Promise<void>
}

export interface FileObservationWatchFactory {
  watch(fileKey: FileKey, onChange: () => void): () => void
}

export type PeerDiskState = 'clean' | 'dirty'

export interface DiskChange {
  readonly kind: 'reload' | 'conflict'
  readonly fileKey: FileKey
  readonly diskRevision: DiskRevision | null
}

export interface FileObservationSubscriber {
  readonly documentId: DocumentId
  readonly documentRevision: number
  readonly fileKey: FileKey
  /** Read immediately before delivery; an old lease must be inert. */
  getState(): PeerDiskState
  onDiskChange(change: DiskChange): void
}

/** Generation and identity are validated by the hub; callers must treat it as opaque. */
export interface FileObservationLease {
  readonly fileKey: FileKey
  readonly generation: number
  readonly subscriberId: DocumentId
}

export interface GuardedSaveRequest extends FileObservationIdentity {
  readonly bytes: Buffer
  readonly purpose?: FileObservationPurpose
  readonly overwriteToken?: OverwriteToken
}

export type GuardedSaveResult =
  | {
    readonly status: 'saved'
    readonly writeId: string
    readonly fileKey: FileKey
    readonly diskRevision: DiskRevision
    readonly documentId: DocumentId
    readonly documentRevision: number
  }
  | {
    readonly status: 'conflict'
    readonly fileKey: FileKey
    readonly observedDiskRevision: DiskRevision | null
  }
  | { readonly status: 'rejected'; readonly reason: string }

interface SubscriberSlot {
  readonly lease: FileObservationLease
  readonly subscriber: FileObservationSubscriber
}

interface FileEntry {
  readonly subscribers: Map<DocumentId, SubscriberSlot>
  readonly closeWatcher: () => void
  readonly pendingWriterEvents: Array<{
    readonly writeId: string
    readonly documentId: DocumentId
    readonly hash: DiskRevision
  }>
}

interface TokenBinding extends OverwriteRequest {
  used: boolean
}

const sha256 = (bytes: Buffer): DiskRevision => createHash('sha256').update(bytes).digest('hex')

const equalRevision = (left: DiskRevision | null, right: DiskRevision | null): boolean =>
  left === right

/**
 * A main-process-only deep module. It owns watcher deduplication, subscriber
 * generations and per-FileKey save serialization; renderer code receives only
 * resulting reload/conflict decisions through a later bridge.
 */
export class FileObservationHub {
  private readonly entries = new Map<FileKey, FileEntry>()
  private readonly queues = new Map<FileKey, Promise<void>>()
  private readonly tokenBindings = new WeakMap<OverwriteToken, TokenBinding>()
  private readonly leases = new WeakSet<FileObservationLease>()
  private nextGeneration = 1

  constructor(
    private readonly storage: FileObservationStorage,
    private readonly watchers: FileObservationWatchFactory
  ) {}

  async canonicalFileKey(pathname: string): Promise<FileKey> {
    return this.storage.canonicalize(pathname)
  }

  async getDiskRevision(fileKey: FileKey): Promise<DiskRevision | null> {
    const bytes = await this.storage.read(fileKey)
    return bytes ? sha256(bytes) : null
  }

  subscribe(subscriber: FileObservationSubscriber): FileObservationLease {
    const existing = this.entries.get(subscriber.fileKey)
    const entry = existing ?? this.createEntry(subscriber.fileKey)
    const old = entry.subscribers.get(subscriber.documentId)
    if (old) {
      this.leases.delete(old.lease)
      entry.subscribers.delete(subscriber.documentId)
    }

    const lease = Object.freeze({
      fileKey: subscriber.fileKey,
      generation: this.nextGeneration++,
      subscriberId: subscriber.documentId
    })
    this.leases.add(lease)
    entry.subscribers.set(subscriber.documentId, { lease, subscriber })
    return lease
  }

  /** Atomically revoke source ownership and grant a fresh successor generation. */
  handoff(
    source: FileObservationLease,
    successor: FileObservationSubscriber
  ): FileObservationLease | undefined {
    if (source.fileKey !== successor.fileKey || !this.isCurrent(source)) return undefined
    const entry = this.entries.get(source.fileKey)
    if (!entry) return undefined
    const existingSuccessor = entry.subscribers.get(successor.documentId)
    if (existingSuccessor) {
      this.leases.delete(existingSuccessor.lease)
      entry.subscribers.delete(successor.documentId)
    }
    // Keep the existing OS watcher alive across the synchronous lease swap.
    this.leases.delete(source)
    entry.subscribers.delete(source.subscriberId)
    const lease = Object.freeze({
      fileKey: successor.fileKey,
      generation: this.nextGeneration++,
      subscriberId: successor.documentId
    })
    this.leases.add(lease)
    entry.subscribers.set(successor.documentId, { lease, subscriber: successor })
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

  issueOverwriteToken(request: OverwriteRequest): OverwriteToken {
    const token = Object.freeze({ purpose: request.purpose })
    this.tokenBindings.set(token, { ...request, used: false })
    return token
  }

  /**
   * Save is a CAS operation against the bytes currently on disk. A conflict
   * does not write. An overwrite token may authorize only the exact observed
   * revision and document revision that produced it.
   */
  async save(request: GuardedSaveRequest): Promise<GuardedSaveResult> {
    return this.serialize(request.fileKey, async() => {
      const current = await this.getDiskRevision(request.fileKey)
      if (!equalRevision(current, request.observedDiskRevision)) {
        if (request.purpose && request.purpose !== 'save') {
          if (!this.consumeValidOverwriteToken(request, current)) {
            return {
              status: 'rejected',
              reason: 'stale, replayed, or mismatched overwrite authorization'
            }
          }
        } else {
          return {
            status: 'conflict',
            fileKey: request.fileKey,
            observedDiskRevision: current
          }
        }
      } else if (request.purpose && request.purpose !== 'save') {
        return {
          status: 'rejected',
          reason: 'overwrite authorization is only valid for a changed disk revision'
        }
      }

      const writeId = randomUUID()
      const intendedHash = sha256(request.bytes)
      const entry = this.entries.get(request.fileKey)
      entry?.pendingWriterEvents.push({
        writeId,
        documentId: request.documentId,
        hash: intendedHash
      })
      try {
        await this.storage.write(request.fileKey, request.bytes)
        const persisted = await this.storage.read(request.fileKey)
        if (!persisted) {
          return {
            status: 'rejected',
            reason: 'save completed but no persisted bytes were readable'
          }
        }
        return {
          status: 'saved',
          writeId,
          fileKey: request.fileKey,
          diskRevision: sha256(persisted),
          documentId: request.documentId,
          documentRevision: request.documentRevision
        }
      } catch (error) {
        this.removePendingWriterEvent(request.fileKey, writeId)
        throw error
      }
    })
  }

  /** A later renderer ACK must still refer to the exact saved document version. */
  acceptsSaveAck(
    result: Extract<GuardedSaveResult, { readonly status: 'saved' }>,
    current: Pick<FileObservationIdentity, 'documentId' | 'documentRevision' | 'fileKey'>
  ): boolean {
    return (
      result.documentId === current.documentId &&
      result.documentRevision === current.documentRevision &&
      result.fileKey === current.fileKey
    )
  }

  close(): void {
    for (const entry of this.entries.values()) entry.closeWatcher()
    this.entries.clear()
    this.queues.clear()
  }

  private createEntry(fileKey: FileKey): FileEntry {
    const entry: FileEntry = {
      subscribers: new Map(),
      pendingWriterEvents: [],
      closeWatcher: this.watchers.watch(fileKey, () => {
        this.serialize(fileKey, () => this.handleWatchEvent(fileKey)).catch((error: unknown) => {
          console.error('Failed to handle file observation event:', error)
        })
      })
    }
    this.entries.set(fileKey, entry)
    return entry
  }

  private async handleWatchEvent(fileKey: FileKey): Promise<void> {
    const entry = this.entries.get(fileKey)
    if (!entry) return
    const revision = await this.getDiskRevision(fileKey)
    const writer = revision === null ? undefined : this.takeWriterEvent(entry, revision)
    for (const slot of [...entry.subscribers.values()]) {
      if (!this.isCurrent(slot.lease)) continue
      // Suppression is deliberately only for the document that wrote these bytes.
      if (writer?.documentId === slot.subscriber.documentId) continue
      slot.subscriber.onDiskChange({
        kind: slot.subscriber.getState() === 'clean' ? 'reload' : 'conflict',
        fileKey,
        diskRevision: revision
      })
    }
  }

  private takeWriterEvent(
    entry: FileEntry,
    revision: DiskRevision
  ): { readonly documentId: DocumentId } | undefined {
    const index = entry.pendingWriterEvents.findIndex((pending) => pending.hash === revision)
    if (index < 0) return undefined
    const [writer] = entry.pendingWriterEvents.splice(index, 1)
    return writer
  }

  private removePendingWriterEvent(fileKey: FileKey, writeId: string): void {
    const entry = this.entries.get(fileKey)
    if (!entry) return
    const index = entry.pendingWriterEvents.findIndex((pending) => pending.writeId === writeId)
    if (index >= 0) entry.pendingWriterEvents.splice(index, 1)
  }

  private consumeValidOverwriteToken(
    request: GuardedSaveRequest,
    current: DiskRevision | null
  ): boolean {
    const token = request.overwriteToken
    if (!token || request.purpose === undefined || request.purpose === 'save') return false
    const binding = this.tokenBindings.get(token)
    if (!binding || binding.used || token.purpose !== request.purpose) return false
    if (
      binding.documentId !== request.documentId ||
      binding.documentRevision !== request.documentRevision ||
      binding.fileKey !== request.fileKey ||
      binding.observedDiskRevision !== current ||
      binding.purpose !== request.purpose
    ) { return false }
    binding.used = true
    return true
  }

  private async serialize<T>(fileKey: FileKey, operation: () => Promise<T>): Promise<T> {
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

/** Node/Electron filesystem adapter; writeFile provides the repository's durable atomic write. */
export class NodeFileObservationStorage implements FileObservationStorage {
  async canonicalize(pathname: string): Promise<FileKey> {
    const absolute = path.resolve(pathname)
    try {
      return await fsPromises.realpath(absolute)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return absolute
      throw error
    }
  }

  async read(fileKey: FileKey): Promise<Buffer | null> {
    try {
      return await fsPromises.readFile(fileKey)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  write(fileKey: FileKey, bytes: Buffer): Promise<void> {
    return writeFile(fileKey, bytes, undefined, undefined)
  }
}

/** Production watcher adapter. The hub, not this adapter, deduplicates paths. */
export class ChokidarFileObservationWatchFactory implements FileObservationWatchFactory {
  watch(fileKey: FileKey, onChange: () => void): () => void {
    const watcher: FSWatcher = chokidar.watch(fileKey, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 150 }
    })
    watcher.on('add', onChange).on('change', onChange).on('unlink', onChange)
    return () => {
      watcher.close().catch((error: unknown) => {
        console.error('Failed to close file observation watcher:', error)
      })
    }
  }
}

/** Deterministic test adapters for the T04 contract suite. */
export class MemoryFileObservationStorage implements FileObservationStorage {
  readonly files = new Map<FileKey, Buffer>()
  writeBarrier?: Promise<void>

  async canonicalize(pathname: string): Promise<FileKey> {
    return path.resolve(pathname)
  }

  async read(fileKey: FileKey): Promise<Buffer | null> {
    const bytes = this.files.get(fileKey)
    return bytes ? Buffer.from(bytes) : null
  }

  async write(fileKey: FileKey, bytes: Buffer): Promise<void> {
    await this.writeBarrier
    this.files.set(fileKey, Buffer.from(bytes))
  }
}

export class MemoryFileObservationWatchFactory implements FileObservationWatchFactory {
  readonly activeWatchers = new Map<FileKey, Set<() => void>>()

  watch(fileKey: FileKey, onChange: () => void): () => void {
    const callbacks = this.activeWatchers.get(fileKey) ?? new Set<() => void>()
    callbacks.add(onChange)
    this.activeWatchers.set(fileKey, callbacks)
    return () => {
      callbacks.delete(onChange)
      if (callbacks.size === 0) this.activeWatchers.delete(fileKey)
    }
  }

  emit(fileKey: FileKey): void {
    for (const callback of [...(this.activeWatchers.get(fileKey) ?? [])]) callback()
  }
}
