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

  unlinkFails = false
  async unlink(filename: string): Promise<void> {
    if (this.unlinkFails) throw new Error('unlink refused')
    this.files.delete(filename)
  }

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

  it('recovers a saved draft without conflict when its observed disk revision is unchanged', async() => {
    const store = new CrashDraftStore('/drafts', new MemoryStorage())
    await store.checkpoint(checkpoint(1, 'safe'))
    const [recovered] = await store.recover(async() => 'disk-a')
    expect(recovered?.conflict).toBeUndefined()
    expect(recovered?.draft.markdown).toBe('safe')
  })

  it('durably preserves an observed missing-file baseline and conflicts only if the file later appears', async() => {
    const store = new CrashDraftStore('/drafts', new MemoryStorage())
    await expect(store.checkpoint({ ...checkpoint(1, 'missing-file edits'), observedDiskRevision: null })).resolves.toEqual({ durable: true })
    const [missing] = await store.recover(async() => null)
    expect(missing?.draft.observedDiskRevision).toBeNull()
    expect(missing?.conflict).toBeUndefined()
    const [appeared] = await store.recover(async() => 'disk-after-crash')
    expect(appeared?.conflict).toBe(true)
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

const draftOf = (documentId: string, documentRevision: number) => ({ ...checkpoint(documentRevision), documentId })

// File names carry the base64url document id; decode it so assertions read as
// `<document id>.<revision>.<kind>`.
const listing = (storage: MemoryStorage): string[] => [...storage.files.keys()]
  .map(key => key.split(/[\\/]/).pop() ?? key)
  .map(name => {
    const [encoded = '', ...rest] = name.split('.')
    return rest.length && !name.endsWith('.tmp') && encoded !== 'clean-shutdown'
      ? [Buffer.from(encoded, 'base64url').toString(), ...rest].join('.')
      : name
  })
  .sort()

describe('CrashDraftStore cleanup', () => {
  it.each(['discard', 'save'] as const)('deletes every file of a document once a %s resolves it', async resolution => {
    const storage = new MemoryStorage()
    const store = new CrashDraftStore('/drafts', storage)
    for (const revision of [1, 2]) await store.checkpoint(checkpoint(revision))
    const last = store.beginCheckpoint(checkpoint(3))
    await expect(store.acknowledge(last)).resolves.toEqual({ durable: true })

    const resolved = resolution === 'discard' ? store.discard('saved-document', 3) : store.acknowledgeSave(last)
    await expect(resolved).resolves.toEqual({ durable: true })

    expect(listing(storage)).toEqual([])
    await expect(store.scan()).resolves.toEqual([])
    await expect(store.markCleanShutdown()).resolves.toEqual({ durable: true })
  })

  // The previous revision stays as the fallback for a corrupt newest one.
  it('keeps only the two newest revisions of an unresolved document', async() => {
    const storage = new MemoryStorage()
    const store = new CrashDraftStore('/drafts', storage)
    for (const revision of [1, 2, 3, 4, 5]) await expect(store.checkpoint(checkpoint(revision))).resolves.toEqual({ durable: true })

    expect(listing(storage)).toEqual([
      'saved-document.4.commit.json',
      'saved-document.4.draft.json',
      'saved-document.5.commit.json',
      'saved-document.5.draft.json'
    ])
    const [recovered] = await store.scan()
    expect(recovered?.draft.markdown).toBe('revision 5')
  })

  it('drops the saved revisions of a document edited again after saving', async() => {
    const storage = new MemoryStorage()
    const store = new CrashDraftStore('/drafts', storage)
    await store.checkpoint(checkpoint(1))
    const saved = store.beginCheckpoint(checkpoint(2))
    await store.acknowledge(saved)
    await expect(store.acknowledgeSave(saved)).resolves.toEqual({ durable: true })
    await expect(store.checkpoint(checkpoint(3))).resolves.toEqual({ durable: true })

    expect(listing(storage)).toEqual(['saved-document.3.commit.json', 'saved-document.3.draft.json'])
    const [recovered] = await store.scan()
    expect(recovered?.draft.markdown).toBe('revision 3')
  })

  it('keeps acknowledgements durable and recovery unchanged when files cannot be deleted', async() => {
    const storage = new MemoryStorage()
    storage.unlinkFails = true
    const store = new CrashDraftStore('/drafts', storage)
    for (const revision of [1, 2, 3]) await expect(store.checkpoint(checkpoint(revision))).resolves.toEqual({ durable: true })
    const [unresolved] = await store.scan()
    expect(unresolved?.draft.markdown).toBe('revision 3')

    await expect(store.discard('saved-document', 3)).resolves.toEqual({ durable: true })
    await expect(store.scan()).resolves.toEqual([])
    await expect(store.markCleanShutdown()).resolves.toEqual({ durable: true })
  })

  // Earlier versions never deleted anything, so a profile may hold many
  // resolved documents, superseded revisions and interrupted temporary files.
  it('sweeps an earlier backlog without changing what a launch recovers', async() => {
    const storage = new MemoryStorage()
    storage.unlinkFails = true
    const backlog = new CrashDraftStore('/drafts', storage)
    for (const revision of [1, 2, 3]) await backlog.checkpoint(draftOf('resolved', revision))
    await backlog.discard('resolved', 3)
    for (const revision of [1, 2, 3, 4]) await backlog.checkpoint(draftOf('unresolved', revision))
    await backlog.markCleanShutdown().catch(() => undefined)
    storage.files.set('\\drafts\\leftover.draft.json.0d5c.tmp', new TextEncoder().encode('{"partial'))
    storage.unlinkFails = false

    const store = new CrashDraftStore('/drafts', storage)
    const before = await store.scan()
    await store.sweep()

    await expect(store.scan()).resolves.toEqual(before)
    expect(listing(storage)).toEqual([
      'unresolved.3.commit.json',
      'unresolved.3.draft.json',
      'unresolved.4.commit.json',
      'unresolved.4.draft.json'
    ])
  })

  it('keeps an interrupted newest attempt so recovery still warns about it', async() => {
    const storage = new MemoryStorage()
    storage.unlinkFails = true
    const backlog = new CrashDraftStore('/drafts', storage)
    for (const revision of [1, 2, 3]) await backlog.checkpoint(checkpoint(revision))
    const interrupted = [...storage.files.keys()].find(name => name.endsWith('.3.draft.json'))
    if (!interrupted) throw new Error('expected the revision 3 draft')
    storage.files.set(interrupted.replace('.3.draft.json', '.4.draft.json'), new TextEncoder().encode('{bad'))
    storage.unlinkFails = false

    const store = new CrashDraftStore('/drafts', storage)
    const before = await store.scan()
    expect(before).toEqual([expect.objectContaining({ warning: expect.stringContaining('last valid'), draft: expect.objectContaining({ documentRevision: 3 }) })])
    await store.sweep()

    await expect(store.scan()).resolves.toEqual(before)
    expect(listing(storage)).toEqual([
      'saved-document.2.commit.json',
      'saved-document.2.draft.json',
      'saved-document.3.commit.json',
      'saved-document.3.draft.json',
      'saved-document.4.draft.json'
    ])
  })
})
