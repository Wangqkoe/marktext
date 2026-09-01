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

  readonly request = (callback: FrameRequestCallback): number => {
    const handle = ++this.nextHandle
    this.active.set(handle, callback)
    this.captured.set(handle, callback)
    return handle
  }

  readonly cancel = (handle: number): void => {
    this.active.delete(handle)
  }

  flush(timestamp = 0): void {
    const callbacks = [...this.active.values()]
    this.active.clear()
    for (const callback of callbacks) callback(timestamp)
  }

  fireCaptured(timestamp = 0): void {
    for (const callback of this.captured.values()) callback(timestamp)
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
    const report = vi.fn(
      (scrollTop: number) => binding.report(lease, { scrollTop }).status === 'applied'
    )
    const gate = createScrollReportGate(report, {
      request: scheduler.request,
      cancel: scheduler.cancel
    })

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

  it('flushes the final value on unmount and drops the captured late frame', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn(
      (scrollTop: number) => binding.report(lease, { scrollTop }).status === 'applied'
    )
    const gate = createScrollReportGate(report, {
      request: scheduler.request,
      cancel: scheduler.cancel
    })

    gate.request(80)
    gate.flush()
    expect(report).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
    expect(binding.getSnapshot(lease)?.view.scrollTop).toBe(80)

    gate.dispose()
    binding.dispose()
    scheduler.fireCaptured()

    expect(report).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    workspace.dispose()
  })

  it('rejects a late old-lease frame while transition flush keeps the final scrollTop', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const oldLease = currentLease(binding)
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn(
      (scrollTop: number) => binding.report(oldLease, { scrollTop }).status === 'applied'
    )
    const gate = createScrollReportGate(report, {
      request: scheduler.request,
      cancel: scheduler.cancel
    })

    editor.report = { scrollTop: 90 }
    gate.request(90)
    expect((await workspace.execute({ kind: 'new-tab', paneId: 'left' })).status).toBe('applied')
    const notificationsAfterTransition = vi.fn()
    const unsubscribe = workspace.subscribe(notificationsAfterTransition)

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
