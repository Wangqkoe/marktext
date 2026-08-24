import { afterEach, describe, expect, it } from 'vitest'
import {
  FileObservationHub,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory,
  type FileObservationLease
} from 'main_renderer/filesystem/fileObservation'
import type { FileKey } from '@shared/workspace/fileObservation'

const fileKey = 'C:/workspace/cas.md' as FileKey

const subscriber = (documentId: string, key: FileKey) => ({
  documentId,
  documentRevision: 1,
  fileKey: key,
  getState: () => 'clean' as const,
  onDiskChange: (): void => {}
})

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

  const seed = async(
    hub: FileObservationHub,
    storage: MemoryFileObservationStorage
  ): Promise<{ readonly lease: FileObservationLease; readonly baseline: string }> => {
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('baseline'))
    const lease = await hub.subscribe(subscriber('doc', fileKey))
    const baseline = await hub.getDiskRevision(fileKey)
    if (!baseline) throw new Error('expected baseline')
    return { lease, baseline }
  }

  it('serializes concurrent same-file saves and allows only the current expected revision to land', async() => {
    const { hub, storage } = createHub()
    const { lease, baseline } = await seed(hub, storage)
    const peer = await hub.subscribe(subscriber('peer', fileKey))
    const [first, second] = await Promise.all([
      hub.save({
        documentId: 'doc',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: baseline,
        ownerLease: lease,
        bytes: Buffer.from('first')
      }),
      hub.save({
        documentId: 'peer',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: baseline,
        ownerLease: peer,
        bytes: Buffer.from('second')
      })
    ])
    expect([first.status, second.status].sort()).toEqual(['conflict', 'saved'])
    expect((await storage.read(await hub.canonicalFileKey(fileKey)))?.toString()).toBe('first')
  })

  it('binds an ACK to the current owner lease, revision, and one acceptance', async() => {
    const { hub, storage } = createHub()
    const { lease, baseline } = await seed(hub, storage)
    const saved = await hub.save({
      documentId: 'doc',
      documentRevision: 4,
      fileKey,
      observedDiskRevision: baseline,
      ownerLease: lease,
      bytes: Buffer.from('saved')
    })
    if (saved.status !== 'saved') throw new Error('expected save')
    await expect(
      hub.acceptsSaveAck(saved, {
        documentId: 'doc',
        documentRevision: 5,
        fileKey,
        ownerLease: lease
      })
    ).resolves.toBe(false)
    await expect(
      hub.acceptsSaveAck(saved, {
        documentId: 'doc',
        documentRevision: 4,
        fileKey: 'C:/WORKSPACE/CAS.MD',
        ownerLease: lease
      })
    ).resolves.toBe(true)
    await expect(
      hub.acceptsSaveAck(saved, {
        documentId: 'doc',
        documentRevision: 4,
        fileKey,
        ownerLease: lease
      })
    ).resolves.toBe(false)
    const pendingAck = await hub.save({
      documentId: 'doc',
      documentRevision: 5,
      fileKey,
      observedDiskRevision: saved.diskRevision,
      ownerLease: lease,
      bytes: Buffer.from('pending ACK')
    })
    if (pendingAck.status !== 'saved') throw new Error('expected pending ACK save')
    const successor = await hub.handoff(lease, subscriber('doc', fileKey))
    if (!successor) throw new Error('expected successor')
    await expect(
      hub.acceptsSaveAck(pendingAck, {
        documentId: 'doc',
        documentRevision: 5,
        fileKey,
        ownerLease: lease
      })
    ).resolves.toBe(false)
    const late = await hub.save({
      documentId: 'doc',
      documentRevision: 5,
      fileKey,
      observedDiskRevision: saved.diskRevision,
      ownerLease: lease,
      bytes: Buffer.from('late')
    })
    expect(late).toMatchObject({ status: 'rejected' })
  })

  it('rejects a landed hash changed between write and read and leaves no pending suppression', async() => {
    const { hub, storage } = createHub()
    const { lease, baseline } = await seed(hub, storage)
    storage.onWrite = (canonical) =>
      storage.files.set(canonical, Buffer.from('external interleaving'))
    const result = await hub.save({
      documentId: 'doc',
      documentRevision: 1,
      fileKey,
      observedDiskRevision: baseline,
      ownerLease: lease,
      bytes: Buffer.from('intended')
    })
    expect(result).toMatchObject({ status: 'conflict' })
    expect(await hub.pendingOwnWriteCount(fileKey)).toBe(0)
  })

  it('cleans pending suppression when the underlying write fails', async() => {
    const { hub, storage } = createHub()
    const { lease, baseline } = await seed(hub, storage)
    storage.writeBarrier = Promise.reject(new Error('injected write failure'))
    await expect(
      hub.save({
        documentId: 'doc',
        documentRevision: 1,
        fileKey,
        observedDiskRevision: baseline,
        ownerLease: lease,
        bytes: Buffer.from('intended')
      })
    ).rejects.toThrow('injected write failure')
    expect(await hub.pendingOwnWriteCount(fileKey)).toBe(0)
  })

  it('blocks ordinary conflicts and consumes an exact overwrite token once', async() => {
    const { hub, storage } = createHub()
    const { lease, baseline } = await seed(hub, storage)
    const canonical = await hub.canonicalFileKey(fileKey)
    storage.files.set(canonical, Buffer.from('external change'))
    const observed = await hub.getDiskRevision(fileKey)
    if (!observed) throw new Error('expected externally changed revision')
    const ordinary = await hub.save({
      documentId: 'doc',
      documentRevision: 7,
      fileKey,
      observedDiskRevision: baseline,
      ownerLease: lease,
      bytes: Buffer.from('our draft')
    })
    expect(ordinary.status).toBe('conflict')
    const token = await hub.issueOverwriteToken({
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
      ownerLease: lease,
      purpose: 'overwrite',
      overwriteToken: token,
      bytes: Buffer.from('our draft')
    })
    expect(overwrite.status).toBe('saved')
    storage.files.set(canonical, Buffer.from('changed again'))
    const replay = await hub.save({
      documentId: 'doc',
      documentRevision: 7,
      fileKey,
      observedDiskRevision: baseline,
      ownerLease: lease,
      purpose: 'overwrite',
      overwriteToken: token,
      bytes: Buffer.from('must not overwrite')
    })
    expect(replay).toMatchObject({ status: 'rejected' })
  })
})
