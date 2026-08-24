import { afterEach, describe, expect, it } from 'vitest'
import {
  FileObservationHub,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory
} from 'main_renderer/filesystem/fileObservation'
import type { FileKey } from '@shared/workspace/fileObservation'

const fileKey = 'C:/workspace/cas.md' as FileKey

describe('DiskRevision guarded saves', () => {
  const hubs: FileObservationHub[] = []

  afterEach(() => {
    hubs.splice(0).forEach((hub) => hub.close())
  })

  const createHub = (): {
    readonly hub: FileObservationHub
    readonly storage: MemoryFileObservationStorage
  } => {
    const storage = new MemoryFileObservationStorage()
    const hub = new FileObservationHub(storage, new MemoryFileObservationWatchFactory())
    hubs.push(hub)
    return { hub, storage }
  }

  it('serializes concurrent same-file saves and lets only the current CAS writer land', async() => {
    const { hub, storage } = createHub()
    storage.files.set(fileKey, Buffer.from('baseline'))
    const baseline = await hub.getDiskRevision(fileKey)
    if (!baseline) throw new Error('expected baseline revision')

    const [first, second] = await Promise.all([
      hub.save({
        documentId: 'one',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: baseline,
        bytes: Buffer.from('first')
      }),
      hub.save({
        documentId: 'two',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: baseline,
        bytes: Buffer.from('second')
      })
    ])

    expect([first.status, second.status].sort()).toEqual(['conflict', 'saved'])
    expect((await storage.read(fileKey))?.toString()).toBe('first')
  })

  it('does not accept a late save ACK for a newer document revision', async() => {
    const { hub, storage } = createHub()
    storage.files.set(fileKey, Buffer.from('baseline'))
    const baseline = await hub.getDiskRevision(fileKey)
    if (!baseline) throw new Error('expected baseline revision')
    const saved = await hub.save({
      documentId: 'doc',
      documentRevision: 4,
      fileKey,
      observedDiskRevision: baseline,
      bytes: Buffer.from('saved')
    })
    if (saved.status !== 'saved') throw new Error('expected save')

    expect(hub.acceptsSaveAck(saved, { documentId: 'doc', documentRevision: 5, fileKey })).toBe(
      false
    )
    expect(hub.acceptsSaveAck(saved, { documentId: 'doc', documentRevision: 4, fileKey })).toBe(
      true
    )
  })

  it('blocks ordinary conflicting saves and consumes an exact overwrite token once', async() => {
    const { hub, storage } = createHub()
    storage.files.set(fileKey, Buffer.from('baseline'))
    const baseline = await hub.getDiskRevision(fileKey)
    if (!baseline) throw new Error('expected baseline revision')
    storage.files.set(fileKey, Buffer.from('external change'))
    const observed = await hub.getDiskRevision(fileKey)
    if (!observed) throw new Error('expected externally changed revision')

    const ordinary = await hub.save({
      documentId: 'doc',
      documentRevision: 7,
      fileKey,
      observedDiskRevision: baseline,
      bytes: Buffer.from('our draft')
    })
    expect(ordinary.status).toBe('conflict')
    expect((await storage.read(fileKey))?.toString()).toBe('external change')

    const token = hub.issueOverwriteToken({
      documentId: 'doc',
      documentRevision: 7,
      fileKey,
      observedDiskRevision: observed,
      purpose: 'overwrite'
    })
    const overwrite = await hub.save({
      documentId: 'doc',
      documentRevision: 7,
      fileKey,
      observedDiskRevision: baseline,
      purpose: 'overwrite',
      overwriteToken: token,
      bytes: Buffer.from('our draft')
    })
    expect(overwrite.status).toBe('saved')

    storage.files.set(fileKey, Buffer.from('changed again'))
    const replay = await hub.save({
      documentId: 'doc',
      documentRevision: 7,
      fileKey,
      observedDiskRevision: baseline,
      purpose: 'overwrite',
      overwriteToken: token,
      bytes: Buffer.from('must not overwrite')
    })
    expect(replay).toMatchObject({ status: 'rejected' })
    expect((await storage.read(fileKey))?.toString()).toBe('changed again')
  })
})
