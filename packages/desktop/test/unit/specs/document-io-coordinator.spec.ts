import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FileObservationHub,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory
} from 'main_renderer/filesystem/fileObservation'
import { DocumentIOCoordinator, type DocumentIoEndpoint } from 'main_renderer/filesystem/documentIO'
import type { DocumentIoBindingRequest, DocumentIoReadRequest, DocumentIoSaveRequest } from '@shared/workspace/documentIo'

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
      kind: 'bind',
      requestId: `bind:${documentId}`,
      documentId,
      documentRevision: 2,
      pathname: file,
      dirty: true,
      windowId: 999
    }
    const ack = await coordinator.request('sender-a', request)
    if (ack.status !== 'bound') throw new Error(`bind failed: ${ack.status}`)
    return ack
  }

  const save = (ownerFence: string, requestId = 'save:1', documentRevision = 2): DocumentIoSaveRequest => ({
    kind: 'save',
    requestId,
    documentId: 'document',
    documentRevision,
    ownerFence,
    markdown: 'updated\n',
    options,
    windowId: -1
  })

  const read = (ownerFence: string, requestId = 'read:1'): DocumentIoReadRequest => ({
    kind: 'read',
    requestId,
    documentId: 'document',
    ownerFence,
    options: { preferredEol: 'lf', autoGuessEncoding: true, trimTrailingNewline: 2, autoNormalizeLineEndings: false }
  })

  it('reads an external change without adopting it until the read is accepted', async() => {
    const { coordinator, hub, storage } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline\n'))
    const bound = await bind(coordinator)
    storage.files.set(canonical, Buffer.from('external\r\nchange\r\n'))

    const result = await coordinator.read('sender-a', read(bound.ownerFence))
    expect(result).toMatchObject({
      status: 'read',
      document: { markdown: 'external\nchange\n', lineEnding: 'crlf', adjustLineEndingOnSave: true }
    })
    if (result.status !== 'read') throw new Error('read failed')

    // A declined reload keeps later saves guarded against the external change.
    await expect(coordinator.request('sender-a', save(bound.ownerFence, 'save:guarded'))).resolves.toMatchObject({
      status: 'conflict'
    })
    expect(storage.files.get(canonical)?.toString()).toBe('external\r\nchange\r\n')

    expect(coordinator.acceptRead('sender-a', {
      kind: 'accept-read', requestId: 'accept:1', documentId: 'document', ownerFence: bound.ownerFence, readToken: result.readToken
    })).toMatchObject({ status: 'bound', ownerFence: bound.ownerFence })
    await expect(coordinator.request('sender-a', save(bound.ownerFence, 'save:after-accept'))).resolves.toMatchObject({
      status: 'durable-success'
    })
  })

  it('accepts only the latest read and never one older than a durable save', async() => {
    const { coordinator, hub, storage } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline\n'))
    const bound = await bind(coordinator)
    const accept = (readToken: string, requestId: string) => coordinator.acceptRead('sender-a', {
      kind: 'accept-read', requestId, documentId: 'document', ownerFence: bound.ownerFence, readToken
    })

    const first = await coordinator.read('sender-a', read(bound.ownerFence, 'read:first'))
    const second = await coordinator.read('sender-a', read(bound.ownerFence, 'read:second'))
    if (first.status !== 'read' || second.status !== 'read') throw new Error('read failed')
    expect(accept(first.readToken, 'accept:first')).toMatchObject({ status: 'rejected' })

    await expect(coordinator.request('sender-a', save(bound.ownerFence, 'save:own'))).resolves.toMatchObject({
      status: 'durable-success'
    })
    expect(accept(second.readToken, 'accept:second')).toMatchObject({ status: 'rejected' })
  })

  it('reports a missing file and rejects reads from another sender', async() => {
    const { coordinator, hub, storage } = setup()
    const canonical = await hub.canonicalFileKey(file)
    storage.files.set(canonical, Buffer.from('baseline\n'))
    const bound = await bind(coordinator)
    await expect(coordinator.read('sender-b', read(bound.ownerFence))).resolves.toMatchObject({ status: 'rejected' })
    storage.files.delete(canonical)
    await expect(coordinator.read('sender-a', read(bound.ownerFence))).resolves.toMatchObject({ status: 'missing' })
  })

  it('authenticates the actual sender and ignores payload window IDs', async() => {
    const { coordinator, hub } = setup()
    const bound = await bind(coordinator)
    const forged = await coordinator.request('sender-b', save(bound.ownerFence))
    expect(forged).toMatchObject({ status: 'rejected', reason: 'unknown or revoked sender' })
    const real = await coordinator.request('sender-a', save(bound.ownerFence))
    expect(real).toMatchObject({ status: 'durable-success', ownerFence: bound.ownerFence })
  })

  it('returns a nullable baseline when the bound file was observed missing', async() => {
    const { coordinator } = setup()
    await expect(bind(coordinator)).resolves.toMatchObject({
      status: 'bound', observedDiskRevision: null
    })
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
      kind: 'sync',
      requestId: 'sync:external',
      documentId: 'document',
      documentRevision: 2,
      ownerFence: bound.ownerFence,
      dirty: true
    })
    expect(synced.status).toBe('bound')
    const replacement = await coordinator.request('sender-a', save(bound.ownerFence, 'save:durable'))
    // CAS remains intentionally strict: a dirty peer must resolve the external change first.
    expect(replacement.status).toBe('conflict')
    const rebound = await coordinator.request('sender-a', {
      kind: 'bind',
      requestId: 'rebind',
      documentId: 'document',
      documentRevision: 3,
      pathname: file,
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

  it('keeps an untitled Save As provisional until the guarded write is durable', async() => {
    const { coordinator, hub, storage, watchers } = setup()
    const target = 'C:/workspace/untitled.md'
    const targetKey = await hub.canonicalFileKey(target)
    const unbound = (requestId: string): DocumentIoSaveRequest => ({
      kind: 'save-as',
      requestId,
      documentId: 'untitled',
      documentRevision: 0,
      markdown: 'draft',
      options,
      targetPathname: target
    })
    storage.onWrite = () => { throw new Error('disk full') }
    const failed = await coordinator.request('sender-a', unbound('untitled:failed'))
    expect(failed).toMatchObject({ status: 'not-durable', ownerFence: undefined })
    expect(watchers.activeWatchers.size).toBe(0)
    storage.onWrite = undefined
    // The memory hook throws after its write; model a real failed durable
    // write by removing that test-double artifact before retrying.
    storage.files.delete(targetKey)
    const durable = await coordinator.request('sender-a', unbound('untitled:durable'))
    expect(durable).toMatchObject({ status: 'durable-success', documentId: 'untitled' })
    expect((await storage.read(targetKey))?.toString()).toBe('draft')
    expect(watchers.activeWatchers.size).toBe(1)
    if (durable.status !== 'durable-success') throw new Error('expected durable Save As')
    await expect(coordinator.request('sender-a', {
      kind: 'unbind', requestId: 'untitled:close', documentId: 'untitled', ownerFence: durable.ownerFence
    })).resolves.toMatchObject({ status: 'unbound' })
    expect(watchers.activeWatchers.size).toBe(0)
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
      kind: 'sync',
      requestId: 'sync:new',
      documentId: 'document',
      documentRevision: 3,
      ownerFence: bound.ownerFence,
      dirty: true
    })
    release()
    await expect(oldSave).resolves.toMatchObject({ status: 'not-durable' })
    await expect(advanced).resolves.toMatchObject({ status: 'bound' })
    expect((await storage.read(canonical))?.toString()).toBe('baseline')
    await expect(coordinator.request('sender-a', {
      kind: 'bind',
      requestId: 'bind:old',
      documentId: 'document',
      documentRevision: 2,
      pathname: file,
      dirty: true
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
      kind: 'bind',
      requestId: 'bind:new-owner',
      documentId: 'document',
      documentRevision: 3,
      pathname: file,
      dirty: true
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
      kind: 'bind',
      requestId: 'bind:pending',
      documentId: 'document',
      documentRevision: 3,
      pathname: file,
      dirty: true
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
