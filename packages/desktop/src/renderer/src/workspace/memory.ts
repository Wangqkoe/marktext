import type {
  CrashDraftCheckpoint,
  CrashDraftEnvelope,
  CrashDraftRecovery,
  CrashDraftRecoveryRecord,
  MoveRecovery,
  MoveRecoveryRecord
} from '@shared/workspace'

export type CrashDraftFault = 'interrupted' | 'corrupt-latest'

export interface MemoryCrashDraftWrite {
  readonly writeId: string
  readonly documentId: string
  readonly documentRevision: number
}

interface PendingWrite extends MemoryCrashDraftWrite {
  readonly envelope: CrashDraftEnvelope
  readonly fault?: CrashDraftFault
}

interface StoredRecord {
  readonly envelope: CrashDraftEnvelope
  readonly valid: boolean
}

/**
 * Deterministic stand-in for the CrashDraft durable protocol. It models the
 * acknowledgement boundary and bad latest records; it does not perform I/O.
 */
export class MemoryCrashDraftRecovery implements CrashDraftRecovery {
  private readonly drafts = new Map<string, StoredRecord[]>()
  private readonly pending = new Map<string, PendingWrite>()
  private nextId = 1

  beginCheckpoint(checkpoint: CrashDraftCheckpoint, fault?: CrashDraftFault): MemoryCrashDraftWrite {
    const confirmed = this.latestValid(checkpoint.documentId)
    if (confirmed && checkpoint.documentRevision <= confirmed.documentRevision) {
      throw new Error('document revision must advance monotonically')
    }
    if (confirmed && (confirmed.fileKey !== checkpoint.fileKey || confirmed.observedDiskRevision !== checkpoint.observedDiskRevision)) {
      throw new Error('saved document identity or disk baseline changed')
    }
    if ((checkpoint.fileKey === undefined) !== (checkpoint.observedDiskRevision === undefined)) {
      throw new Error('saved crash draft requires both FileKey and DiskRevision')
    }
    const envelope: CrashDraftEnvelope = {
      ...structuredClone(checkpoint),
      version: 1,
      digest: digest(checkpoint)
    }
    const write: PendingWrite = {
      writeId: `draft-write-${this.nextId++}`,
      documentId: checkpoint.documentId,
      documentRevision: checkpoint.documentRevision,
      envelope,
      ...(fault ? { fault } : {})
    }
    this.pending.set(write.writeId, write)
    return { writeId: write.writeId, documentId: write.documentId, documentRevision: write.documentRevision }
  }

  /** Only this durable acknowledgement advances the checkpoint revision. */
  acknowledge(write: MemoryCrashDraftWrite): { readonly durable: boolean; readonly reason?: string } {
    const pending = this.pending.get(write.writeId)
    if (!pending || pending.documentId !== write.documentId || pending.documentRevision !== write.documentRevision) {
      return { durable: false, reason: 'stale acknowledgement' }
    }
    this.pending.delete(write.writeId)
    const latest = this.latestValid(pending.documentId)
    if (latest && pending.documentRevision <= latest.documentRevision) {
      return { durable: false, reason: 'stale acknowledgement' }
    }
    if (pending.fault) {
      const records = this.drafts.get(pending.documentId) ?? []
      records.push({ envelope: pending.envelope, valid: false })
      this.drafts.set(pending.documentId, records)
      return { durable: false, reason: pending.fault }
    }
    const records = this.drafts.get(pending.documentId) ?? []
    records.push({ envelope: pending.envelope, valid: true })
    this.drafts.set(pending.documentId, records)
    return { durable: true }
  }

  checkpoint(checkpoint: CrashDraftCheckpoint, fault?: CrashDraftFault): { readonly durable: boolean; readonly reason?: string } {
    return this.acknowledge(this.beginCheckpoint(checkpoint, fault))
  }

  async scan(): Promise<readonly CrashDraftRecoveryRecord[]> {
    const records: CrashDraftRecoveryRecord[] = []
    for (const entries of this.drafts.values()) {
      const latest = entries.at(-1)
      const valid = [...entries].reverse().find((entry) => entry.valid && entry.envelope.digest === digest(entry.envelope))
      if (!valid) continue
      records.push({
        kind: 'crash-draft',
        draft: structuredClone(valid.envelope),
        ...(latest && !latest.valid ? { warning: 'latest crash draft was interrupted or corrupt; recovered last valid revision' } : {})
      })
    }
    return records
  }

  private latestValid(documentId: string): CrashDraftEnvelope | undefined {
    const records = this.drafts.get(documentId) ?? []
    return [...records].reverse().find((entry) => entry.valid)?.envelope
  }
}

/** Separate test double for the Move WAL/capsule recovery source. */
export class MemoryMoveRecovery implements MoveRecovery {
  private readonly entries: MoveRecoveryRecord[] = []

  add(record: Omit<MoveRecoveryRecord, 'kind'>): void {
    this.entries.push({ kind: 'move-recovery', ...structuredClone(record) })
  }

  async scan(): Promise<readonly MoveRecoveryRecord[]> {
    return structuredClone(this.entries)
  }
}

function digest(value: Omit<CrashDraftEnvelope, 'version' | 'digest'> | CrashDraftEnvelope): string {
  const { digest: _digest, version: _version, ...payload } = value as CrashDraftEnvelope
  let hash = 2166136261
  for (const byte of new TextEncoder().encode(JSON.stringify(payload))) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return `memory-fnv1a-${(hash >>> 0).toString(16)}`
}
