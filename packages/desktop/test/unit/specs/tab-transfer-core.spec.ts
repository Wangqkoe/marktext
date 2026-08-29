import { describe, expect, it } from 'vitest'
import {
  MemoryCapsuleStorage,
  MemoryTransferJournal,
  MemoryTransferTransport,
  TabTransferCoordinator,
  type TransferIntent
} from 'main_renderer/tabTransfer'
import { ElectronTransferTransport, type TransferWebContents } from 'main_renderer/tabTransfer/electron'
import type { TransferCommand, TransferRecoveryMessage } from 'main_renderer/tabTransfer'

const makeIntent = (
  transport: MemoryTransferTransport,
  requestId = 'request-1',
  releasePoint?: { readonly x: number; readonly y: number }
): TransferIntent => ({
  requestId,
  fingerprint: 'source:view:revision-4',
  source: transport.endpoint(),
  sourceDocumentId: 'document-1',
  sourceViewId: 'view-1',
  sourceLineage: 'lineage-1',
  documentRevision: 4,
  isLastSourceTab: true,
  ...(releasePoint ? { releasePoint } : {}),
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

  it('passes the authenticated native release point through the initial T06 target seam', async() => {
    const { transport, coordinator } = setup()
    const releasePoint = { x: 1875, y: 945 }

    await expect(coordinator.run(makeIntent(transport, 'native-release', releasePoint))).resolves.toMatchObject({ status: 'applied' })
    expect(transport.targetRequests).toEqual([{ transferId: 'transfer-1', releasePoint }])
  })
})

describe('Electron transfer endpoint authentication', () => {
  it('keeps the source endpoint authenticated across hash and subframe navigation', () => {
    const source = new FakeTransferWebContents(1)
    const transport = new ElectronTransferTransport({ createTarget: async() => { throw new Error('target should not be created') } })
    transport.attach(source)
    const endpoint = transport.endpointFor(source)
    if (!endpoint) throw new Error('source endpoint was not attached')

    source.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    expect(transport.authenticate(endpoint)).toBe(true)

    source.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
    expect(transport.authenticate(endpoint)).toBe(true)
  })

  it('revokes the source endpoint for cross-document main-frame navigation and destruction', () => {
    const source = new FakeTransferWebContents(1)
    const transport = new ElectronTransferTransport({ createTarget: async() => { throw new Error('target should not be created') } })
    transport.attach(source)
    const afterNavigation = transport.endpointFor(source)
    if (!afterNavigation) throw new Error('source endpoint was not attached')

    source.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(transport.authenticate(afterNavigation)).toBe(false)

    transport.attach(source)
    const afterReattach = transport.endpointFor(source)
    if (!afterReattach) throw new Error('source endpoint was not reattached')
    source.emit('destroyed')
    expect(transport.authenticate(afterReattach)).toBe(false)
  })

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
    target.onSend = command => {
      if (!('phase' in command)) return
      transport.acknowledge(target, {
        transferId: command.transferId, phase: command.phase, operation: command.operation, ack: { status: 'ok' }
      })
    }
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
    expect(transport.acknowledge(target, {
      transferId: 'transfer',
      phase: 'target-staged',
      operation: 'stage',
      ack: { status: 'ok' }
    })).toEqual({ status: 'nack', reason: 'stale transfer acknowledgement' })
    const forgedCapability = transport.issueCapability({
      transferId: 'forged-capability',
      operation: 'stage',
      role: 'target',
      source: sourceEndpoint,
      target: targetEndpoint,
      capsuleDigest: 'digest',
      documentRevision: 1
    })
    await expect(transport.command({
      transferId: 'forged-capability',
      phase: 'target-staged',
      operation: 'stage',
      endpoint: targetEndpoint,
      capability: { ...forgedCapability, id: 'forged' },
      capsuleDigest: 'digest',
      documentRevision: 1,
      isLastSourceTab: false
    }, { timeoutMs: 50, retryCadenceMs: 5 })).resolves.toEqual({ status: 'nack', reason: 'invalid transfer capability' })
    source.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
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

  it('keeps recovery reservations inert until materialization binds the durable owner epoch', async() => {
    const target = new FakeTransferWebContents(9)
    let created = 0
    const transport = new ElectronTransferTransport({
      createTarget: async(_transferId, _recovery, reserved) => {
        created += 1
        if (!reserved) throw new Error('missing inert reservation')
        transport.attach(target, reserved.sessionId, reserved.epoch)
        return reserved
      }
    })
    const reserved = await transport.reserveRecoveryWindow('recovery-transfer')
    expect(created).toBe(0)
    expect(transport.authenticate(reserved)).toBe(false)
    target.onSend = message => {
      if ('ownerSessionId' in message) transport.recoveryMaterialized(target, message.transferId)
    }
    await transport.materializeRecoveryWindow(reserved, {
      sourceDocumentId: 'document-1',
      sourceViewId: 'view-1',
      sourceLineage: 'lineage-1',
      documentRevision: 1,
      title: 'Recovered',
      markdown: 'retained',
      dirty: true,
      conflict: false,
      options: {},
      view: { cursor: { line: 0, column: 0 }, selection: null, scrollTop: 0, mode: 'wysiwyg' }
    })
    expect(created).toBe(1)
    expect(transport.authenticate(reserved)).toBe(true)
  })
})

class FakeTransferWebContents implements TransferWebContents {
  private readonly destroyedListeners = new Set<() => void>()
  private readonly navigationListeners = new Set<(details: NavigationDetails) => void>()
  onSend?: (message: TransferCommand | TransferRecoveryMessage) => void
  constructor(readonly id: number) {}
  send(_channel: 'mt::workspace::transfer-command' | 'mt::workspace::transfer-recovery', payload: unknown): void {
    this.onSend?.(payload as TransferCommand | TransferRecoveryMessage)
  }

  on(event: 'destroyed', listener: () => void): void
  on(event: 'did-start-navigation', listener: (details: NavigationDetails) => void): void
  on(
    event: 'destroyed' | 'did-start-navigation',
    listener: (() => void) | ((details: NavigationDetails) => void)
  ): void {
    if (event === 'destroyed') this.destroyedListeners.add(listener as () => void)
    else this.navigationListeners.add(listener as (details: NavigationDetails) => void)
  }

  removeListener(event: 'destroyed', listener: () => void): void
  removeListener(event: 'did-start-navigation', listener: (details: NavigationDetails) => void): void
  removeListener(
    event: 'destroyed' | 'did-start-navigation',
    listener: (() => void) | ((details: NavigationDetails) => void)
  ): void {
    if (event === 'destroyed') this.destroyedListeners.delete(listener as () => void)
    else this.navigationListeners.delete(listener as (details: NavigationDetails) => void)
  }

  emit(event: 'destroyed'): void
  emit(event: 'did-start-navigation', details: NavigationDetails): void
  emit(event: 'destroyed' | 'did-start-navigation', details?: NavigationDetails): void {
    if (event === 'destroyed') {
      for (const listener of [...this.destroyedListeners]) listener()
    } else {
      for (const listener of [...this.navigationListeners]) listener(details ?? {})
    }
  }
}

interface NavigationDetails {
  readonly isMainFrame?: boolean
  readonly isSameDocument?: boolean
}
