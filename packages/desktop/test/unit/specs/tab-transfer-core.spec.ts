import { describe, expect, it } from 'vitest'
import {
  MemoryCapsuleStorage,
  MemoryTransferJournal,
  MemoryTransferTransport,
  TabTransferCoordinator,
  type TransferIntent
} from 'main_renderer/tabTransfer'
import { ElectronTransferTransport, type TransferWebContents } from 'main_renderer/tabTransfer/electron'
import type { TransferCommand } from 'main_renderer/tabTransfer'

const makeIntent = (transport: MemoryTransferTransport, requestId = 'request-1'): TransferIntent => ({
  requestId,
  fingerprint: 'source:view:revision-4',
  source: transport.endpoint(),
  sourceDocumentId: 'document-1',
  sourceViewId: 'view-1',
  sourceLineage: 'lineage-1',
  documentRevision: 4,
  isLastSourceTab: true,
  capsule: {
    version: 1,
    sourceDocumentId: 'document-1',
    sourceViewId: 'view-1',
    sourceSessionId: 'source',
    sourceLineage: 'lineage-1',
    documentRevision: 4,
    title: 'Moved.md',
    markdown: '# retained',
    dirty: true,
    conflict: false,
    options: { encoding: 'utf8' },
    history: { version: 1, value: { undo: ['one'], redo: [] } },
    view: { cursor: { line: 1, column: 2 }, selection: null, scrollTop: 34, mode: 'wysiwyg' }
  }
})

const setup = () => {
  const journal = new MemoryTransferJournal()
  const capsules = new MemoryCapsuleStorage()
  const transport = new MemoryTransferTransport()
  let next = 0
  const coordinator = new TabTransferCoordinator(journal, capsules, transport, () => `transfer-${++next}`)
  return { journal, capsules, transport, coordinator }
}

describe('TabTransfer core', () => {
  it('writes a byte-digested capsule and separate fsynced intent/observed records for every phase', async() => {
    const { journal, capsules, transport, coordinator } = setup()
    await expect(coordinator.run(makeIntent(transport))).resolves.toEqual({ status: 'applied', transferId: 'transfer-1' })
    const records = await journal.records()
    for (const phase of ['requested', 'source-prepared', 'target-staged', 'commit-authorized', 'source-released', 'target-activated', 'completed']) {
      const kinds = records.filter(record => record.phase === phase).map(record => record.kind)
      expect(kinds).toContain('intent')
      expect(kinds).toContain('observed')
    }
    expect(capsules.tombstones).toEqual(new Set(['transfer-1']))
    expect(capsules.capsules.has('transfer-1')).toBe(false)
    expect(transport.commands.some(command => command.isLastSourceTab)).toBe(true)
  })

  it('rejects replay fingerprints, stale endpoint epochs, and unencodable history before authorization', async() => {
    const { journal, transport, coordinator } = setup()
    const intent = makeIntent(transport)
    const first = coordinator.run(intent)
    await expect(first).resolves.toMatchObject({ status: 'applied' })
    await expect(coordinator.run({ ...intent, fingerprint: 'different' })).resolves.toMatchObject({ status: 'rejected' })

    const stale = makeIntent(transport, 'stale')
    transport.restart('source')
    await expect(coordinator.run(stale)).resolves.toMatchObject({ status: 'rejected' })

    const unsafe = makeIntent(transport, 'unsafe')
    const invalidHistory = { ...unsafe, capsule: { ...unsafe.capsule, history: { version: 1, value: { fn: () => 1 } } } } as unknown as TransferIntent
    await expect(coordinator.run(invalidHistory)).resolves.toMatchObject({ status: 'rejected' })
    expect((await journal.records()).filter(record => record.requestId === 'unsafe')).toHaveLength(0)
  })

  it('uses the sealed source revision fence before it authorizes source release', async() => {
    const { journal, transport, coordinator } = setup()
    transport.plan('source-prepared', { status: 'ok', sealedRevision: 4 }, { status: 'ok', sealedRevision: 5 })
    await expect(coordinator.run(makeIntent(transport))).resolves.toMatchObject({ status: 'failed' })
    const phases = (await journal.records()).filter(record => record.kind === 'observed').map(record => record.phase)
    expect(phases).toContain('source-prepared')
    expect(phases).not.toContain('commit-authorized')
  })

  it('keeps target ownership business-once through duplicated/reordered acknowledgement plans', async() => {
    const { journal, transport, coordinator } = setup()
    transport.duplicateNextAck('target-staged', { status: 'ok', sealedRevision: 4 })
    transport.loseNextAck('target-staged')
    transport.reorder('target-staged')
    await expect(coordinator.run(makeIntent(transport))).resolves.toMatchObject({ status: 'applied' })
    expect(transport.commands.filter(command => command.phase === 'target-staged')).toHaveLength(2)
    expect((await journal.records()).filter(record => record.phase === 'target-staged' && record.kind === 'observed')).toHaveLength(1)
  })

  it('handles a deterministically late acknowledgement without treating it as duplicate ownership', async() => {
    const { transport, coordinator } = setup()
    transport.lateNextAck('target-staged', { status: 'ok', sealedRevision: 4 })
    await expect(coordinator.run(makeIntent(transport))).resolves.toMatchObject({ status: 'applied' })
    expect(transport.lateEvents).toHaveLength(1)
  })
})

describe('Electron transfer endpoint authentication', () => {
  it('rejects a forged endpoint and makes the pre-reload endpoint inert', async() => {
    const source = new FakeTransferWebContents(1)
    const target = new FakeTransferWebContents(2)
    const holder: { transport?: ElectronTransferTransport } = {}
    const transport = new ElectronTransferTransport({
      createTarget: async() => {
        const targetEndpoint = holder.transport?.endpointFor(target)
        if (!targetEndpoint) throw new Error('target endpoint is unavailable')
        return targetEndpoint
      }
    })
    holder.transport = transport
    transport.attach(source)
    const sourceEndpoint = transport.endpointFor(source)
    transport.attach(target)
    const targetEndpoint = transport.endpointFor(target)
    if (!sourceEndpoint || !targetEndpoint) throw new Error('endpoints were not attached')
    const capability = transport.issueCapability({
      transferId: 'transfer',
      operation: 'stage',
      role: 'target',
      source: sourceEndpoint,
      target: targetEndpoint,
      capsuleDigest: 'digest',
      documentRevision: 1
    })
    target.onSend = command => transport.acknowledge(target, {
      transferId: command.transferId, phase: command.phase, operation: command.operation, ack: { status: 'ok' }
    })
    await expect(transport.command({
      transferId: 'transfer',
      phase: 'target-staged',
      operation: 'stage',
      endpoint: targetEndpoint,
      capability,
      capsuleDigest: 'digest',
      documentRevision: 1,
      isLastSourceTab: false
    }, { timeoutMs: 50, retryCadenceMs: 5 })).resolves.toEqual({ status: 'ok' })
    source.emit('did-start-navigation')
    expect(transport.authenticate(sourceEndpoint)).toBe(false)
    await expect(transport.command({
      transferId: 'forged',
      phase: 'target-staged',
      operation: 'stage',
      endpoint: sourceEndpoint,
      capsuleDigest: 'digest',
      documentRevision: 1,
      isLastSourceTab: false
    }, { timeoutMs: 50, retryCadenceMs: 5 })).resolves.toEqual({ status: 'nack', reason: 'unauthenticated endpoint epoch' })
  })
})

class FakeTransferWebContents implements TransferWebContents {
  readonly listeners = new Map<string, (() => void)[]>()
  onSend?: (command: TransferCommand) => void
  constructor(readonly id: number) {}
  send(_channel: 'mt::workspace::transfer-command' | 'mt::workspace::transfer-recovery', payload: unknown): void {
    this.onSend?.(payload as TransferCommand)
  }

  on(event: 'destroyed' | 'did-start-navigation', listener: () => void): void { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]) }
  removeListener(event: 'destroyed' | 'did-start-navigation', listener: () => void): void { this.listeners.set(event, (this.listeners.get(event) ?? []).filter(item => item !== listener)) }
  emit(event: 'destroyed' | 'did-start-navigation'): void { for (const listener of this.listeners.get(event) ?? []) listener() }
}
