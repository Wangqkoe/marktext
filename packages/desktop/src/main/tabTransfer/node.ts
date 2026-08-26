import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  CapsuleStorage,
  JournalRecord,
  TransferEndpoint,
  TransferJournal,
  TransferRecoveryPayload
} from './types'

const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value))
const decode = <T>(value: Uint8Array): T => JSON.parse(new TextDecoder().decode(value)) as T

/** Minimal durable adapters for the existing T05 seams; no second transfer state machine. */
export class NodeTransferJournal implements TransferJournal {
  constructor(private readonly directory: string) {}

  append(record: JournalRecord): Promise<void> { return this.appendLine('journal.ndjson', record) }

  abort(record: Omit<JournalRecord, 'kind' | 'aborted'>): Promise<void> {
    return this.append({ ...record, kind: 'observed', aborted: true })
  }

  records(): Promise<readonly JournalRecord[]> { return this.readLines<JournalRecord>('journal.ndjson') }

  migrateOwner(record: { transferId: string; ownerSessionId: string; recoveryWindowSessionId: string; recoveryWindow: TransferEndpoint }): Promise<void> {
    return this.appendLine('migrations.ndjson', record)
  }

  ownerMigrations(): Promise<readonly { transferId: string; ownerSessionId: string; recoveryWindowSessionId: string; recoveryWindow: TransferEndpoint }[]> {
    return this.readLines('migrations.ndjson')
  }

  private async appendLine(name: string, record: unknown): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true })
    const file = path.join(this.directory, name)
    const handle = await fs.open(file, 'a')
    try { await handle.write(bytes(record)); await handle.write('\n'); await handle.sync() } finally { await handle.close() }
    await syncDirectory(this.directory, file)
  }

  private async readLines<T>(name: string): Promise<readonly T[]> {
    try {
      const data = await fs.readFile(path.join(this.directory, name), 'utf8')
      return data.split('\n').flatMap(line => {
        try { return line.trim() ? [JSON.parse(line) as T] : [] } catch { return [] }
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
}

export class NodeCapsuleStorage implements CapsuleStorage {
  private readonly tombstones = new Set<string>()
  constructor(private readonly directory: string) {}

  put(transferId: string, content: Uint8Array, digest: string): Promise<void> {
    return this.write(`${transferId}.capsule.json`, bytes({ digest, bytes: Buffer.from(content).toString('base64') }))
  }

  async get(transferId: string): Promise<{ readonly bytes: Uint8Array; readonly digest: string } | undefined> {
    const value = await this.read<{ digest: string; bytes: string }>(`${transferId}.capsule.json`)
    return value && { digest: value.digest, bytes: Buffer.from(value.bytes, 'base64') }
  }

  putRecovery(transferId: string, payload: TransferRecoveryPayload): Promise<void> { return this.write(`${transferId}.recovery.json`, bytes(payload)) }
  getRecovery(transferId: string): Promise<TransferRecoveryPayload | undefined> { return this.read(`${transferId}.recovery.json`) }
  async tombstone(transferId: string): Promise<void> { this.tombstones.add(transferId); await this.write(`${transferId}.tombstone`, bytes({ transferId })) }
  async gc(): Promise<void> {
    for (const id of this.tombstones) {
      await Promise.all([`${id}.capsule.json`, `${id}.recovery.json`].map(async name => {
        try { await fs.unlink(path.join(this.directory, name)) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }))
    }
    this.tombstones.clear()
  }

  private async write(name: string, content: Uint8Array): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true })
    const target = path.join(this.directory, name); const temp = `${target}.${process.pid}.tmp`
    const handle = await fs.open(temp, 'w')
    try { await handle.write(content); await handle.sync() } finally { await handle.close() }
    await fs.rename(temp, target)
    await syncDirectory(this.directory, target)
  }

  private async read<T>(name: string): Promise<T | undefined> {
    try { return decode<T>(await fs.readFile(path.join(this.directory, name))) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  }
}

const syncDirectory = async(directory: string, fallbackFile: string): Promise<void> => {
  try {
    const handle = await fs.open(directory, 'r')
    try { await handle.sync() } finally { await handle.close() }
  } catch (error) {
    // Windows does not expose directory handles. The just-written target is
    // re-synced there as the platform-equivalent metadata barrier.
    if (process.platform !== 'win32') throw error
    const handle = await fs.open(fallbackFile, 'r+')
    try { await handle.sync() } finally { await handle.close() }
  }
}
