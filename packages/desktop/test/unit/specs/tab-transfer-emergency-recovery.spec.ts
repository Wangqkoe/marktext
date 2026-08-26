import { describe, expect, it } from 'vitest'
import { DefaultStartupPolicy } from '@shared/workspace'
import { MemoryCapsuleStorage, MemoryTransferJournal, MemoryTransferTransport, TabTransferCoordinator, type TransferIntent } from 'main_renderer/tabTransfer'

const move = (transport: MemoryTransferTransport): TransferIntent => ({
  requestId: 'r',
  fingerprint: 'f',
  source: transport.endpoint(),
  sourceDocumentId: 'd',
  sourceViewId: 'v',
  sourceLineage: 'l',
  documentRevision: 1,
  isLastSourceTab: true,
  capsule: {
    version: 1,
    sourceDocumentId: 'd',
    sourceViewId: 'v',
    sourceSessionId: 'source',
    sourceLineage: 'l',
    documentRevision: 1,
    title: 'Untitled',
    markdown: 'recovered content',
    dirty: true,
    conflict: false,
    options: {},
    history: { version: 1, value: {} },
    view: { cursor: { line: 0, column: 0 }, selection: null, scrollTop: 0, mode: 'wysiwyg' }
  }
})

describe('MoveRecovery emergency boundary', () => {
  it.each([
    { kind: 'no-target' as const },
    { kind: 'explicit-targets' as const, targets: [{ fileKey: '/explicit.md' }] as const }
  ])('scans MoveRecovery independently for %o startup and creates a durable recovery-owner migration', async(startupIntent) => {
    const journal = new MemoryTransferJournal()
    const capsules = new MemoryCapsuleStorage()
    const transport = new MemoryTransferTransport()
    const coordinator = new TabTransferCoordinator(journal, capsules, transport, () => 'transfer')
    transport.plan('source-released', { status: 'timeout' })
    const _run = coordinator.run(move(transport))
    await new Promise(resolve => setTimeout(resolve, 0))
    transport.kill('target-1')
    const startup = await new DefaultStartupPolicy().start(startupIntent, { crashDrafts: { scan: async() => [] }, moves: coordinator })
    expect(startup.emergency.moves).toEqual([{ kind: 'move-recovery', transferId: 'transfer', capsuleDigest: expect.any(String), phase: 'commit-authorized' }])
    await expect(coordinator.recover()).resolves.toEqual([{ status: 'applied', transferId: 'transfer' }])
    expect(await journal.ownerMigrations()).toMatchObject([{ transferId: 'transfer', recoveryWindowSessionId: expect.stringMatching(/^recovery-/) }])
  })

  it('does not scan or claim CrashDraftRecovery', async() => {
    const coordinator = new TabTransferCoordinator(new MemoryTransferJournal(), new MemoryCapsuleStorage(), new MemoryTransferTransport())
    await expect(coordinator.scan()).resolves.toEqual([])
    expect(coordinator.getRecoveryProjection().transfers).toEqual([])
  })
})
