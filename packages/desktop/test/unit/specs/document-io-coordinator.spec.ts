import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FileObservationHub,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory
} from 'main_renderer/filesystem/fileObservation'
import { DocumentIOCoordinator, type DocumentIoEndpoint } from 'main_renderer/filesystem/documentIO'
import type { DocumentIoBindingRequest, DocumentIoSaveRequest } from '@shared/workspace/documentIo'

const options = { encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf' as const, adjustLineEndingOnSave: false }
const file = 'C:/workspace/document.md'

describe('DocumentIOCoordinator', () => {
  const hubs: FileObservationHub[] = []

  afterEach(() => hubs.splice(0).forEach((hub) => hub.close()))

  const setup = () => {
    const storage = new MemoryFileObservationStorage()
    const watchers = new MemoryFileObservationWatchFactory()
    const hub = new FileObservationHub(storage, watchers)
    hubs.push(hub)
    const coordinator = new DocumentIOCoordinator(hub)
    const observations: unknown[] = []
    const endpoint: DocumentIoEndpoint = { id: 'sender-a', sessionId: 'session-a', send: (value) => observations.push(value) }
    coordinator.registerEndpoint(endpoint)
    return { storage, watchers, hub, coordinator, endpoint, observations }
  }

  const bind = async(coordinator: DocumentIOCoordinator, documentId = 'document') => {
    const request: DocumentIoBindingRequest = {
      kind: 'bind', requestId: `bind:${documentId}`, documentId, documentRevision: 2, pathname: file,
      dirty: true, windowId: 999
    }
    const ack = await coordinator.request('sender-a', request)
    if (ack.status !== 'bound') throw new Error(`bind failed: ${ack.status}`)
    return ack
  }

  const save = (ownerFence: string, requestId = 'save:1', documentRevision = 2): DocumentIoSaveRequest => ({
    kind: 'save', requestId, documentId: 'document', documentRevision, ownerFence,
    markdown: 'updated\n', options, windowId: -1
  })

  it('authenticates the actual sender and ignores payload window IDs', async() => {
    const { coordinator, hub } = setup()
    const bound = await bind(coordinator)
    const forged = await coordinator.request('sender-b', save(bound.ownerFence))
    expect(forged).toMatchObject({ status: 'rejected', reason: 'unknown or revoked sender' })
    const real = await coordinator.request('sender-a', save(bound.ownerFence))
    expect(real).toMatchObject({ status: 'durable-success', ownerFence: bound.ownerFence })
  })

  it('keeps failed and conflicted ordinary saves dirty, then accepts the matching durable ACK once', async() => {
    const { coordinator, hub, storage } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline'))
    const bound = await bind(coordinator)
    storage.onWrite = () => { throw new Error('disk full') }
    await expect(coordinator.request('sender-a', save(bound.ownerFence, 'save:failed'))).resolves.toMatchObject({
      status: 'not-durable'
    })
    storage.onWrite = undefined
    storage.files.set(canonical, Buffer.from('external change'))
    await expect(coordinator.request('sender-a', save(bound.ownerFence, 'save:conflict'))).resolves.toMatchObject({
      status: 'conflict'
    })
    const synced = await coordinator.request('sender-a', {
      kind: 'sync', requestId: 'sync:external', documentId: 'document', documentRevision: 2,
      ownerFence: bound.ownerFence, dirty: true
    })
    expect(synced.status).toBe('bound')
    const replacement = await coordinator.request('sender-a', save(bound.ownerFence, 'save:durable'))
    // CAS remains intentionally strict: a dirty peer must resolve the external change first.
    expect(replacement.status).toBe('conflict')
    const rebound = await coordinator.request('sender-a', {
      kind: 'bind', requestId: 'rebind', documentId: 'document', documentRevision: 3, pathname: file,
      dirty: true
    })
    if (rebound.status !== 'bound') throw new Error('rebind failed')
    const durable = await coordinator.request('sender-a', save(rebound.ownerFence, 'save:durable', 3))
    expect(durable.status).toBe('durable-success')
    const duplicate = await coordinator.request('sender-a', save(rebound.ownerFence, 'save:durable', 3))
    expect(duplicate).toEqual(durable)
  })

  it('rolls back failed Save As and replaces its observation binding only after durability', async() => {
    const { coordinator, hub, storage, watchers } = setup()
    const source = await hub.canonicalFileKey(file)
    storage.files.set(source, Buffer.from('source'))
    const bound = await bind(coordinator)
    const unavailable = Promise.reject(new Error('target unavailable'))
    unavailable.catch(() => {})
    storage.writeBarrier = unavailable
    const failed = await coordinator.request('sender-a', {
      ...save(bound.ownerFence, 'save-as:failed'), kind: 'save-as', targetPathname: 'C:/workspace/renamed.md'
    })
    expect(failed.status).toBe('not-durable')
    expect(watchers.activeWatchers.size).toBe(1)
    storage.writeBarrier = undefined
    const saved = await coordinator.request('sender-a', {
      ...save(bound.ownerFence, 'rename:ok'),
      kind: 'rename',
      targetPathname: 'C:/workspace/renamed.md'
    })
    expect(saved).toMatchObject({ status: 'durable-success' })
    expect(watchers.activeWatchers.size).toBe(1)
  })

  it('makes late saves and observers inert after rebind and endpoint revocation', async() => {
    const { coordinator, hub, storage, watchers, endpoint, observations } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline'))
    const bound = await bind(coordinator)
    let release!: () => void
    storage.writeBarrier = new Promise<void>((resolve) => { release = resolve })
    const pending = coordinator.request('sender-a', save(bound.ownerFence, 'save:late'))
    await Promise.resolve()
    coordinator.registerEndpoint({ ...endpoint, sessionId: 'session-b' })
    release()
    await expect(pending).resolves.toMatchObject({ status: 'not-durable' })
    watchers.emit(canonical)
    await Promise.resolve()
    expect(observations).toEqual([])
    expect(watchers.activeWatchers.size).toBe(0)
  })

  it('never lets an old bind or delayed save lower the current revision fence', async() => {
    const { coordinator, hub, storage } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline'))
    const bound = await bind(coordinator)
    let release!: () => void
    storage.writeBarrier = new Promise<void>((resolve) => { release = resolve })
    const oldSave = coordinator.request('sender-a', save(bound.ownerFence, 'save:old', 2))
    await Promise.resolve()
    const advanced = coordinator.request('sender-a', {
      kind: 'sync', requestId: 'sync:new', documentId: 'document', documentRevision: 3,
      ownerFence: bound.ownerFence, dirty: true
    })
    release()
    await expect(oldSave).resolves.toMatchObject({ status: 'not-durable' })
    await expect(advanced).resolves.toMatchObject({ status: 'bound' })
    expect((await storage.read(canonical))?.toString()).toBe('baseline')
    await expect(coordinator.request('sender-a', {
      kind: 'bind', requestId: 'bind:old', documentId: 'document', documentRevision: 2,
      pathname: file, dirty: true
    })).resolves.toMatchObject({ status: 'rejected', reason: 'stale document revision' })
    await expect(coordinator.request('sender-a', save(bound.ownerFence, 'save:new', 3))).resolves.toMatchObject({
      status: 'durable-success'
    })
  })

  it('releases old owner mappings on rebind and explicit unbind', async() => {
    const { coordinator, hub, storage, watchers, observations } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline'))
    const old = await bind(coordinator)
    const rebound = await coordinator.request('sender-a', {
      kind: 'bind', requestId: 'bind:new-owner', documentId: 'document', documentRevision: 3,
      pathname: file, dirty: true
    })
    if (rebound.status !== 'bound') throw new Error('rebind failed')
    await expect(coordinator.request('sender-a', save(old.ownerFence, 'old-owner', 2))).resolves.toMatchObject({
      status: 'rejected'
    })
    watchers.emit(canonical)
    await vi.waitFor(() => expect(observations).toHaveLength(1))
    expect(observations).toEqual([expect.objectContaining({ ownerFence: rebound.ownerFence })])
    expect(observations).not.toContainEqual(expect.objectContaining({ ownerFence: old.ownerFence }))
    await expect(coordinator.request('sender-a', {
      kind: 'unbind', requestId: 'close', documentId: 'document', ownerFence: rebound.ownerFence
    })).resolves.toMatchObject({ status: 'unbound' })
    expect(watchers.activeWatchers.size).toBe(0)
  })

  it('reserves a higher pending bind before canonicalization so an old save cannot land', async() => {
    const { coordinator, hub, storage } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline'))
    const bound = await bind(coordinator)
    const canonicalize = storage.canonicalize.bind(storage)
    let release!: () => void
    const pendingCanonicalize = new Promise<void>((resolve) => { release = resolve })
    let defer = true
    storage.canonicalize = async(pathname) => {
      if (defer) await pendingCanonicalize
      return canonicalize(pathname)
    }
    const higher = coordinator.request('sender-a', {
      kind: 'bind', requestId: 'bind:pending', documentId: 'document', documentRevision: 3,
      pathname: file, dirty: true
    })
    await Promise.resolve()
    await expect(coordinator.request('sender-a', save(bound.ownerFence, 'save:old-pending', 2))).resolves.toMatchObject({
      status: 'rejected', reason: 'stale document revision'
    })
    expect((await storage.read(canonical))?.toString()).toBe('baseline')
    defer = false
    release()
    await expect(higher).resolves.toMatchObject({ status: 'bound' })
  })
})
