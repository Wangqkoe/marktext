import { describe, expect, it } from 'vitest'
import { DefaultStartupPolicy, EmergencyRecoveryScanError } from '@shared/workspace'
import type { StartupIntent } from '@shared/workspace'
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

function expectDefined<T>(value: T | undefined, message = 'expected a defined value'): T {
  if (value === undefined) throw new Error(message)
  return value
}

describe('DefaultStartupPolicy and emergency recovery', () => {
  it('creates exactly one clean New Tab for no target and scans both emergency sources first', async() => {
    const crash = new MemoryCrashDraftRecovery()
    crash.checkpoint(checkpoint(1))
    const moves = new MemoryMoveRecovery()
    moves.add({ transferId: 'move-1', capsuleDigest: 'digest', phase: 'target-staged' })
    const started = await new DefaultStartupPolicy().start(
      { kind: 'no-target' },
      { crashDrafts: crash, moves }
    )
    expect(started.seed).toEqual({ kind: 'clean-new-tab', targets: [] })
    expect(started.emergency.crashDrafts).toHaveLength(1)
    expect(started.emergency.moves).toHaveLength(1)
  })

  it('seeds explicit targets only without suppressing either emergency source', async() => {
    const crash = new MemoryCrashDraftRecovery()
    crash.checkpoint(checkpoint(1))
    const moves = new MemoryMoveRecovery()
    moves.add({ transferId: 'move-2', capsuleDigest: 'digest', phase: 'requested' })
    const started = await new DefaultStartupPolicy().start(
      { kind: 'explicit-targets', targets: [{ fileKey: '/requested.md' }] },
      { crashDrafts: crash, moves }
    )
    expect(started.seed).toEqual({
      kind: 'explicit-targets',
      targets: [{ fileKey: '/requested.md' }]
    })
    expect(expectDefined(started.emergency.crashDrafts[0]).kind).toBe('crash-draft')
    expect(expectDefined(started.emergency.moves[0]).kind).toBe('move-recovery')
  })

  it('defensively turns a deserialized empty explicit intent into one clean New Tab', () => {
    const malformed = { kind: 'explicit-targets', targets: [] } as unknown as StartupIntent
    expect(new DefaultStartupPolicy().seed(malformed)).toEqual({
      kind: 'clean-new-tab',
      targets: []
    })
  })

  it.each(['crashDrafts', 'moves'] as const)(
    'scans the other emergency source when %s fails, including explicit startup',
    async(failing) => {
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
      await expect(
        new DefaultStartupPolicy().start(
          { kind: 'explicit-targets', targets: [{ fileKey: '/requested.md' }] },
          { crashDrafts, moves }
        )
      ).rejects.toBeInstanceOf(EmergencyRecoveryScanError)
      expect(crashCalls).toBe(1)
      expect(moveCalls).toBe(1)
    }
  )

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
    await expect(
      new DefaultStartupPolicy().start(
        { kind: 'explicit-targets', targets: [{ fileKey: '/requested.md' }] },
        { crashDrafts: { scan: scan('crashDrafts') }, moves: { scan: scan('moves') } }
      )
    ).rejects.toBeInstanceOf(EmergencyRecoveryScanError)
    expect(crashCalls).toBe(1)
    expect(moveCalls).toBe(1)
  })

  it('allows a later durable checkpoint to update its disk baseline', async() => {
    const crash = new MemoryCrashDraftRecovery()
    expect(crash.checkpoint(checkpoint(1, 'disk-a'))).toEqual({ durable: true })
    expect(
      crash.checkpoint({ ...checkpoint(2, 'disk-b'), observedDiskRevision: 'disk-b' })
    ).toEqual({ durable: true })

    const recovered = expectDefined((await crash.scan())[0])
    expect(recovered.draft.documentRevision).toBe(2)
    expect(recovered.draft.fileKey).toBe('/a.md')
    expect(recovered.draft.observedDiskRevision).toBe('disk-b')
  })

  it('allows untitled documents to become saved and Save As to establish a new baseline', async() => {
    const crash = new MemoryCrashDraftRecovery()
    expect(
      crash.checkpoint({
        documentId: 'document-a',
        documentRevision: 1,
        markdown: 'untitled',
        view: { cursor: { line: 0, column: 0 }, selection: null }
      })
    ).toEqual({ durable: true })
    expect(crash.checkpoint(checkpoint(2, 'saved-a'))).toEqual({ durable: true })
    expect(
      crash.checkpoint({ ...checkpoint(3, 'saved-b'), fileKey: '/b.md', observedDiskRevision: 'disk-b' })
    ).toEqual({ durable: true })

    const recovered = expectDefined((await crash.scan())[0])
    expect(recovered.draft.documentRevision).toBe(3)
    expect(recovered.draft.fileKey).toBe('/b.md')
    expect(recovered.draft.observedDiskRevision).toBe('disk-b')
  })

  it('models stable identity, monotonic durable ACK, stale ACK rejection, and corrupt latest fallback', async() => {
    const crash = new MemoryCrashDraftRecovery()
    const first = crash.beginCheckpoint(checkpoint(1, 'one'))
    expect(crash.acknowledge(first)).toEqual({ durable: true })
    const stale = crash.beginCheckpoint(checkpoint(2, 'two'))
    const newest = crash.beginCheckpoint(checkpoint(3, 'three'))
    expect(crash.acknowledge(newest)).toEqual({ durable: true })
    expect(crash.acknowledge(stale)).toEqual({ durable: false, reason: 'stale acknowledgement' })
    expect(crash.checkpoint(checkpoint(4, 'bad'), 'corrupt-latest')).toEqual({
      durable: false,
      reason: 'corrupt-latest'
    })
    const recovered = await crash.scan()
    const draft = expectDefined(recovered[0])
    expect(draft.draft.documentId).toBe('document-a')
    expect(draft.draft.documentRevision).toBe(3)
    expect(draft.draft.markdown).toBe('three')
    expect(draft.warning).toContain('last valid')
    expect(() => crash.beginCheckpoint({ ...checkpoint(5), observedDiskRevision: undefined })).toThrow(
      'both FileKey and DiskRevision'
    )
  })

  it('rejects a late old-baseline acknowledgement after a newer baseline is durable', async() => {
    const crash = new MemoryCrashDraftRecovery()
    const oldBaseline = crash.beginCheckpoint(checkpoint(1, 'old'))
    const newBaseline = crash.beginCheckpoint({
      ...checkpoint(2, 'new'),
      fileKey: '/b.md',
      observedDiskRevision: 'disk-b'
    })
    expect(crash.acknowledge(newBaseline)).toEqual({ durable: true })
    expect(crash.acknowledge(oldBaseline)).toEqual({
      durable: false,
      reason: 'stale acknowledgement'
    })

    const recovered = expectDefined((await crash.scan())[0])
    expect(recovered.draft.documentRevision).toBe(2)
    expect(recovered.draft.fileKey).toBe('/b.md')
    expect(recovered.draft.observedDiskRevision).toBe('disk-b')
  })

  it.each(['corrupt-latest', 'interrupted'] as const)(
    'falls back to the old baseline when a %s newer checkpoint is invalid',
    async(fault) => {
      const crash = new MemoryCrashDraftRecovery()
      crash.checkpoint(checkpoint(1, 'old baseline'))
      expect(
        crash.checkpoint(
          { ...checkpoint(2, 'new baseline'), fileKey: '/b.md', observedDiskRevision: 'disk-b' },
          fault
        )
      ).toEqual({ durable: false, reason: fault })

      const recovered = expectDefined((await crash.scan())[0])
      expect(recovered.draft.documentRevision).toBe(1)
      expect(recovered.draft.fileKey).toBe('/a.md')
      expect(recovered.draft.observedDiskRevision).toBe('disk-a')
      expect(recovered.warning).toContain('last valid')
    }
  )

  it.each(['corrupt-latest', 'interrupted'] as const)(
    'recovers a lower valid revision with a warning when %s is acknowledged first',
    async(fault) => {
      const crash = new MemoryCrashDraftRecovery()
      const newer = crash.beginCheckpoint(checkpoint(2, 'newer'), fault)
      const older = crash.beginCheckpoint(checkpoint(1, 'older'))

      expect(crash.acknowledge(newer)).toEqual({ durable: false, reason: fault })
      expect(crash.acknowledge(older)).toEqual({ durable: true })

      const recovered = expectDefined((await crash.scan())[0])
      expect(recovered.draft.documentRevision).toBe(1)
      expect(recovered.draft.markdown).toBe('older')
      expect(recovered.warning).toContain('last valid')
    }
  )

  it('does not warn when a higher valid revision covers an earlier fault attempt', async() => {
    const crash = new MemoryCrashDraftRecovery()
    const fault = crash.beginCheckpoint(checkpoint(2, 'interrupted'), 'interrupted')
    expect(crash.acknowledge(fault)).toEqual({ durable: false, reason: 'interrupted' })
    expect(crash.checkpoint(checkpoint(3, 'durable'))).toEqual({ durable: true })

    const recovered = expectDefined((await crash.scan())[0])
    expect(recovered.draft.documentRevision).toBe(3)
    expect(recovered.draft.markdown).toBe('durable')
    expect(recovered.warning).toBeUndefined()
  })

  it('selects the highest valid revision across out-of-order attempts', async() => {
    const crash = new MemoryCrashDraftRecovery()
    const highestFault = crash.beginCheckpoint(checkpoint(3, 'fault'), 'corrupt-latest')
    const firstValid = crash.beginCheckpoint(checkpoint(1, 'first'))
    const secondValid = crash.beginCheckpoint(checkpoint(2, 'second'))

    expect(crash.acknowledge(highestFault)).toEqual({ durable: false, reason: 'corrupt-latest' })
    expect(crash.acknowledge(firstValid)).toEqual({ durable: true })
    expect(crash.acknowledge(secondValid)).toEqual({ durable: true })

    const recovered = expectDefined((await crash.scan())[0])
    expect(recovered.draft.documentRevision).toBe(2)
    expect(recovered.draft.markdown).toBe('second')
    expect(recovered.warning).toContain('last valid')
  })

  it('does not advance the durable revision across an interrupted atomic gap', async() => {
    const crash = new MemoryCrashDraftRecovery()
    crash.checkpoint(checkpoint(1, 'safe'))
    expect(crash.checkpoint(checkpoint(2, 'lost'), 'interrupted')).toEqual({
      durable: false,
      reason: 'interrupted'
    })
    const recovered = await crash.scan()
    const draft = expectDefined(recovered[0])
    expect(draft.draft.documentRevision).toBe(1)
    expect(draft.draft.markdown).toBe('safe')
  })
})
