import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  CrashDraftCheckpoint,
  CrashDraftEnvelope,
  CrashDraftRecovery,
  CrashDraftRecoveryRecord,
  DiskRevision
} from '@shared/workspace'

export type CrashDraftFaultPoint =
  | 'temp-write'
  | 'temp-fsync'
  | 'replace'
  | 'directory-fsync'
  | 'tombstone'
  | 'clean-marker'

export interface CrashDraftWrite {
  readonly writeId: string
  readonly documentId: string
  readonly documentRevision: number
}

export type CrashDraftAck = { readonly durable: true } | { readonly durable: false; readonly reason: string }

export interface CrashDraftStorage {
  mkdir(directory: string): Promise<void>
  readdir(directory: string): Promise<readonly string[]>
  readFile(filename: string): Promise<Uint8Array>
  writeFile(filename: string, bytes: Uint8Array): Promise<void>
  rename(from: string, to: string): Promise<void>
  unlink(filename: string): Promise<void>
  syncFile(filename: string): Promise<void>
  syncDirectory(directory: string, entry?: string): Promise<void>
}

/** Node implementation deliberately keeps all durability operations explicit for fault injection. */
export class NodeCrashDraftStorage implements CrashDraftStorage {
  async mkdir(directory: string): Promise<void> { await fs.mkdir(directory, { recursive: true }) }
  async readdir(directory: string): Promise<readonly string[]> {
    try { return await fs.readdir(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  readFile(filename: string): Promise<Uint8Array> { return fs.readFile(filename) }
  writeFile(filename: string, bytes: Uint8Array): Promise<void> { return fs.writeFile(filename, bytes) }
  rename(from: string, to: string): Promise<void> { return fs.rename(from, to) }
  async unlink(filename: string): Promise<void> {
    try { await fs.unlink(filename) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async syncFile(filename: string): Promise<void> {
    const handle = await fs.open(filename, 'r+')
    try { await handle.sync() } finally { await handle.close() }
  }

  async syncDirectory(directory: string, entry?: string): Promise<void> {
    try {
      const handle = await fs.open(directory, 'r')
      try { await handle.sync() } finally { await handle.close() }
    } catch (error) {
      // Windows does not expose POSIX directory handles. FlushFileBuffers on
      // the just-replaced entry is the available NTFS durability barrier; if
      // there is no entry, fail closed rather than claim a durable ACK.
      if (process.platform !== 'win32' || !entry) throw error
      await this.syncFile(entry)
    }
  }
}

interface PendingWrite extends CrashDraftWrite { readonly envelope: CrashDraftEnvelope }
interface Tombstone { readonly version: 1; readonly documentId: string; readonly documentRevision: number; readonly disposition: 'saved' | 'discarded'; readonly digest: string }
interface Commit { readonly version: 1; readonly documentId: string; readonly documentRevision: number; readonly envelopeDigest: string; readonly digest: string }
interface PrunableDocument {
  tombstone?: { readonly name: string; readonly revision: number }
  readonly revisions: Map<number, { readonly files: string[]; envelopeDigest?: string; committedDigest?: string }>
}

/**
 * Durable emergency-only drafts. Each revision has its own immutable record,
 * so a failed replace cannot make the previous valid checkpoint disappear.
 */
export class CrashDraftStore implements CrashDraftRecovery {
  private readonly pending = new Map<string, PendingWrite>()
  private readonly fault?: (point: CrashDraftFaultPoint) => void | Promise<void>
  // Checkpoint receipts may arrive concurrently from a pane lifecycle and a
  // committed Move target.  Keep their scan/write/tombstone boundaries ordered.
  private operationTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly directory: string,
    private readonly storage: CrashDraftStorage = new NodeCrashDraftStorage(),
    options: { readonly fault?: (point: CrashDraftFaultPoint) => void | Promise<void> } = {}
  ) { this.fault = options.fault }

  beginCheckpoint(checkpoint: CrashDraftCheckpoint): CrashDraftWrite {
    validateCheckpoint(checkpoint)
    const envelope: CrashDraftEnvelope = { ...structuredClone(checkpoint), version: 1, digest: digestEnvelope(checkpoint) }
    const write: PendingWrite = { writeId: randomUUID(), documentId: checkpoint.documentId, documentRevision: checkpoint.documentRevision, envelope }
    this.pending.set(write.writeId, write)
    return { writeId: write.writeId, documentId: write.documentId, documentRevision: write.documentRevision }
  }

  async acknowledge(write: CrashDraftWrite): Promise<CrashDraftAck> {
    return this.serialize(() => this.acknowledgeWrite(write))
  }

  private async acknowledgeWrite(write: CrashDraftWrite): Promise<CrashDraftAck> {
    const pending = this.pending.get(write.writeId)
    if (!pending || pending.documentId !== write.documentId || pending.documentRevision !== write.documentRevision) {
      return { durable: false, reason: 'stale acknowledgement' }
    }
    const latest = await this.latestValid(pending.documentId)
    if (latest && pending.documentRevision <= latest.documentRevision) {
      this.pending.delete(write.writeId)
      return { durable: false, reason: 'stale acknowledgement' }
    }
    try {
      await this.writeDurable(this.recordPath(pending.documentId, pending.documentRevision), encode(pending.envelope))
      const commitBody = { version: 1 as const, documentId: pending.documentId, documentRevision: pending.documentRevision, envelopeDigest: pending.envelope.digest }
      await this.writeDurable(this.commitPath(pending.documentId, pending.documentRevision), encode({ ...commitBody, digest: digestValue(commitBody) }))
      this.pending.delete(write.writeId)
      await this.prune(pending.documentId)
      return { durable: true }
    } catch (error) {
      // The pending token is consumed: retrying a possibly partially-written
      // attempt could incorrectly claim a durable ACK. The last valid revision remains.
      this.pending.delete(write.writeId)
      return { durable: false, reason: message(error) }
    }
  }

  async checkpoint(checkpoint: CrashDraftCheckpoint): Promise<CrashDraftAck> {
    return this.acknowledge(this.beginCheckpoint(checkpoint))
  }

  async acknowledgeSave(write: CrashDraftWrite): Promise<CrashDraftAck> {
    return this.serialize(async() => {
      const latest = await this.latestValid(write.documentId)
      if (!latest || latest.documentRevision !== write.documentRevision) return { durable: false, reason: 'stale acknowledgement' }
      const ack = await this.tombstone(write.documentId, write.documentRevision, 'saved')
      if (ack.durable) await this.prune(write.documentId)
      return ack
    })
  }

  async discard(documentId: string, documentRevision: number): Promise<CrashDraftAck> {
    return this.serialize(async() => {
      const latest = await this.latestValid(documentId)
      if (!latest || latest.documentRevision !== documentRevision) return { durable: false, reason: 'stale acknowledgement' }
      const ack = await this.tombstone(documentId, documentRevision, 'discarded')
      if (ack.durable) await this.prune(documentId)
      return ack
    })
  }

  /** Clears what earlier launches left behind; run once recovery has scanned. */
  async sweep(): Promise<void> {
    return this.serialize(() => this.prune())
  }

  /** A marker is written only after all draft tombstones have crossed their own durable boundary. */
  async markCleanShutdown(): Promise<CrashDraftAck> {
    return this.serialize(() => this.markCleanShutdownWrite())
  }

  private async markCleanShutdownWrite(): Promise<CrashDraftAck> {
    if ((await this.scan()).length !== 0) return { durable: false, reason: 'unresolved crash drafts remain' }
    try {
      await this.hit('clean-marker')
      await this.writeDurable(path.join(this.directory, 'clean-shutdown.json'), encode({ version: 1, clean: true }))
      return { durable: true }
    } catch (error) { return { durable: false, reason: message(error) } }
  }

  async scan(): Promise<readonly CrashDraftRecoveryRecord[]> {
    const names = await this.storage.readdir(this.directory)
    const tombstones = new Map<string, Tombstone>()
    const commits = new Map<string, Commit>()
    const attempts = new Map<string, { envelope?: CrashDraftEnvelope; revision: number; valid: boolean }[]>()
    await Promise.all(names.map(async name => {
      if (name.endsWith('.tombstone.json')) {
        const tombstone = parseTombstone(await this.storage.readFile(path.join(this.directory, name)))
        if (tombstone) tombstones.set(tombstone.documentId, tombstone)
      } else if (name.endsWith('.commit.json')) {
        const commit = parseCommit(await this.storage.readFile(path.join(this.directory, name)))
        if (commit) commits.set(`${commit.documentId}:${commit.documentRevision}`, commit)
      } else if (name.endsWith('.draft.json')) {
        const parsed = parseEnvelope(await this.storage.readFile(path.join(this.directory, name)))
        const revision = revisionFromFilename(name)
        const id = parsed?.documentId ?? documentIdFromFilename(name)
        if (!id || revision === undefined) return
        const list = attempts.get(id) ?? []
        list.push({ envelope: parsed ?? undefined, revision, valid: parsed !== undefined })
        attempts.set(id, list)
      }
    }))
    const recovered: CrashDraftRecoveryRecord[] = []
    for (const [documentId, values] of attempts) {
      const valid = values.filter(value => value.valid && value.envelope && commits.get(`${value.envelope.documentId}:${value.envelope.documentRevision}`)?.envelopeDigest === value.envelope.digest).sort((a, b) => b.revision - a.revision)[0]
      const tombstone = tombstones.get(documentId)
      if (!valid || (tombstone && tombstone.documentRevision >= valid.revision)) continue
      const highest = Math.max(...values.map(value => value.revision))
      recovered.push({
        kind: 'crash-draft',
        draft: structuredClone(valid.envelope!),
        ...(highest > valid.revision ? { warning: 'latest crash draft was interrupted or corrupt; recovered last valid revision' } : {})
      })
    }
    return recovered.sort((a, b) => a.draft.documentId.localeCompare(b.draft.documentId))
  }

  /** Recovery never writes disk: an altered saved-file baseline becomes a conflicted copy. */
  async recover(currentDiskRevision: (fileKey: string) => Promise<DiskRevision | null>): Promise<readonly (CrashDraftRecoveryRecord & { readonly conflict?: true })[]> {
    const records = await this.scan()
    return Promise.all(records.map(async record => {
      if (!record.draft.fileKey) return record
      const current = await currentDiskRevision(record.draft.fileKey)
      return current === record.draft.observedDiskRevision ? record : { ...record, conflict: true as const }
    }))
  }

  private async tombstone(documentId: string, documentRevision: number, disposition: Tombstone['disposition']): Promise<CrashDraftAck> {
    const base = { version: 1 as const, documentId, documentRevision, disposition }
    const tombstone: Tombstone = { ...base, digest: digestValue(base) }
    try {
      await this.hit('tombstone')
      await this.writeDurable(this.tombstonePath(documentId), encode(tombstone))
      return { durable: true }
    } catch (error) { return { durable: false, reason: message(error) } }
  }

  private async latestValid(documentId: string): Promise<CrashDraftEnvelope | undefined> {
    return (await this.scan()).find(record => record.draft.documentId === documentId)?.draft
  }

  /**
   * Deletes only records that cannot change what scan() returns: revisions at
   * or below the tombstone, and revisions older than the two newest valid ones
   * (the older of the two is the fallback for a corrupt newest). Interrupted
   * attempts above the newest valid revision stay so recovery still warns.
   * Never throws: whatever cannot be deleted is retried by a later prune.
   */
  private async prune(onlyDocumentId?: string): Promise<void> {
    try {
      const documents = new Map<string, PrunableDocument>()
      for (const name of await this.storage.readdir(this.directory)) {
        if (name.endsWith('.tmp')) {
          // Writes are serialized with prune, so no temporary file is in flight.
          if (onlyDocumentId === undefined) await this.remove(name)
          continue
        }
        const id = documentIdFromFilename(name)
        if (!id || (onlyDocumentId !== undefined && id !== onlyDocumentId)) continue
        const document: PrunableDocument = documents.get(id) ?? { revisions: new Map() }
        documents.set(id, document)
        const bytes = (): Promise<Uint8Array> => this.storage.readFile(path.join(this.directory, name))
        if (name.endsWith('.tombstone.json')) {
          const tombstone = parseTombstone(await bytes())
          if (tombstone?.documentId === id) document.tombstone = { name, revision: tombstone.documentRevision }
          continue
        }
        const match = /\.(\d+)\.(draft|commit)\.json$/.exec(name)
        if (!match) continue
        const revision = Number(match[1])
        const entry = document.revisions.get(revision) ?? { files: [] }
        document.revisions.set(revision, entry)
        if (match[2] === 'draft') {
          // A commit left without its draft is ignored by scan(), so the
          // draft goes first in case deletion stops halfway.
          entry.files.unshift(name)
          const envelope = parseEnvelope(await bytes())
          if (envelope?.documentId === id && envelope.documentRevision === revision) entry.envelopeDigest = envelope.digest
        } else {
          entry.files.push(name)
          const commit = parseCommit(await bytes())
          if (commit?.documentId === id && commit.documentRevision === revision) entry.committedDigest = commit.envelopeDigest
        }
      }
      for (const { tombstone, revisions } of documents.values()) {
        const resolvedThrough = tombstone?.revision ?? -1
        const valid = [...revisions]
          .filter(([revision, entry]) => revision > resolvedThrough && entry.envelopeDigest !== undefined && entry.envelopeDigest === entry.committedDigest)
          .map(([revision]) => revision)
          .sort((a, b) => b - a)
        const keepFrom = valid[Math.min(1, valid.length - 1)] ?? Infinity
        let resolvedRemains = false
        for (const [revision, entry] of revisions) {
          if (revision >= keepFrom) continue
          for (const name of entry.files) {
            if (!await this.remove(name) && revision <= resolvedThrough) resolvedRemains = true
          }
        }
        // The tombstone goes last: while any resolved draft remains, it is
        // what keeps that draft from being offered for recovery.
        if (tombstone && !resolvedRemains) await this.remove(tombstone.name)
      }
    } catch {}
  }

  private async remove(name: string): Promise<boolean> {
    try {
      await this.storage.unlink(path.join(this.directory, name))
      return true
    } catch { return false }
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.operationTail.then(work, work)
    this.operationTail = next.then(() => undefined, () => undefined)
    return next
  }

  private async writeDurable(filename: string, bytes: Uint8Array): Promise<void> {
    await this.storage.mkdir(this.directory)
    const temporary = `${filename}.${randomUUID()}.tmp`
    await this.hit('temp-write'); await this.storage.writeFile(temporary, bytes)
    await this.hit('temp-fsync'); await this.storage.syncFile(temporary)
    await this.hit('replace'); await this.storage.rename(temporary, filename)
    await this.storage.syncFile(filename)
    await this.hit('directory-fsync'); await this.storage.syncDirectory(this.directory, filename)
  }

  private async hit(point: CrashDraftFaultPoint): Promise<void> {
    if (point === 'directory-fsync' && this.fault) await this.fault(point)
    else if (this.fault) await this.fault(point)
  }

  private recordPath(documentId: string, revision: number): string { return path.join(this.directory, `${encodeId(documentId)}.${revision}.draft.json`) }
  private commitPath(documentId: string, revision: number): string { return path.join(this.directory, `${encodeId(documentId)}.${revision}.commit.json`) }
  private tombstonePath(documentId: string): string { return path.join(this.directory, `${encodeId(documentId)}.tombstone.json`) }
}

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value))
const encodeId = (id: string): string => Buffer.from(id).toString('base64url')
const documentIdFromFilename = (name: string): string | undefined => {
  const encoded = name.split('.')[0]
  try { return encoded ? Buffer.from(encoded, 'base64url').toString() : undefined } catch { return undefined }
}
const revisionFromFilename = (name: string): number | undefined => {
  const match = /\.(\d+)\.draft\.json$/.exec(name)
  return match ? Number(match[1]) : undefined
}
const digestValue = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const digestEnvelope = (checkpoint: CrashDraftCheckpoint | CrashDraftEnvelope): string => {
  const { digest: _digest, ...body } = checkpoint as CrashDraftEnvelope
  return digestValue({ ...body, version: 1 })
}
const parseEnvelope = (bytes: Uint8Array): CrashDraftEnvelope | undefined => {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as CrashDraftEnvelope
    validateCheckpoint(value)
    return value.version === 1 && value.digest === digestEnvelope(value) ? value : undefined
  } catch { return undefined }
}
const parseTombstone = (bytes: Uint8Array): Tombstone | undefined => {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Tombstone
    const { digest, ...body } = value
    return value.version === 1 && (value.disposition === 'saved' || value.disposition === 'discarded') && digest === digestValue(body) ? value : undefined
  } catch { return undefined }
}
const parseCommit = (bytes: Uint8Array): Commit | undefined => {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Commit
    const { digest, ...body } = value
    return value.version === 1 && !!value.documentId && Number.isSafeInteger(value.documentRevision) && typeof value.envelopeDigest === 'string' && digest === digestValue(body) ? value : undefined
  } catch { return undefined }
}
const validateCheckpoint = (checkpoint: CrashDraftCheckpoint): void => {
  if (!checkpoint.documentId || !Number.isSafeInteger(checkpoint.documentRevision) || checkpoint.documentRevision < 0) throw new Error('crash draft requires stable identity and non-negative revision')
  if ((checkpoint.fileKey === undefined) !== (checkpoint.observedDiskRevision === undefined)) throw new Error('saved crash draft requires both FileKey and DiskRevision')
}
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)
