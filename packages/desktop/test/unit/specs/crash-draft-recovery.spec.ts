import { describe, expect, it } from 'vitest'
import { CrashDraftStore, type CrashDraftFaultPoint, type CrashDraftStorage } from 'main_renderer/crashDraftRecovery'

class MemoryStorage implements CrashDraftStorage {
  readonly files = new Map<string, Uint8Array>()
  failAt: CrashDraftFaultPoint | undefined
  async mkdir(_directory: string): Promise<void> {}
  async readdir(directory: string): Promise<readonly string[]> {
    const prefix = `${directory}/`.replaceAll('/', '\\')
    return [...this.files.keys()].filter(name => name.startsWith(prefix)).map(name => name.slice(prefix.length))
  }

  async readFile(filename: string): Promise<Uint8Array> {
    const value = this.files.get(filename)
    if (!value) throw new Error('missing file')
    return value.slice()
  }

  async writeFile(filename: string, bytes: Uint8Array): Promise<void> { this.files.set(filename, bytes.slice()) }
  async rename(from: string, to: string): Promise<void> {
    const value = this.files.get(from)
    if (!value) throw new Error('missing temporary file')
    this.files.delete(from); this.files.set(to, value)
  }

  async unlink(filename: string): Promise<void> { this.files.delete(filename) }
  async syncFile(_filename: string): Promise<void> {}
  async syncDirectory(_directory: string): Promise<void> {}
}

const checkpoint = (documentRevision: number, markdown = `revision ${documentRevision}`) => ({
  documentId: 'saved-document',
  fileKey: '/saved.md',
  observedDiskRevision: 'disk-a',
  documentRevision,
  markdown,
  view: { cursor: { line: 0, column: 0 }, selection: null }
})

describe('CrashDraftStore', () => {
  it.each(['temp-write', 'temp-fsync', 'replace', 'directory-fsync'] as const)(
    'retains the prior durable revision across the %s fault gap', async point => {
      const storage = new MemoryStorage()
      const safe = new CrashDraftStore('/drafts', storage)
      await expect(safe.checkpoint(checkpoint(1, 'safe'))).resolves.toEqual({ durable: true })
      const faulty = new CrashDraftStore('/drafts', storage, { fault: fault => { if (fault === point) throw new Error(point) } })
      await expect(faulty.checkpoint(checkpoint(2, 'lost'))).resolves.toEqual({ durable: false, reason: point })
      await expect(safe.scan()).resolves.toEqual([expect.objectContaining({ draft: expect.objectContaining({ documentRevision: 1, markdown: 'safe' }) })])
    }
  )

  it('rejects stale acknowledgements, supports durable Save/Discard, and marks clean only after all decisions', async() => {
    const store = new CrashDraftStore('/drafts', new MemoryStorage())
    const first = store.beginCheckpoint(checkpoint(1))
    const newest = store.beginCheckpoint(checkpoint(2))
    await expect(store.acknowledge(newest)).resolves.toEqual({ durable: true })
    await expect(store.acknowledge(first)).resolves.toEqual({ durable: false, reason: 'stale acknowledgement' })
    await expect(store.markCleanShutdown()).resolves.toEqual({ durable: false, reason: 'unresolved crash drafts remain' })
    await expect(store.acknowledgeSave(newest)).resolves.toEqual({ durable: true })
    await expect(store.markCleanShutdown()).resolves.toEqual({ durable: true })
    await expect(store.scan()).resolves.toEqual([])
  })

  it('falls back from a corrupt latest record and recovers changed disk as a conflicted copy', async() => {
    const storage = new MemoryStorage()
    const store = new CrashDraftStore('/drafts', storage)
    await store.checkpoint(checkpoint(1, 'safe'))
    await store.checkpoint(checkpoint(2, 'latest'))
    const latest = [...storage.files.keys()].find(name => name.endsWith('.2.draft.json'))!
    storage.files.set(latest, new TextEncoder().encode('{bad'))
    const records = await store.recover(async() => 'disk-b')
    expect(records).toEqual([expect.objectContaining({ warning: expect.stringContaining('last valid'), conflict: true, draft: expect.objectContaining({ markdown: 'safe' }) })])
  })

  it('keeps untitled identity without a disk baseline and never clears on cancel', async() => {
    const store = new CrashDraftStore('/drafts', new MemoryStorage())
    const write = store.beginCheckpoint({ documentId: 'untitled-1', documentRevision: 1, markdown: 'unsaved', view: { cursor: { line: 0, column: 0 }, selection: null } })
    await expect(store.acknowledge(write)).resolves.toEqual({ durable: true })
    await expect(store.scan()).resolves.toEqual([expect.objectContaining({ draft: expect.objectContaining({ documentId: 'untitled-1', markdown: 'unsaved' }) })])
  })

  it.each(['tombstone', 'clean-marker'] as const)('never acknowledges the %s durability gap', async point => {
    const storage = new MemoryStorage()
    const safe = new CrashDraftStore('/drafts', storage)
    const write = safe.beginCheckpoint(checkpoint(1))
    await expect(safe.acknowledge(write)).resolves.toEqual({ durable: true })
    const faulty = new CrashDraftStore('/drafts', storage, { fault: fault => { if (fault === point) throw new Error(point) } })
    if (point === 'tombstone') {
      await expect(faulty.acknowledgeSave(write)).resolves.toEqual({ durable: false, reason: point })
      await expect(safe.scan()).resolves.toHaveLength(1)
    } else {
      await expect(safe.acknowledgeSave(write)).resolves.toEqual({ durable: true })
      await expect(faulty.markCleanShutdown()).resolves.toEqual({ durable: false, reason: point })
    }
  })
})
