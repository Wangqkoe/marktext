import { describe, expect, it } from 'vitest'
import { DefaultStartupPolicy, EmergencyRecoveryScanError } from '@shared/workspace'
import { MemoryCrashDraftRecovery, MemoryMoveRecovery } from '@/workspace'

function checkpoint(revision: number, markdown = `revision ${revision}`) {
  return {
    documentId: 'document-a',
    fileKey: '/a.md',
    observedDiskRevision: 'disk-a',
    documentRevision: revision,
    markdown,
    view: { cursor: { line: 0, column: 0 }, selection: null }
  }
}

describe('DefaultStartupPolicy and emergency recovery', () => {
  it('creates exactly one clean New Tab for no target and scans both emergency sources first', async() => {
    const crash = new MemoryCrashDraftRecovery()
    crash.checkpoint(checkpoint(1))
    const moves = new MemoryMoveRecovery()
    moves.add({ transferId: 'move-1', capsuleDigest: 'digest', phase: 'target-staged' })
    const started = await new DefaultStartupPolicy().start({ kind: 'no-target' }, { crashDrafts: crash, moves })
    expect(started.seed).toEqual({ kind: 'clean-new-tab', targets: [] })
    expect(started.emergency.crashDrafts).toHaveLength(1)
    expect(started.emergency.moves).toHaveLength(1)
  })

  it('seeds explicit targets only without suppressing either emergency source', async() => {
    const crash = new MemoryCrashDraftRecovery()
    crash.checkpoint(checkpoint(1))
    const moves = new MemoryMoveRecovery()
    moves.add({ transferId: 'move-2', capsuleDigest: 'digest', phase: 'requested' })
    const started = await new DefaultStartupPolicy().start({ kind: 'explicit-targets', targets: [{ fileKey: '/requested.md' }] }, { crashDrafts: crash, moves })
    expect(started.seed).toEqual({ kind: 'explicit-targets', targets: [{ fileKey: '/requested.md' }] })
    expect(started.emergency.crashDrafts[0]!.kind).toBe('crash-draft')
    expect(started.emergency.moves[0]!.kind).toBe('move-recovery')
  })

  it.each(['crashDrafts', 'moves'] as const)('scans the other emergency source when %s fails, including explicit startup', async(failing) => {
    let crashCalls = 0
    let moveCalls = 0
    const crashDrafts = {
      scan: async() => {
        crashCalls += 1
        if (failing === 'crashDrafts') throw new Error('crash scan failure')
        return []
      }
    }
    const moves = {
      scan: async() => {
        moveCalls += 1
        if (failing === 'moves') throw new Error('move scan failure')
        return []
      }
    }
    await expect(new DefaultStartupPolicy().start(
      { kind: 'explicit-targets', targets: [{ fileKey: '/requested.md' }] },
      { crashDrafts, moves }
    )).rejects.toBeInstanceOf(EmergencyRecoveryScanError)
    expect(crashCalls).toBe(1)
    expect(moveCalls).toBe(1)
  })

  it.each([
    { failing: 'crashDrafts' as const, failure: 'sync' as const },
    { failing: 'moves' as const, failure: 'async' as const }
  ])('starts both sources when $failing has a $failure failure', async({ failing, failure }) => {
    let crashCalls = 0
    let moveCalls = 0
    const scan = (source: 'crashDrafts' | 'moves') => () => {
      if (source === 'crashDrafts') crashCalls += 1
      else moveCalls += 1
      if (source === failing) {
        if (failure === 'sync') throw new Error(`${source} synchronous failure`)
        return Promise.reject(new Error(`${source} asynchronous failure`))
      }
      return Promise.resolve([])
    }
    await expect(new DefaultStartupPolicy().start(
      { kind: 'explicit-targets', targets: [{ fileKey: '/requested.md' }] },
      { crashDrafts: { scan: scan('crashDrafts') }, moves: { scan: scan('moves') } }
    )).rejects.toBeInstanceOf(EmergencyRecoveryScanError)
    expect(crashCalls).toBe(1)
    expect(moveCalls).toBe(1)
  })

  it('models stable identity, monotonic durable ACK, stale ACK rejection, and corrupt latest fallback', async() => {
    const crash = new MemoryCrashDraftRecovery()
    const first = crash.beginCheckpoint(checkpoint(1, 'one'))
    expect(crash.acknowledge(first)).toEqual({ durable: true })
    const stale = crash.beginCheckpoint(checkpoint(2, 'two'))
    const newest = crash.beginCheckpoint(checkpoint(3, 'three'))
    expect(crash.acknowledge(newest)).toEqual({ durable: true })
    expect(crash.acknowledge(stale)).toEqual({ durable: false, reason: 'stale acknowledgement' })
    expect(crash.checkpoint(checkpoint(4, 'bad'), 'corrupt-latest')).toEqual({ durable: false, reason: 'corrupt-latest' })
    const recovered = await crash.scan()
    expect(recovered[0]!.draft.documentId).toBe('document-a')
    expect(recovered[0]!.draft.documentRevision).toBe(3)
    expect(recovered[0]!.draft.markdown).toBe('three')
    expect(recovered[0]!.warning).toContain('last valid')
    expect(() => crash.beginCheckpoint({ ...checkpoint(4), fileKey: '/other.md' })).toThrow('identity')
  })

  it('does not advance the durable revision across an interrupted atomic gap', async() => {
    const crash = new MemoryCrashDraftRecovery()
    crash.checkpoint(checkpoint(1, 'safe'))
    expect(crash.checkpoint(checkpoint(2, 'lost'), 'interrupted')).toEqual({ durable: false, reason: 'interrupted' })
    const recovered = await crash.scan()
    expect(recovered[0]!.draft.documentRevision).toBe(1)
    expect(recovered[0]!.draft.markdown).toBe('safe')
  })
})
