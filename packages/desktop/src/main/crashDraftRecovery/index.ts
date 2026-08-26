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

/**
 * Durable emergency-only drafts. Each revision has its own immutable record,
 * so a failed replace cannot make the previous valid checkpoint disappear.
 */
export class CrashDraftStore implements CrashDraftRecovery {
  private readonly pending = new Map<string, PendingWrite>()
  private readonly fault?: (point: CrashDraftFaultPoint) => void | Promise<void>

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
    const latest = await this.latestValid(write.documentId)
    if (!latest || latest.documentRevision !== write.documentRevision) return { durable: false, reason: 'stale acknowledgement' }
    return this.tombstone(write.documentId, write.documentRevision, 'saved')
  }

  async discard(documentId: string, documentRevision: number): Promise<CrashDraftAck> {
    const latest = await this.latestValid(documentId)
    if (!latest || latest.documentRevision !== documentRevision) return { durable: false, reason: 'stale acknowledgement' }
    return this.tombstone(documentId, documentRevision, 'discarded')
  }

  /** A marker is written only after all draft tombstones have crossed their own durable boundary. */
  async markCleanShutdown(): Promise<CrashDraftAck> {
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
