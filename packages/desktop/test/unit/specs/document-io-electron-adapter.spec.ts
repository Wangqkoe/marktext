import { afterEach, describe, expect, it } from 'vitest'
import {
  FileObservationHub,
  MemoryFileObservationStorage,
  MemoryFileObservationWatchFactory
} from 'main_renderer/filesystem/fileObservation'
import { DocumentIOCoordinator } from 'main_renderer/filesystem/documentIO'
import {
  DocumentIoElectronAdapter,
  registerDocumentIoIpc,
  type DocumentIoWebContents
} from 'main_renderer/ipc/documentIO'
import { RendererDocumentIoAdapter } from '@/workspace/documentIO'
import type { DocumentIoObservation, DocumentIoPort, DocumentIoRequest, DocumentSaveAck } from '@shared/workspace/documentIo'

const options = { encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf' as const, adjustLineEndingOnSave: false }

class FakeWebContents implements DocumentIoWebContents {
  readonly sent: DocumentIoObservation[] = []
  private readonly listeners = new Map<string, Set<() => void>>()

  constructor(readonly id: number) {}

  send(_channel: 'mt::workspace::document-io-observation', observation: DocumentIoObservation): void {
    this.sent.push(observation)
  }

  on(event: 'destroyed' | 'did-start-navigation', listener: () => void): void {
    const set = this.listeners.get(event) ?? new Set<() => void>()
    set.add(listener)
    this.listeners.set(event, set)
  }

  removeListener(event: 'destroyed' | 'did-start-navigation', listener: () => void): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit(event: 'destroyed' | 'did-start-navigation'): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener()
  }
}

describe('DocumentIO Electron adapter', () => {
  const hubs: FileObservationHub[] = []
  afterEach(() => hubs.splice(0).forEach((hub) => hub.close()))

  const setup = () => {
    const storage = new MemoryFileObservationStorage()
    const watchers = new MemoryFileObservationWatchFactory()
    const hub = new FileObservationHub(storage, watchers)
    hubs.push(hub)
    const coordinator = new DocumentIOCoordinator(hub)
    const adapter = new DocumentIoElectronAdapter(coordinator)
    const first = new FakeWebContents(1)
    const second = new FakeWebContents(2)
    adapter.attach(first, 'window-session-a')
    adapter.attach(second, 'window-session-b')
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
    first.emit('did-start-navigation')
    await expect(adapter.handle(first, {
      kind: 'sync', requestId: 'after-navigation', documentId: 'document', documentRevision: 3,
      ownerFence: bound.ownerFence, dirty: true
    })).resolves.toMatchObject({ status: 'rejected' })
    expect(watchers.activeWatchers.size).toBe(0)
    first.emit('destroyed')
    expect(watchers.activeWatchers.size).toBe(0)
  })

  it('exposes the typed IPC insertion point and makes renderer duplicate/late ACKs inert', async() => {
    const { adapter, hub, storage, watchers, first } = setup()
    const canonical = await hub.canonicalFileKey('C:/workspace/document.md')
    storage.files.set(canonical, Buffer.from('baseline'))
    let handler: ((event: { readonly sender: DocumentIoWebContents }, request: DocumentIoRequest) => Promise<DocumentSaveAck>) | undefined
    const removed: string[] = []
    registerDocumentIoIpc({
      handle: (_channel, next) => { handler = next },
      removeHandler: (channel) => removed.push(channel)
    }, adapter)
    expect(removed).toEqual(['mt::workspace::document-io'])
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
})
