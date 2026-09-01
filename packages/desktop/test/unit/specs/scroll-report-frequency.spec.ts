import { describe, expect, it, vi } from 'vitest'
import type {
  EditorBindingSnapshot,
  EditorLease,
  EditorReport,
  PaneEditorAdapter,
  PaneEditorBinding
} from '@shared/workspace'
import { createScrollReportGate } from '@/util/scrollReportGate'
import { createWorkspaceProjectionMirror, createWorkspaceRuntime } from '@/workspace'

class MemoryEditor implements PaneEditorAdapter {
  report: EditorReport = {}

  async refresh(_snapshot: EditorBindingSnapshot): Promise<void> {}

  async flush(): Promise<EditorReport> {
    return this.report
  }
}

class ManualFrameScheduler {
  private nextHandle = 0
  private readonly active = new Map<number, FrameRequestCallback>()
  private readonly captured = new Map<number, FrameRequestCallback>()
  private readonly deferred = new Map<number, () => void>()
  private readonly capturedDeferred = new Map<number, () => void>()

  readonly request = (callback: FrameRequestCallback): number => {
    const handle = ++this.nextHandle
    this.active.set(handle, callback)
    this.captured.set(handle, callback)
    return handle
  }

  readonly cancel = (handle: number): void => {
    this.active.delete(handle)
  }

  readonly defer = (callback: () => void, _delayMs: number): number => {
    const handle = ++this.nextHandle
    this.deferred.set(handle, callback)
    this.capturedDeferred.set(handle, callback)
    return handle
  }

  readonly cancelDeferred = (handle: number): void => {
    this.deferred.delete(handle)
  }

  flush(timestamp = 0): void {
    const callbacks = [...this.active.values()]
    this.active.clear()
    for (const callback of callbacks) callback(timestamp)
  }

  fireCaptured(timestamp = 0): void {
    for (const callback of this.captured.values()) callback(timestamp)
  }

  flushDeferred(): void {
    const callbacks = [...this.deferred.values()]
    this.deferred.clear()
    for (const callback of callbacks) callback()
  }

  fireCapturedDeferred(): void {
    for (const callback of this.capturedDeferred.values()) callback()
  }
}

function currentLease(binding: PaneEditorBinding): EditorLease {
  const lease = binding.getLease()
  if (!lease) throw new Error('expected a current editor lease')
  return lease
}

describe('scroll report frequency', () => {
  it('does not publish a workspace commit for an unchanged scrollTop', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    const initialScrollTop = binding.getSnapshot(lease)?.view.scrollTop ?? 0
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)

    expect(binding.report(lease, { scrollTop: initialScrollTop }).status).toBe('applied')
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
    binding.dispose()
    workspace.dispose()
  })

  it('coalesces a same-frame active-view burst to its final scrollTop', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    const controllerListener = vi.fn()
    const unsubscribeController = workspace.subscribe(controllerListener)
    const mirror = createWorkspaceProjectionMirror(workspace)
    const mirrorListener = vi.fn()
    const unsubscribeMirror = mirror.subscribe(mirrorListener)
    mirrorListener.mockClear()
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn((scrollTop: number) => binding.report(lease, { scrollTop }))
    const gate = createScrollReportGate(report, scheduler)

    for (const scrollTop of [10, 20, 30, 40]) gate.request(scrollTop)

    expect(report).not.toHaveBeenCalled()
    scheduler.flush()

    expect(report).toHaveBeenCalledOnce()
    expect(report).toHaveBeenLastCalledWith(40)
    expect(controllerListener).toHaveBeenCalledOnce()
    expect(mirrorListener).toHaveBeenCalledOnce()
    expect(binding.getSnapshot(lease)?.view.scrollTop).toBe(40)

    gate.request(60)
    scheduler.flush()

    expect(report).toHaveBeenCalledTimes(2)
    expect(controllerListener).toHaveBeenCalledTimes(2)
    expect(mirrorListener).toHaveBeenCalledTimes(2)
    expect(binding.getSnapshot(lease)?.view.scrollTop).toBe(60)

    gate.request(60)
    scheduler.flush()

    expect(report).toHaveBeenCalledTimes(2)
    expect(controllerListener).toHaveBeenCalledTimes(2)
    expect(mirrorListener).toHaveBeenCalledTimes(2)

    gate.dispose()
    unsubscribeMirror()
    mirror.dispose()
    unsubscribeController()
    binding.dispose()
    workspace.dispose()
  })

  it('retries the latest current-lease scroll after a two-pane mutation temporarily rejects it', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'one', markdown: 'one' },
      { documentId: 'two', markdown: 'two' }
    ])
    expect((await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })).status).toBe(
      'applied'
    )
    const left = await workspace.bindPaneEditor('left', new MemoryEditor())
    const right = await workspace.bindPaneEditor('right', new MemoryEditor())
    const lease = currentLease(left)
    const scheduler = new ManualFrameScheduler()
    const attempts: ReturnType<PaneEditorBinding['report']>[] = []
    const report = vi.fn((scrollTop: number) => {
      const result = left.report(lease, { scrollTop })
      attempts.push(result)
      return result
    })
    const gate = createScrollReportGate(report, scheduler)

    const resizePanes = workspace.execute({ kind: 'set-split-ratio', ratio: 0.4 })
    gate.request(140)
    scheduler.flush()
    gate.request(180)
    scheduler.flush()
    scheduler.flush()
    const scrollTopWhilePending = left.getSnapshot(lease)?.view.scrollTop

    expect((await resizePanes).status).toBe('applied')
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    scheduler.flushDeferred()
    scheduler.flush()
    const finalScrollTop = left.getSnapshot(lease)?.view.scrollTop

    gate.dispose()
    unsubscribe()
    left.dispose()
    right.dispose()
    workspace.dispose()

    expect(attempts[0]).toEqual({
      status: 'rejected',
      reason: 'workspace mutation is in progress'
    })
    expect(scrollTopWhilePending).toBe(0)
    expect(report.mock.calls).toEqual([[140], [180], [180]])
    expect(listener).toHaveBeenCalledOnce()
    expect(finalScrollTop).toBe(180)
  })

  it('flushes the final value on unmount and drops the captured late frame', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn((scrollTop: number) => binding.report(lease, { scrollTop }))
    const gate = createScrollReportGate(report, scheduler)

    gate.request(80)
    gate.flush()
    expect(report).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
    expect(binding.getSnapshot(lease)?.view.scrollTop).toBe(80)

    unsubscribe()
    const transition = workspace.execute({ kind: 'new-tab', paneId: 'left' })
    gate.request(100)
    scheduler.flush()
    expect(report).toHaveBeenCalledTimes(2)
    gate.dispose()
    expect((await transition).status).toBe('applied')
    scheduler.fireCaptured()
    scheduler.fireCapturedDeferred()
    scheduler.flush()

    expect(report).toHaveBeenCalledTimes(2)

    binding.dispose()
    workspace.dispose()
  })

  it('rejects a late old-lease frame while transition flush keeps the final scrollTop', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const oldLease = currentLease(binding)
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn((scrollTop: number) => binding.report(oldLease, { scrollTop }))
    const gate = createScrollReportGate(report, scheduler)

    editor.report = { scrollTop: 90 }
    gate.request(90)
    expect((await workspace.execute({ kind: 'new-tab', paneId: 'left' })).status).toBe('applied')
    const pendingMutation = workspace.execute({ kind: 'new-tab', paneId: 'left' })
    scheduler.flush()
    expect((await pendingMutation).status).toBe('applied')
    const notificationsAfterTransition = vi.fn()
    const unsubscribe = workspace.subscribe(notificationsAfterTransition)

    scheduler.flushDeferred()
    scheduler.flush()

    expect(report).toHaveBeenCalledOnce()
    expect(notificationsAfterTransition).not.toHaveBeenCalled()
    expect(
      workspace
        .getFacadeSnapshot()
        .documents.find((document) => document.viewId === oldLease.viewId)?.scrollTop
    ).toBe(90)

    gate.dispose()
    unsubscribe()
    binding.dispose()
    workspace.dispose()
  })
})
