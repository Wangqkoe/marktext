import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  MemoryCapsuleStorage,
  MemoryTransferJournal,
  MemoryTransferTransport,
  TabTransferCoordinator,
  type TransferIntent
} from 'main_renderer/tabTransfer'

const intent = (transport: MemoryTransferTransport): TransferIntent => ({
  requestId: 'request',
  fingerprint: 'fingerprint',
  source: transport.endpoint(),
  sourceDocumentId: 'doc',
  sourceViewId: 'view',
  sourceLineage: 'lineage',
  documentRevision: 2,
  isLastSourceTab: false,
  capsule: {
    version: 1,
    sourceDocumentId: 'doc',
    sourceViewId: 'view',
    sourceSessionId: 'source',
    sourceLineage: 'lineage',
    documentRevision: 2,
    title: 'Doc',
    markdown: 'content',
    dirty: false,
    conflict: false,
    options: {},
    history: { version: 1, value: { undo: [] } },
    view: { cursor: { line: 0, column: 0 }, selection: null, scrollTop: 0, mode: 'source' }
  }
})

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

const seedRestart = async(
  journal: MemoryTransferJournal,
  capsules: MemoryCapsuleStorage,
  transport: MemoryTransferTransport,
  phase: 'requested' | 'source-prepared' | 'target-staged' | 'commit-authorized' | 'source-released' | 'target-activated'
) => {
  const source = transport.endpoint()
  const target = await transport.createTarget('transfer')
  const capsule = intent(transport).capsule
  const bytes = new TextEncoder().encode(JSON.stringify(capsule))
  const capsuleDigest = createHash('sha256').update(bytes).digest('hex')
  await capsules.put('transfer', bytes, capsuleDigest)
  await journal.append({
    transferId: 'transfer',
    requestId: 'request',
    fingerprint: 'fingerprint',
    phase,
    kind: 'observed',
    capsuleDigest,
    source,
    ...(phase === 'requested' ? {} : { target }),
    ownerSessionId: phase === 'requested' ? source.sessionId : target.sessionId,
    documentRevision: 2,
    isLastSourceTab: false
  })
}

describe('TabTransfer recovery', () => {
  it.each(['requested', 'source-prepared', 'target-staged', 'commit-authorized', 'source-released', 'target-activated'] as const)(
    'recovers a kill/restart after observed %s without duplicate ownership',
    async phase => {
      const journal = new MemoryTransferJournal()
      const capsules = new MemoryCapsuleStorage()
      const transport = new MemoryTransferTransport()
      await seedRestart(journal, capsules, transport, phase)
      const restarted = new TabTransferCoordinator(journal, capsules, transport)
      await expect(restarted.recover()).resolves.toEqual([{ status: 'applied', transferId: 'transfer' }])
      expect((await journal.records()).filter(record => record.phase === 'completed' && record.kind === 'observed')).toHaveLength(1)
    }
  )

  it('does not roll source ownership back when a post-authorization command is lost; recovery completes the original promise', async() => {
    const journal = new MemoryTransferJournal()
    const capsules = new MemoryCapsuleStorage()
    const transport = new MemoryTransferTransport()
    const coordinator = new TabTransferCoordinator(journal, capsules, transport, () => 'transfer')
    transport.plan('source-released', { status: 'timeout' })
    const execution = coordinator.run(intent(transport))
    await settle()
    expect((await coordinator.scan()).map(record => record.phase)).toContain('commit-authorized')
    await expect(coordinator.recover()).resolves.toEqual([{ status: 'applied', transferId: 'transfer' }])
    await expect(execution).resolves.toEqual({ status: 'applied', transferId: 'transfer' })
    expect((await journal.records()).filter(record => record.phase === 'commit-authorized' && record.kind === 'observed')).toHaveLength(1)
  })

  it('tombstones pre-authorization capsule corruption and retains completed ownership when deletion fails', async() => {
    const journal = new MemoryTransferJournal()
    const capsules = new MemoryCapsuleStorage()
    const transport = new MemoryTransferTransport()
    const coordinator = new TabTransferCoordinator(journal, capsules, transport, () => 'transfer')
    capsules.failDelete = true
    transport.plan('target-staged', { status: 'timeout' }, { status: 'timeout' }, { status: 'timeout' })
    const _run = coordinator.run(intent(transport))
    await settle()
    capsules.corrupt('transfer', new Uint8Array([1, 2, 3]))
    const restarted = new TabTransferCoordinator(journal, capsules, transport)
    await expect(restarted.recover()).resolves.toMatchObject([{ status: 'failed' }])
    expect(capsules.tombstones.has('transfer')).toBe(true)

    const cleanTransport = new MemoryTransferTransport()
    const completeCapsules = new MemoryCapsuleStorage()
    completeCapsules.failDelete = true
    const clean = new TabTransferCoordinator(new MemoryTransferJournal(), completeCapsules, cleanTransport, () => 'clean')
    await expect(clean.run(intent(cleanTransport))).resolves.toMatchObject({ status: 'applied' })
  })

  it('preserves content/view, clears corrupt portable history, and retains a recovery projection warning after authorization', async() => {
    const journal = new MemoryTransferJournal()
    const capsules = new MemoryCapsuleStorage()
    const transport = new MemoryTransferTransport()
    const source = transport.endpoint()
    const target = await transport.createTarget('transfer')
    const { history: _history, ...withoutHistory } = intent(transport).capsule
    const bytes = new TextEncoder().encode(JSON.stringify(withoutHistory))
    const capsuleDigest = createHash('sha256').update(bytes).digest('hex')
    await capsules.put('transfer', bytes, capsuleDigest)
    await journal.append({
      transferId: 'transfer',
      requestId: 'request',
      fingerprint: 'fingerprint',
      phase: 'commit-authorized',
      kind: 'observed',
      capsuleDigest,
      source,
      target,
      ownerSessionId: target.sessionId,
      documentRevision: 2,
      isLastSourceTab: false
    })
    const coordinator = new TabTransferCoordinator(journal, capsules, transport)
    await expect(coordinator.recover()).resolves.toEqual([{ status: 'applied', transferId: 'transfer' }])
    expect(coordinator.getRecoveryProjection().transfers).toMatchObject([
      { transferId: 'transfer', phase: 'completed', warning: expect.stringContaining('history') }
    ])
  })
})
