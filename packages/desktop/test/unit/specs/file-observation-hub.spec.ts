import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FileObservationHub,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory,
  type DiskChange,
  type FileObservationSubscriber
} from 'main_renderer/filesystem/fileObservation'
import type { FileKey } from '@shared/workspace/fileObservation'

const key = (name: string): FileKey => `C:/workspace/${name}.md`

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

  const createHub = (): {
    readonly hub: FileObservationHub
    readonly storage: MemoryFileObservationStorage
    readonly watchers: MemoryFileObservationWatchFactory
  } => {
    const storage = new MemoryFileObservationStorage()
    const watchers = new MemoryFileObservationWatchFactory()
    const hub = new FileObservationHub(storage, watchers)
    hubs.push(hub)
    return { hub, storage, watchers }
  }

  it('shares one OS watcher, suppresses only the writer, and tells clean/dirty peers to reload/conflict', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = key('shared')
    storage.files.set(fileKey, Buffer.from('before'))
    const writerChanges: DiskChange[] = []
    const cleanChanges: DiskChange[] = []
    const dirtyChanges: DiskChange[] = []
    hub.subscribe(subscriber('writer', fileKey, 'clean', writerChanges))
    hub.subscribe(subscriber('clean-peer', fileKey, 'clean', cleanChanges))
    hub.subscribe(subscriber('dirty-peer', fileKey, 'dirty', dirtyChanges))
    expect(watchers.activeWatchers.get(fileKey)).toHaveLength(1)

    const before = await hub.getDiskRevision(fileKey)
    if (!before) throw new Error('expected initial disk revision')
    expect(
      await hub.save({
        documentId: 'writer',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: before,
        bytes: Buffer.from('saved by writer')
      })
    ).toMatchObject({ status: 'saved' })
    watchers.emit(fileKey)
    await vi.waitFor(() => expect(cleanChanges).toHaveLength(1))

    expect(writerChanges).toEqual([])
    expect(cleanChanges[0]?.kind).toBe('reload')
    expect(dirtyChanges[0]?.kind).toBe('conflict')
  })

  it('keeps queued own-save events keyed to their persisted bytes', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = key('queued')
    storage.files.set(fileKey, Buffer.from('one'))
    const writerChanges: DiskChange[] = []
    const peerChanges: DiskChange[] = []
    hub.subscribe(subscriber('writer', fileKey, 'clean', writerChanges))
    hub.subscribe(subscriber('peer', fileKey, 'clean', peerChanges))

    const firstRevision = await hub.getDiskRevision(fileKey)
    if (!firstRevision) throw new Error('expected initial disk revision')
    const first = await hub.save({
      documentId: 'writer',
      documentRevision: 1,
      fileKey,
      observedDiskRevision: firstRevision,
      bytes: Buffer.from('two')
    })
    expect(first.status).toBe('saved')
    watchers.emit(fileKey)
    await vi.waitFor(() => expect(peerChanges).toHaveLength(1))
    expect(writerChanges).toEqual([])

    if (first.status !== 'saved') throw new Error('expected first save')
    const second = await hub.save({
      documentId: 'writer',
      documentRevision: 2,
      fileKey,
      observedDiskRevision: first.diskRevision,
      bytes: Buffer.from('three')
    })
    expect(second.status).toBe('saved')
    watchers.emit(fileKey)
    await vi.waitFor(() => expect(peerChanges).toHaveLength(2))
    expect(writerChanges).toEqual([])
  })

  it('revokes an old generation before granting its handoff successor', async() => {
    const { hub, storage, watchers } = createHub()
    const fileKey = key('handoff')
    storage.files.set(fileKey, Buffer.from('old'))
    const sourceChanges: DiskChange[] = []
    const targetChanges: DiskChange[] = []
    const source = hub.subscribe(subscriber('source', fileKey, 'clean', sourceChanges))
    const target = hub.handoff(source, subscriber('target', fileKey, 'clean', targetChanges))

    expect(target).toBeDefined()
    expect(hub.isCurrent(source)).toBe(false)
    expect(hub.release(source)).toBe(false)
    expect(watchers.activeWatchers.get(fileKey)).toHaveLength(1)
    storage.files.set(fileKey, Buffer.from('external'))
    watchers.emit(fileKey)
    await vi.waitFor(() => expect(targetChanges).toHaveLength(1))
    expect(sourceChanges).toEqual([])
  })
})
