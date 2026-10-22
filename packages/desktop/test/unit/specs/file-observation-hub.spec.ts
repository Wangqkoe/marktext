import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  ChokidarFileObservationWatchFactory,
  FileObservationHub,
  CaseSensitivityResolver,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory,
  NodeFileObservationStorage,
  type DiskChange,
  type FileObservationSubscriber
} from 'main_renderer/filesystem/fileObservation'
import type { FileKey } from '@shared/workspace/fileObservation'

const raw = (name: string): FileKey => `C:/workspace/${name}.md`

const deferred = (): { readonly promise: Promise<void>; readonly release: () => void } => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const subscriber = (
  documentId: string,
  fileKey: FileKey,
  state: 'clean' | 'dirty',
  changes: DiskChange[]
): FileObservationSubscriber => ({
  documentId,
  documentRevision: 1,
  fileKey,
  getState: () => state,
  onDiskChange: (change) => changes.push(change)
})

describe('FileObservationHub', () => {
  const hubs: FileObservationHub[] = []

  afterEach(() => {
    hubs.splice(0).forEach((hub) => hub.close())
  })

  const createHub = (
    options = {}
  ): {
    readonly hub: FileObservationHub
    readonly storage: MemoryFileObservationStorage
    readonly watchers: MemoryFileObservationWatchFactory
  } => {
    const storage = new MemoryFileObservationStorage()
    const watchers = new MemoryFileObservationWatchFactory()
    const hub = new FileObservationHub(storage, watchers, options)
    hubs.push(hub)
    return { hub, storage, watchers }
  }

  it('canonicalizes case, symlink parents, and nonexistent children before allocating a watcher', async() => {
    const { hub, storage, watchers } = createHub()
    storage.aliasParent('C:/workspace/link', 'C:/workspace/real')
    const direct = await hub.canonicalFileKey('C:/WORKSPACE/REAL/New.md')
    const viaLink = await hub.canonicalFileKey('C:/workspace/link/new.md')
    expect(viaLink).toBe(direct)
    storage.files.set(direct, Buffer.from('baseline'))

    const directChanges: DiskChange[] = []
    const linkChanges: DiskChange[] = []
    const dirtyChanges: DiskChange[] = []
    const directLease = await hub.subscribe(
      subscriber('direct', 'C:/WORKSPACE/REAL/New.md', 'clean', directChanges)
    )
    await hub.subscribe(subscriber('link', 'C:/workspace/link/new.md', 'clean', linkChanges))
    await hub.subscribe(subscriber('dirty', 'C:/workspace/link/new.md', 'dirty', dirtyChanges))
    expect(watchers.activeWatchers.get(direct)).toHaveLength(1)
    expect(watchers.activeWatchers).toHaveLength(1)

    const baseline = await hub.getDiskRevision('C:/workspace/link/new.md')
    if (!baseline) throw new Error('expected baseline')
    const saved = await hub.save({
      documentId: 'direct',
      documentRevision: 1,
      fileKey: 'C:/WORKSPACE/REAL/New.md',
      observedDiskRevision: baseline,
      ownerLease: directLease,
      bytes: Buffer.from('saved')
    })
    if (saved.status !== 'saved') throw new Error('expected save')
    watchers.emit(direct)
    await vi.waitFor(() => expect(linkChanges).toHaveLength(1))
    expect(directChanges).toEqual([])
    expect(linkChanges[0]?.kind).toBe('reload')
    expect(dirtyChanges[0]?.kind).toBe('conflict')
  })

  it('drops an old queued delayed-read event after handoff instead of delivering it to either generation', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = raw('handoff')
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('external'))
    const sourceChanges: DiskChange[] = []
    const targetChanges: DiskChange[] = []
    const source = await hub.subscribe(subscriber('source', fileKey, 'clean', sourceChanges))
    const readStarted = deferred()
    const readGate = deferred()
    storage.readBarrier = readGate.promise
    storage.onRead = readStarted.release

    watchers.emit(canonical)
    await readStarted.promise
    const target = await hub.handoff(source, subscriber('target', fileKey, 'clean', targetChanges))
    expect(target).toBeDefined()
    expect(target?.generation).toBeGreaterThan(source.generation)
    expect(watchers.activeWatchers.get(canonical)).toHaveLength(1)
    readGate.release()
    await Promise.resolve()
    await Promise.resolve()
    expect(sourceChanges).toEqual([])
    expect(targetChanges).toEqual([])
  })

  it('keeps an old delayed read deliverable to an unchanged peer across ordinary subscribe/release', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = raw('peer-churn')
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('external'))
    const stableChanges: DiskChange[] = []
    await hub.subscribe(subscriber('stable', fileKey, 'clean', stableChanges))
    const readStarted = deferred()
    const readGate = deferred()
    storage.readBarrier = readGate.promise
    storage.onRead = readStarted.release
    watchers.emit(canonical)
    await readStarted.promise
    const transient = await hub.subscribe(subscriber('transient', fileKey, 'clean', []))
    expect(hub.release(transient)).toBe(true)
    readGate.release()
    await vi.waitFor(() => expect(stableChanges).toHaveLength(1))
  })

  it('honors injected case-sensitivity policy for macOS-style and case-sensitive volumes', async() => {
    const insensitive = new MemoryFileObservationStorage({ caseSensitive: false })
    const sensitive = new MemoryFileObservationStorage({ caseSensitive: true })
    await expect(insensitive.canonicalize('C:/workspace/Foo.md')).resolves.toBe(
      await insensitive.canonicalize('C:/workspace/foo.md')
    )
    await expect(sensitive.canonicalize('C:/workspace/Foo.md')).resolves.not.toBe(
      await sensitive.canonicalize('C:/workspace/foo.md')
    )
  })

  it('probes existing components per device, caches results, and falls back to sensitive on unknown paths', async() => {
    const calls: string[] = []
    const resolver = new CaseSensitivityResolver({
      async realpath(pathname) {
        calls.push(pathname)
        if (pathname.endsWith('foo.md') || pathname.endsWith('Foo.md')) return 'C:/volume/Foo.md'
        if (pathname.endsWith('Bar.md')) return 'D:/volume/Bar.md'
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' })
        throw error
      },
      async stat(pathname) {
        if (pathname.endsWith('Foo.md')) return { dev: 1, ino: 10 }
        if (pathname.endsWith('Bar.md')) return { dev: 2, ino: 20 }
        return { dev: 1, ino: 10 }
      }
    })
    await expect(resolver.resolve('C:/volume/Foo.md')).resolves.toBe(false)
    const afterFirst = calls.length
    await expect(resolver.resolve('C:/volume/foo.md')).resolves.toBe(false)
    expect(calls).toHaveLength(afterFirst + 1) // Only realpath runs; device probe is cached.
    await expect(resolver.resolve('D:/volume/Bar.md')).resolves.toBe(true)
    await expect(resolver.resolve('C:/unknown/123')).resolves.toBe(true)
  })

  it('internally consumes own-write receipts while merged and late raw events are no-ops', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = raw('same-content')
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('baseline'))
    const writerChanges: DiskChange[] = []
    const peerChanges: DiskChange[] = []
    const writer = await hub.subscribe(subscriber('writer', fileKey, 'clean', writerChanges))
    await hub.subscribe(subscriber('peer', fileKey, 'clean', peerChanges))
    const baseline = await hub.getDiskRevision(fileKey)
    if (!baseline) throw new Error('expected baseline')

    const first = await hub.save({
      documentId: 'writer',
      documentRevision: 1,
      fileKey,
      observedDiskRevision: baseline,
      ownerLease: writer,
      bytes: Buffer.from('same')
    })
    if (first.status !== 'saved') throw new Error('expected first save')
    expect(first).not.toHaveProperty('receipt')
    expect('observeOwnWriteReceipt' in hub).toBe(false)
    expect(peerChanges).toHaveLength(1)
    expect(writerChanges).toEqual([])
    // An external event with identical bytes has no authority to consume or
    // recreate the receipt, and the writer baseline already makes it a no-op.
    storage.files.set(canonical, Buffer.from('same'))
    watchers.emit(canonical)
    await Promise.resolve()
    expect(peerChanges).toHaveLength(1)
    expect(writerChanges).toEqual([])
    await expect(hub.refreshDocumentRevision(writer, 2)).resolves.toBe(true)
    const second = await hub.save({
      documentId: 'writer',
      documentRevision: 2,
      fileKey,
      observedDiskRevision: first.diskRevision,
      ownerLease: writer,
      bytes: Buffer.from('same')
    })
    if (second.status !== 'saved') throw new Error('expected second save')
    expect(await hub.pendingOwnWriteCount(fileKey)).toBe(2)

    // A merged/reordered raw own event remains origin-free and no-ops by hash.
    watchers.emit(canonical)
    await vi.waitFor(() => expect(peerChanges).toHaveLength(1))
    expect(writerChanges).toEqual([])
    expect(await hub.pendingOwnWriteCount(fileKey)).toBe(2)
    watchers.emit(canonical)
    await Promise.resolve()
    expect(peerChanges).toHaveLength(1)
    expect(writerChanges).toEqual([])

    await expect(hub.refreshDocumentRevision(writer, 3)).resolves.toBe(true)
    const third = await hub.save({
      documentId: 'writer',
      documentRevision: 3,
      fileKey,
      observedDiskRevision: second.diskRevision,
      ownerLease: writer,
      bytes: Buffer.from('same')
    })
    if (third.status !== 'saved') throw new Error('expected third save')
    watchers.emit(canonical)
    await vi.waitFor(async() => expect(await hub.pendingOwnWriteCount(fileKey)).toBe(3))
    expect(writerChanges).toEqual([])
  })

  it('keeps own auto-save events from reaching a writer that holds a newer unsaved edit', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = raw('queued-own-saves')
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('baseline'))
    let writerState: 'clean' | 'dirty' = 'clean'
    const writerChanges: DiskChange[] = []
    const peerChanges: DiskChange[] = []
    const writer = await hub.subscribe({
      ...subscriber('writer', fileKey, 'clean', writerChanges),
      getState: () => writerState
    })
    await hub.subscribe(subscriber('peer', fileKey, 'clean', peerChanges))
    let revision = await hub.getDiskRevision(fileKey)
    if (!revision) throw new Error('expected baseline')

    const saveAs = async(documentRevision: number, bytes: string): Promise<void> => {
      await expect(hub.refreshDocumentRevision(writer, documentRevision)).resolves.toBe(true)
      const result = await hub.save({
        documentId: 'writer',
        documentRevision,
        fileKey,
        observedDiskRevision: revision,
        ownerLease: writer,
        bytes: Buffer.from(bytes)
      })
      if (result.status !== 'saved') throw new Error(`expected save ${bytes}`)
      revision = result.diskRevision
    }

    await saveAs(1, 'save A')
    // Chokidar reports a write as soon as its bytes land, which can be before
    // the save has re-read the file and recorded its revision.
    storage.onWrite = () => watchers.emit(canonical)
    await saveAs(2, 'save B')
    storage.onWrite = undefined
    writerState = 'dirty'
    // The coalesced A/B event arrives while edit C is still pending.
    watchers.emit(canonical)
    await vi.waitFor(() => expect(peerChanges).toHaveLength(2))
    await Promise.resolve()

    expect(writerChanges).toEqual([])
    expect(peerChanges.map((change) => change.diskRevision)).toEqual([
      expect.any(String),
      revision
    ])
  })

  it('expires and bounds pending suppression entries when watcher events are lost', async() => {
    let now = 0
    const { hub, storage } = createHub({
      now: () => now,
      pendingOwnWriteTtlMs: 10,
      maxPendingOwnWrites: 2
    })
    const fileKey = raw('ttl')
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('a'))
    const lease = await hub.subscribe(subscriber('writer', fileKey, 'clean', []))
    let revision = await hub.getDiskRevision(fileKey)
    if (!revision) throw new Error('expected baseline')
    for (let documentRevision = 1; documentRevision <= 3; documentRevision += 1) {
      await expect(hub.refreshDocumentRevision(lease, documentRevision)).resolves.toBe(true)
      const result = await hub.save({
        documentId: 'writer',
        documentRevision,
        fileKey,
        observedDiskRevision: revision,
        ownerLease: lease,
        bytes: Buffer.from(String(documentRevision))
      })
      if (result.status !== 'saved') throw new Error('expected save')
      revision = result.diskRevision
    }
    expect(await hub.pendingOwnWriteCount(fileKey)).toBe(2)
    now = 11
    expect(await hub.pendingOwnWriteCount(fileKey)).toBe(0)
  })

  it('keeps a durable save successful when peer notifications throw', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = raw('throwing-peer')
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('baseline'))
    const writerChanges: DiskChange[] = []
    const cleanChanges: DiskChange[] = []
    const dirtyChanges: DiskChange[] = []
    const writer = await hub.subscribe(subscriber('writer', fileKey, 'clean', writerChanges))
    await hub.subscribe({
      ...subscriber('throwing-clean', fileKey, 'clean', []),
      onDiskChange: () => {
        throw new Error('clean peer failed')
      }
    })
    await hub.subscribe({
      ...subscriber('throwing-dirty', fileKey, 'dirty', []),
      onDiskChange: () => {
        throw new Error('dirty peer failed')
      }
    })
    await hub.subscribe(subscriber('clean-peer', fileKey, 'clean', cleanChanges))
    await hub.subscribe(subscriber('dirty-peer', fileKey, 'dirty', dirtyChanges))
    const baseline = await hub.getDiskRevision(fileKey)
    if (!baseline) throw new Error('expected baseline')
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const result = await hub.save({
        documentId: 'writer',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: baseline,
        ownerLease: writer,
        bytes: Buffer.from('saved')
      })
      if (result.status !== 'saved') throw new Error('expected save')
      expect(storage.files.get(canonical)).toEqual(Buffer.from('saved'))
      expect(writerChanges).toEqual([])
      expect(cleanChanges).toEqual([{ kind: 'reload', fileKey: canonical, diskRevision: result.diskRevision }])
      expect(dirtyChanges).toEqual([
        { kind: 'conflict', fileKey: canonical, diskRevision: result.diskRevision }
      ])
      expect(error).toHaveBeenCalledTimes(2)

      // Every slot, including failed callbacks, received the baseline before
      // notification, so a late raw event cannot retry or duplicate delivery.
      watchers.emit(canonical)
      await Promise.resolve()
      expect(cleanChanges).toHaveLength(1)
      expect(dirtyChanges).toHaveLength(1)
      expect(await hub.pendingOwnWriteCount(fileKey)).toBe(1)
    } finally {
      error.mockRestore()
    }
  })

  it('keeps production Chokidar raw events untrusted after an internally authenticated write', async() => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'marktext-t04-'))
    const fileKey = path.join(directory, 'note.md') as FileKey
    await writeFile(fileKey, 'baseline')
    const hub = new FileObservationHub(
      new NodeFileObservationStorage(),
      new ChokidarFileObservationWatchFactory()
    )
    hubs.push(hub)
    try {
      const writerChanges: DiskChange[] = []
      const cleanPeerChanges: DiskChange[] = []
      const dirtyPeerChanges: DiskChange[] = []
      const writer = await hub.subscribe(subscriber('writer', fileKey, 'clean', writerChanges))
      await hub.subscribe(subscriber('clean-peer', fileKey, 'clean', cleanPeerChanges))
      await hub.subscribe(subscriber('dirty-peer', fileKey, 'dirty', dirtyPeerChanges))
      const baseline = await hub.getDiskRevision(fileKey)
      if (!baseline) throw new Error('expected baseline')

      const result = await hub.save({
        documentId: 'writer',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: baseline,
        ownerLease: writer,
        bytes: Buffer.from('own')
      })
      if (result.status !== 'saved') throw new Error('expected save')

      // The authenticated in-process receipt suppresses only its writer; the
      // production adapter still emits origin-free raw events later.
      expect(writerChanges).toEqual([])
      expect(cleanPeerChanges).toHaveLength(1)
      expect(dirtyPeerChanges).toHaveLength(1)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(writerChanges).toEqual([])
      expect(cleanPeerChanges).toHaveLength(1)
      expect(dirtyPeerChanges).toHaveLength(1)

      await writeFile(fileKey, 'external')
      await vi.waitFor(() => expect(writerChanges).toHaveLength(1), { timeout: 4000 })
      expect(cleanPeerChanges).toHaveLength(2)
      expect(dirtyPeerChanges).toHaveLength(2)
      expect(writerChanges[0]?.kind).toBe('reload')
      expect(cleanPeerChanges[1]?.kind).toBe('reload')
      expect(dirtyPeerChanges[1]?.kind).toBe('conflict')
    } finally {
      hub.close()
      await rm(directory, { recursive: true, force: true })
    }
  }, 10_000)
})
