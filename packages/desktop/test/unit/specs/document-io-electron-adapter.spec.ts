import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  fromWebContents: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: { showSaveDialog: electron.showSaveDialog },
  BrowserWindow: { fromWebContents: electron.fromWebContents }
}))

import {
  FileObservationHub,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory
} from 'main_renderer/filesystem/fileObservation'
import { DocumentIOCoordinator } from 'main_renderer/filesystem/documentIO'
import {
  DocumentIoElectronAdapter,
  registerDocumentIoIpc,
  toDocumentIoTargetSelection,
  type DocumentIoWebContents
} from 'main_renderer/ipc/documentIO'
import { RendererDocumentIoAdapter } from '@/workspace/documentIO'
import type { DocumentIoObservation, DocumentIoPort, DocumentIoRequest, DocumentSaveAck } from '@shared/workspace/documentIo'
import { attachEditorDocumentIo } from 'main_renderer/windows/documentIO'

const options = { encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf' as const, adjustLineEndingOnSave: false }

class FakeWebContents implements DocumentIoWebContents {
  readonly sent: DocumentIoObservation[] = []
  private readonly listeners = new Map<string, Set<(details: { isMainFrame?: boolean; isSameDocument?: boolean }) => void>>()

  constructor(readonly id: number) {}

  send(_channel: 'mt::workspace::document-io-observation', observation: DocumentIoObservation): void {
    this.sent.push(observation)
  }

  on(
    event: 'destroyed' | 'did-start-navigation',
    listener: (details: { isMainFrame?: boolean; isSameDocument?: boolean }) => void
  ): void {
    const set = this.listeners.get(event) ?? new Set<(details: { isMainFrame?: boolean; isSameDocument?: boolean }) => void>()
    set.add(listener)
    this.listeners.set(event, set)
  }

  removeListener(
    event: 'destroyed' | 'did-start-navigation',
    listener: (details: { isMainFrame?: boolean; isSameDocument?: boolean }) => void
  ): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit(
    event: 'destroyed' | 'did-start-navigation',
    details: { isMainFrame?: boolean; isSameDocument?: boolean } = {}
  ): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(details)
  }
}

describe('DocumentIO Electron adapter', () => {
  const hubs: FileObservationHub[] = []
  afterEach(() => hubs.splice(0).forEach((hub) => hub.close()))

  it('maps the actual Electron SaveDialogReturnValue shape without changing a selected pathname', () => {
    expect(toDocumentIoTargetSelection({ canceled: false, filePath: 'C:/workspace/selected.md' })).toEqual({
      status: 'selected', pathname: 'C:/workspace/selected.md'
    })
    expect(toDocumentIoTargetSelection({ canceled: true, filePath: '' })).toEqual({ status: 'cancelled' })
  })

  const setup = () => {
    const storage = new MemoryFileObservationStorage()
    const watchers = new MemoryFileObservationWatchFactory()
    const hub = new FileObservationHub(storage, watchers)
    hubs.push(hub)
    const coordinator = new DocumentIOCoordinator(hub)
    const adapter = new DocumentIoElectronAdapter(coordinator)
    const first = new FakeWebContents(1)
    const second = new FakeWebContents(2)
    // This is the production EditorWindow assembly helper, not a test-only attach.
    attachEditorDocumentIo(adapter, first)
    attachEditorDocumentIo(adapter, second)
    return { storage, watchers, hub, adapter, first, second }
  }

  const bind = async(adapter: DocumentIoElectronAdapter, sender: FakeWebContents, requestId = 'bind') => {
    const ack = await adapter.handle(sender, {
      kind: 'bind', requestId, documentId: 'document', documentRevision: 3,
      pathname: 'C:/workspace/document.md', dirty: true,
      windowId: sender.id === 1 ? 2 : 1
    })
    if (ack.status !== 'bound') throw new Error(`unexpected ${ack.status}`)
    return ack
  }

  it('routes only through the actual attached sender and clears navigation/destroy subscriptions', async() => {
    const { adapter, hub, storage, watchers, first, second } = setup()
    const canonical = await hub.canonicalFileKey('C:/workspace/document.md')
    storage.files.set(canonical, Buffer.from('baseline'))
    const bound = await bind(adapter, first)
    await expect(adapter.handle(second, {
      kind: 'save', requestId: 'forged', documentId: 'document', documentRevision: 3,
      ownerFence: bound.ownerFence, markdown: 'forged', options, windowId: 1
    })).resolves.toMatchObject({ status: 'rejected' })
    first.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    await expect(adapter.handle(first, {
      kind: 'sync', requestId: 'after-navigation', documentId: 'document', documentRevision: 3,
      ownerFence: bound.ownerFence, dirty: true
    })).resolves.toMatchObject({ status: 'rejected' })
    expect(watchers.activeWatchers.size).toBe(0)
    first.emit('destroyed')
    expect(watchers.activeWatchers.size).toBe(0)
  })

  it('keeps the authenticated sender across same-document navigation', async() => {
    const { adapter, hub, storage, first } = setup()
    const target = 'C:/workspace/untitled.md'
    const targetKey = await hub.canonicalFileKey(target)
    first.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })

    await expect(adapter.handle(first, {
      kind: 'save-as',
      requestId: 'save-as:hash-navigation',
      documentId: 'untitled',
      documentRevision: 1,
      markdown: 'saved',
      options,
      targetPathname: target
    })).resolves.toMatchObject({ status: 'durable-success' })
    expect(storage.files.get(targetKey)?.toString()).toBe('saved')
  })

  it('exposes the typed IPC insertion point and makes renderer duplicate/late ACKs inert', async() => {
    const { adapter, hub, storage, watchers, first } = setup()
    const canonical = await hub.canonicalFileKey('C:/workspace/document.md')
    storage.files.set(canonical, Buffer.from('baseline'))
    let handler: ((event: { readonly sender: DocumentIoWebContents }, request: DocumentIoRequest) => Promise<DocumentSaveAck>) | undefined
    const removed: string[] = []
    registerDocumentIoIpc({
      handle: (channel, next) => {
        if (channel === 'mt::workspace::document-io') {
          handler = next as typeof handler
        }
      },
      removeHandler: (channel) => removed.push(channel)
    }, adapter)
    expect(removed).toEqual([
      'mt::workspace::document-io',
      'mt::workspace::document-io-read',
      'mt::workspace::document-io-accept-read',
      'mt::workspace::choose-document-path',
      'mt::workspace::confirm-document-close'
    ])
    if (!handler) throw new Error('IPC handler not registered')
    const listeners = new Set<(event: unknown, observation: DocumentIoObservation) => void>()
    const port: DocumentIoPort = {
      request: (request) => handler!({ sender: first }, request),
      subscribe: (listener) => {
        const wrapped = (_event: unknown, observation: DocumentIoObservation) => listener(observation)
        listeners.add(wrapped)
        return () => listeners.delete(wrapped)
      }
    }
    const observed: DocumentIoObservation[] = []
    const renderer = new RendererDocumentIoAdapter(port, (value) => observed.push(value))
    const bound = await renderer.bind({
      kind: 'bind', requestId: 'bind:renderer', documentId: 'document', documentRevision: 3,
      pathname: 'C:/workspace/document.md', dirty: true
    })
    if (bound.status !== 'bound') throw new Error('bind failed')
    const request = { kind: 'save' as const, requestId: 'save:renderer', documentId: 'document', documentRevision: 3,
      ownerFence: bound.ownerFence, markdown: 'saved', options }
    const firstAck = await renderer.save(request)
    const duplicate = await renderer.save(request)
    expect(firstAck).toEqual(duplicate)
    expect(renderer.getBinding(bound.ownerFence)).toMatchObject({ dirty: false })
    const rebound = await renderer.bind({
      kind: 'bind', requestId: 'rebind:renderer', documentId: 'document', documentRevision: 4,
      pathname: 'C:/workspace/document.md', dirty: true
    })
    if (rebound.status !== 'bound') throw new Error('rebind failed')
    await expect(renderer.save(request)).resolves.toMatchObject({ status: 'rejected' })
    for (const observation of first.sent) {
      for (const listener of listeners) listener({}, observation)
    }
    expect(observed).toEqual([])
    await renderer.dispose()
    expect(watchers.activeWatchers.size).toBe(0)
  })

  it('delivers clean-peer reload and dirty-peer conflict through the assembled coordinator seam', async() => {
    const { adapter, hub, storage, first, second } = setup()
    const canonical = await hub.canonicalFileKey('C:/workspace/document.md')
    storage.files.set(canonical, Buffer.from('baseline'))
    const writer = await bind(adapter, first, 'writer')
    const clean = await adapter.handle(second, {
      kind: 'bind', requestId: 'clean', documentId: 'clean-peer', documentRevision: 1,
      pathname: 'C:/workspace/document.md', dirty: false
    })
    const dirty = await adapter.handle(second, {
      kind: 'bind', requestId: 'dirty', documentId: 'dirty-peer', documentRevision: 1,
      pathname: 'C:/workspace/document.md', dirty: true
    })
    expect(clean.status).toBe('bound')
    expect(dirty.status).toBe('bound')
    await expect(adapter.handle(first, {
      kind: 'save', requestId: 'peer-save', documentId: 'document', documentRevision: 3,
      ownerFence: writer.ownerFence, markdown: 'changed', options
    })).resolves.toMatchObject({ status: 'durable-success' })
    expect(second.sent.map(({ kind }) => kind).sort()).toEqual(['conflict', 'reload'])
  })

  it('cleans delayed renderer bind and save completions after dispose', async() => {
    let resolveBind!: (ack: DocumentSaveAck) => void
    let resolveSave!: (ack: DocumentSaveAck) => void
    const calls: DocumentIoRequest[] = []
    const port: DocumentIoPort = {
      request: (request) => {
        calls.push(request)
        if (request.kind === 'bind' && request.requestId === 'late-bind') {
          return new Promise<DocumentSaveAck>((resolve) => { resolveBind = resolve })
        }
        if (request.kind === 'save' || request.kind === 'save-as') {
          return new Promise<DocumentSaveAck>((resolve) => { resolveSave = resolve })
        }
        if (request.kind === 'bind') {
          return Promise.resolve({ status: 'bound', requestId: request.requestId, documentId: request.documentId, ownerFence: 'fence' })
        }
        return Promise.resolve({ status: 'unbound', requestId: request.requestId, documentId: request.documentId })
      },
      subscribe: () => () => {}
    }
    const lateBind = new RendererDocumentIoAdapter(port, () => {})
    const pendingBind = lateBind.bind({
      kind: 'bind', requestId: 'late-bind', documentId: 'late', documentRevision: 1,
      pathname: 'C:/workspace/late.md', dirty: true
    })
    await lateBind.dispose()
    resolveBind({ status: 'bound', requestId: 'late-bind', documentId: 'late', ownerFence: 'late-fence' })
    await pendingBind
    expect(lateBind.getBinding('late-fence')).toBeUndefined()
    expect(calls.at(-1)).toMatchObject({ kind: 'unbind', ownerFence: 'late-fence' })

    const lateSave = new RendererDocumentIoAdapter(port, () => {})
    const bound = await lateSave.bind({
      kind: 'bind', requestId: 'bind-now', documentId: 'document', documentRevision: 1,
      pathname: 'C:/workspace/document.md', dirty: true
    })
    if (bound.status !== 'bound') throw new Error('bind failed')
    const pendingSave = lateSave.save({
      kind: 'save', requestId: 'late-save', documentId: 'document', documentRevision: 1,
      ownerFence: bound.ownerFence, markdown: 'saved', options
    })
    await lateSave.dispose()
    resolveSave({
      status: 'durable-success', requestId: 'late-save', documentId: 'document', documentRevision: 1,
      ownerFence: bound.ownerFence
    })
    await pendingSave
    expect(lateSave.getBinding(bound.ownerFence)).toBeUndefined()

    const lateUnboundSave = new RendererDocumentIoAdapter(port, () => {})
    const pendingUnboundSave = lateUnboundSave.save({
      kind: 'save-as', requestId: 'late-unbound-save', documentId: 'untitled', documentRevision: 1,
      markdown: 'saved', options, targetPathname: 'C:/workspace/untitled.md'
    })
    await lateUnboundSave.dispose()
    resolveSave({
      status: 'durable-success', requestId: 'late-unbound-save', documentId: 'untitled', documentRevision: 1,
      ownerFence: 'late-unbound-fence'
    })
    await expect(pendingUnboundSave).resolves.toMatchObject({ status: 'rejected' })
    expect(lateUnboundSave.getBinding('late-unbound-fence')).toBeUndefined()
    expect(calls.at(-1)).toMatchObject({ kind: 'unbind', ownerFence: 'late-unbound-fence' })
  })

  it('does not publish a bind when navigation interrupts deferred canonicalization', async() => {
    const storage = new MemoryFileObservationStorage()
    const canonicalize = storage.canonicalize.bind(storage)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    storage.canonicalize = async(pathname) => {
      await gate
      return canonicalize(pathname)
    }
    const watchers = new MemoryFileObservationWatchFactory()
    const hub = new FileObservationHub(storage, watchers)
    hubs.push(hub)
    const adapter = new DocumentIoElectronAdapter(new DocumentIOCoordinator(hub))
    const sender = new FakeWebContents(9)
    attachEditorDocumentIo(adapter, sender)
    const pending = adapter.handle(sender, {
      kind: 'bind', requestId: 'bind:navigation', documentId: 'document', documentRevision: 1,
      pathname: 'C:/workspace/document.md', dirty: true
    })
    await Promise.resolve()
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    release()
    await expect(pending).resolves.toMatchObject({ status: 'rejected', reason: 'stale bind' })
    expect(watchers.activeWatchers.size).toBe(0)
  })

  it('releases a deferred subscription when its endpoint is destroyed or disposed', async() => {
    for (const lifecycle of ['destroyed', 'dispose'] as const) {
      const storage = new MemoryFileObservationStorage()
      const watchers = new MemoryFileObservationWatchFactory()
      const hub = new FileObservationHub(storage, watchers)
      hubs.push(hub)
      const coordinator = new DocumentIOCoordinator(hub)
      const adapter = new DocumentIoElectronAdapter(coordinator)
      const sender = new FakeWebContents(lifecycle === 'destroyed' ? 10 : 11)
      attachEditorDocumentIo(adapter, sender)
      const subscribe = hub.subscribe.bind(hub)
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      const reached = vi.fn()
      hub.subscribe = async(subscriber) => {
        reached()
        await gate
        return subscribe(subscriber)
      }
      const pending = adapter.handle(sender, {
        kind: 'bind', requestId: `bind:${lifecycle}`, documentId: 'document', documentRevision: 1,
        pathname: 'C:/workspace/document.md', dirty: true
      })
      await vi.waitFor(() => expect(reached).toHaveBeenCalledOnce())
      if (lifecycle === 'destroyed') sender.emit('destroyed')
      else adapter.dispose()
      release()
      await expect(pending).resolves.toMatchObject({ status: 'rejected', reason: 'stale bind' })
      expect(watchers.activeWatchers.size).toBe(0)
    }
  })
})
