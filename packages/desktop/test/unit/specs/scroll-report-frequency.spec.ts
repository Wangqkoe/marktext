/* eslint-disable vue/one-component-per-file -- Exercises real parent/child unmount ordering. */
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, onBeforeUnmount } from 'vue'
import type {
  DocumentIoObservation,
  DocumentIoPort,
  DocumentIoRequest,
  DocumentSaveAck,
  EditorBindingSnapshot,
  EditorLease,
  EditorReport,
  PaneEditorAdapter,
  PaneEditorBinding
} from '@shared/workspace'
import { createScrollReportGate, type ScrollReportGate } from '@/util/scrollReportGate'
import { registerWorkspaceTreeUnmount } from '@/components/editorWithTabs/workspaceTreeLifecycle'
import {
  createPaneEditorComposition,
  createWorkspaceProjectionMirror,
  createWorkspaceRuntime,
  type PaneEditorEventScope,
  type PaneEditorSurface
} from '@/workspace'

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

  get pendingCallbacks(): number {
    return this.active.size + this.deferred.size
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

class LegacyFinalReportEditor extends MemoryEditor {
  takeFinalReport(): EditorReport {
    return {
      markdown: 'stale-final',
      portableHistory: { version: 1, value: ['stale-history'] },
      scrollTop: 200
    }
  }
}

class VisibleMemoryEditor extends MemoryEditor {
  visibleScrollTop = 0

  override async refresh(snapshot: EditorBindingSnapshot): Promise<void> {
    this.visibleScrollTop = snapshot.view.scrollTop
  }

  override async flush(): Promise<EditorReport> {
    if (this.report.scrollTop !== undefined) this.visibleScrollTop = this.report.scrollTop
    return this.report
  }
}

class RecordingDocumentIoPort implements DocumentIoPort {
  readonly requests: DocumentIoRequest[] = []
  private readonly listeners = new Set<(observation: DocumentIoObservation) => void>()

  async request(request: DocumentIoRequest): Promise<DocumentSaveAck> {
    this.requests.push(request)
    if (request.kind === 'bind' || request.kind === 'sync') {
      return {
        status: 'bound',
        requestId: request.requestId,
        documentId: request.documentId,
        ownerFence: request.kind === 'bind' ? 'document-owner' : request.ownerFence,
        observedDiskRevision: 'disk-revision'
      }
    }
    if (request.kind === 'unbind') {
      return {
        status: 'unbound',
        requestId: request.requestId,
        documentId: request.documentId,
        ownerFence: request.ownerFence
      }
    }
    return {
      status: 'durable-success',
      requestId: request.requestId,
      documentId: request.documentId,
      documentRevision: request.documentRevision,
      ownerFence: request.ownerFence ?? 'document-owner'
    }
  }

  subscribe(listener: (observation: DocumentIoObservation) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

class LifecyclePaneSurface implements PaneEditorSurface {
  readonly scopes: Array<PaneEditorEventScope | undefined> = []

  async stage(_snapshot: EditorBindingSnapshot, scope?: PaneEditorEventScope) {
    return {
      commit: () => this.scopes.push(scope),
      cancel: () => undefined
    }
  }

  async flush(_snapshot: EditorBindingSnapshot): Promise<EditorReport> {
    return {}
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

    expect(report).toHaveBeenCalledTimes(3)
    expect(controllerListener).toHaveBeenCalledTimes(2)
    expect(mirrorListener).toHaveBeenCalledTimes(2)

    gate.dispose()
    unsubscribeMirror()
    mirror.dispose()
    unsubscribeController()
    binding.dispose()
    workspace.dispose()
  })

  it('reports a value again after a same-lease flush changes the canonical scrollTop', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const lease = currentLease(binding)
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn((scrollTop: number) => binding.report(lease, { scrollTop }))
    const gate = createScrollReportGate(report, scheduler)

    gate.request(100)
    scheduler.flush()
    editor.report = { scrollTop: 200 }
    expect((await binding.flush(lease)).status).toBe('applied')
    gate.request(100)
    scheduler.flush()
    const finalScrollTop = binding.getSnapshot(lease)?.view.scrollTop

    gate.dispose()
    binding.dispose()
    workspace.dispose()

    expect(report.mock.calls).toEqual([[100], [100]])
    expect(finalScrollTop).toBe(100)
  })

  it('ignores an adapter method that attempts to finalize a complete stale editor report', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const binding = await workspace.bindPaneEditor('left', new LegacyFinalReportEditor())
    const lease = currentLease(binding)
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    const mirror = createWorkspaceProjectionMirror(workspace)
    const mirrorListener = vi.fn()
    const unsubscribeMirror = mirror.subscribe(mirrorListener)
    mirrorListener.mockClear()

    const unsafeFinalize = binding.finalizeScroll as unknown as (
      lease: EditorLease,
      scrollTop: unknown
    ) => ReturnType<PaneEditorBinding['finalizeScroll']>
    expect(unsafeFinalize(lease, { markdown: 'stale-object' })).toEqual({
      status: 'rejected',
      reason: 'invalid final scrollTop'
    })
    expect(binding.finalizeScroll(lease, Number.NaN)).toEqual({
      status: 'rejected',
      reason: 'invalid final scrollTop'
    })
    expect(binding.finalizeScroll(lease, Number.POSITIVE_INFINITY)).toEqual({
      status: 'rejected',
      reason: 'invalid final scrollTop'
    })

    binding.dispose()
    const successor = await workspace.bindPaneEditor('left', new MemoryEditor())
    const successorLease = currentLease(successor)
    const canonical = workspace.getFacadeSnapshot().documents.find(
      (document) => document.documentId === 'note'
    )
    const visible = successor.getSnapshot(successorLease)

    expect(canonical).toMatchObject({ markdown: 'body', dirty: false, scrollTop: 0 })
    expect(visible?.document).toMatchObject({ markdown: 'body', dirty: false })
    expect(visible?.document.portableHistory).toEqual({ version: 1, value: [] })
    expect(visible?.view.scrollTop).toBe(0)
    expect(listener).not.toHaveBeenCalled()
    expect(mirrorListener).not.toHaveBeenCalled()

    unsubscribeMirror()
    mirror.dispose()
    unsubscribe()
    successor.dispose()
    workspace.dispose()
  })

  it('does not persist markdown or history when finalizing only scroll state', async() => {
    const testWindow = window as unknown as {
      electron?: {
        ipcRenderer?: {
          invoke?: (channel: string, request: unknown) => Promise<unknown>
        }
      }
    }
    const originalElectron = testWindow.electron
    const invoke = vi.fn(async(_channel: string, _request: unknown): Promise<unknown> => ({
      durable: true,
      receipt: 'crash-receipt'
    }))
    testWindow.electron = {
      ...originalElectron,
      ipcRenderer: { ...originalElectron?.ipcRenderer, invoke }
    }

    try {
      const workspace = createWorkspaceRuntime([
        { documentId: 'note', fileKey: '/note.md', markdown: 'body' }
      ])
      const documentIoPort = new RecordingDocumentIoPort()
      const composition = createPaneEditorComposition({
        paneId: 'left',
        controller: workspace,
        documentIoPort
      })
      const surface = new LifecyclePaneSurface()
      await composition.mount(surface, {
        id: 'note',
        fileKey: '/note.md',
        markdown: 'body',
        title: 'note'
      })
      await vi.waitFor(() =>
        expect(documentIoPort.requests.some((request) => request.kind === 'sync')).toBe(true)
      )
      documentIoPort.requests.length = 0
      invoke.mockClear()
      const scope = composition.getScope()
      if (!scope) throw new Error('expected a mounted pane scope')
      const listener = vi.fn()
      const unsubscribe = workspace.subscribe(listener)

      expect(scope.finalizeScroll(200).status).toBe('applied')
      await vi.waitFor(() =>
        expect(documentIoPort.requests.some((request) => request.kind === 'sync')).toBe(true)
      )
      await composition.checkpointCrashDraft()
      const canonical = workspace.getFacadeSnapshot().documents.find(
        (document) => document.documentId === 'note'
      )
      const checkpointRequests = invoke.mock.calls
        .filter(([channel]) => channel === 'mt::workspace::crash-draft')
        .map(([, request]) => request)
        .filter((request) => (request as { kind?: string }).kind === 'checkpoint')

      expect(canonical).toMatchObject({ markdown: 'body', dirty: false, scrollTop: 200 })
      expect(documentIoPort.requests).toEqual([
        expect.objectContaining({ kind: 'sync', dirty: false })
      ])
      expect(documentIoPort.requests[0]).not.toHaveProperty('markdown')
      expect(checkpointRequests).toEqual([])
      expect(listener).toHaveBeenCalledOnce()

      unsubscribe()
      composition.unmount(surface)
      workspace.dispose()
    } finally {
      testWindow.electron = originalElectron
    }
  })

  it('lets a queued successor generation win over its predecessor final scroll', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const predecessor = createPaneEditorComposition({ paneId: 'left', controller: workspace })
    const predecessorSurface = new LifecyclePaneSurface()
    await predecessor.mount(predecessorSurface, {
      id: 'note',
      markdown: 'body',
      title: 'note'
    })
    const predecessorScope = predecessor.getScope()
    if (!predecessorScope) throw new Error('expected a predecessor pane scope')
    expect(predecessorScope.report({ scrollTop: 100 }).status).toBe('applied')
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    const mirror = createWorkspaceProjectionMirror(workspace)
    const mirrorListener = vi.fn()
    const unsubscribeMirror = mirror.subscribe(mirrorListener)
    mirrorListener.mockClear()
    const successorEditor = new VisibleMemoryEditor()
    successorEditor.report = { scrollTop: 300 }

    const successorBinding = workspace.bindPaneEditor('left', successorEditor)
    expect(predecessorScope.finalizeScroll(200).status).toBe('applied')
    predecessor.unmount(predecessorSurface)
    const successor = await successorBinding
    const successorLease = currentLease(successor)
    const canonical = workspace.getFacadeSnapshot().documents.find(
      (document) => document.documentId === 'note'
    )

    expect(canonical?.scrollTop).toBe(300)
    expect(successor.getSnapshot(successorLease)?.view.scrollTop).toBe(300)
    expect(successorEditor.visibleScrollTop).toBe(300)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(mirrorListener).toHaveBeenCalledTimes(2)

    unsubscribeMirror()
    mirror.dispose()
    unsubscribe()
    successor.dispose()
    workspace.dispose()
  })

  it('finalizes child scroll before a real Vue tree disposes its workspace controller', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const composition = createPaneEditorComposition({ paneId: 'left', controller: workspace })
    const surface = new LifecyclePaneSurface()
    await composition.mount(surface, { id: 'note', markdown: 'body', title: 'note' })
    const scope = composition.getScope()
    if (!scope) throw new Error('expected a mounted pane scope')
    expect(scope.report({ scrollTop: 100 }).status).toBe('applied')
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    const mirror = createWorkspaceProjectionMirror(workspace)
    const mirrorListener = vi.fn()
    const unsubscribeMirror = mirror.subscribe(mirrorListener)
    mirrorListener.mockClear()
    const scheduler = new ManualFrameScheduler()
    const gate = createScrollReportGate(
      () => ({ status: 'rejected', reason: 'workspace mutation is in progress' }),
      scheduler
    )
    gate.request(200)
    gate.flush()
    let finalResult: ReturnType<PaneEditorEventScope['finalizeScroll']> | undefined

    const ChildPane = defineComponent({
      setup() {
        onBeforeUnmount(() => {
          const finalScrollTop = gate.dispose()
          if (finalScrollTop !== undefined) finalResult = scope.finalizeScroll(finalScrollTop)
          composition.unmount(surface)
        })
        return () => h('div')
      }
    })
    const WorkspaceTree = defineComponent({
      setup() {
        registerWorkspaceTreeUnmount(workspace, () => undefined)
        return () => h(ChildPane)
      }
    })
    const host = document.createElement('div')
    const app = createApp(WorkspaceTree)
    app.mount(host)
    app.unmount()
    const canonical = workspace.getFacadeSnapshot().documents.find(
      (document) => document.documentId === 'note'
    )

    expect(finalResult).toMatchObject({ status: 'applied' })
    expect(canonical?.scrollTop).toBe(200)
    expect(listener).toHaveBeenCalledOnce()
    expect(mirrorListener).toHaveBeenCalledOnce()

    unsubscribeMirror()
    mirror.dispose()
    unsubscribe()
  })

  it('preserves the final scroll when a component flush is temporarily rejected before unmount', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'one', markdown: 'one' },
      { documentId: 'two', markdown: 'two' }
    ])
    expect((await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })).status).toBe(
      'applied'
    )
    const composition = createPaneEditorComposition({ paneId: 'left', controller: workspace })
    const surface = new LifecyclePaneSurface()
    await composition.mount(surface, { id: 'one', markdown: 'one', title: 'one' })
    const scope = composition.getScope()
    if (!scope) throw new Error('expected a mounted pane scope')
    const scheduler = new ManualFrameScheduler()
    const attempts = vi.fn((scrollTop: number) => scope.report({ scrollTop }))
    const gate = createScrollReportGate(attempts, scheduler)

    gate.request(100)
    scheduler.flush()
    const resizePanes = workspace.execute({ kind: 'set-split-ratio', ratio: 0.4 })
    gate.request(200)
    gate.flush()
    const finalScrollTop = gate.dispose()
    if (finalScrollTop !== undefined) scope.finalizeScroll(finalScrollTop)
    composition.unmount(surface)

    expect((await resizePanes).status).toBe('applied')
    expect((await workspace.execute({ kind: 'set-split-ratio', ratio: 0.5 })).status).toBe('applied')
    scheduler.fireCaptured()
    scheduler.fireCapturedDeferred()
    scheduler.flush()
    const canonicalScrollTop = workspace
      .getFacadeSnapshot()
      .documents.find((document) => document.viewId === scope.viewId)?.scrollTop

    workspace.dispose()

    expect(attempts.mock.results[1]?.value).toEqual({
      status: 'rejected',
      reason: 'workspace mutation is in progress'
    })
    expect(attempts).toHaveBeenCalledTimes(2)
    expect(canonicalScrollTop).toBe(200)
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

  it('keeps one scheduled callback when a temporary rejection reports a reentrant value', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'one', markdown: 'one' },
      { documentId: 'two', markdown: 'two' }
    ])
    expect((await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })).status).toBe(
      'applied'
    )
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    const scheduler = new ManualFrameScheduler()
    const gateRef: { gate?: ScrollReportGate } = {}
    const report = vi.fn((scrollTop: number) => {
      const result = binding.report(lease, { scrollTop })
      if (scrollTop === 10) gateRef.gate?.request(20)
      return result
    })
    const gate = createScrollReportGate(report, scheduler)
    gateRef.gate = gate

    const resizePanes = workspace.execute({ kind: 'set-split-ratio', ratio: 0.4 })
    gate.request(10)
    scheduler.flush()
    const pendingCallbacks = scheduler.pendingCallbacks

    gate.dispose()
    expect((await resizePanes).status).toBe('applied')
    binding.dispose()
    workspace.dispose()

    expect(report).toHaveBeenCalledOnce()
    expect(pendingCallbacks).toBe(1)
  })

  it('treats a transfer preflight fence as permanent while another mutation is pending', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'one', markdown: 'one' },
      { documentId: 'two', markdown: 'two' }
    ])
    expect((await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })).status).toBe(
      'applied'
    )
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    const preflight = await workspace.beginTransferPreflight('left', lease.viewId, 'scroll-preflight')
    if (!preflight) throw new Error('expected a transfer preflight')
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn((scrollTop: number) => binding.report(lease, { scrollTop }))
    const gate = createScrollReportGate(report, scheduler)

    const resizePanes = workspace.execute({ kind: 'set-split-ratio', ratio: 0.4 })
    gate.request(70)
    scheduler.flush()
    expect((await resizePanes).status).toBe('applied')
    scheduler.flushDeferred()
    scheduler.flush()
    const result = report.mock.results[0]?.value

    gate.dispose()
    await workspace.clearTransferPreflight(preflight.preflightId)
    binding.dispose()
    workspace.dispose()

    expect(result).toEqual({ status: 'rejected', reason: 'transfer preflight fence is active' })
    expect(report).toHaveBeenCalledOnce()
  })

  it('keeps a post-preflight final scroll and revokes the stale transfer ownership fence', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'body' }])
    const editor = new VisibleMemoryEditor()
    editor.report = { scrollTop: 100 }
    const binding = await workspace.bindPaneEditor('left', editor)
    const lease = currentLease(binding)
    const preflight = await workspace.beginTransferPreflight(
      'left',
      lease.viewId,
      'final-scroll-preflight'
    )
    if (!preflight) throw new Error('expected a transfer preflight')
    const listener = vi.fn()
    const unsubscribe = workspace.subscribe(listener)
    const mirror = createWorkspaceProjectionMirror(workspace)
    const mirrorListener = vi.fn()
    const unsubscribeMirror = mirror.subscribe(mirrorListener)
    mirrorListener.mockClear()
    const scheduler = new ManualFrameScheduler()
    const report = vi.fn((scrollTop: number) => binding.report(lease, { scrollTop }))
    const gate = createScrollReportGate(report, scheduler)

    editor.visibleScrollTop = 200
    gate.request(200)
    gate.flush()
    const finalScrollTop = gate.dispose()
    if (finalScrollTop !== undefined) {
      expect(binding.finalizeScroll(lease, finalScrollTop).status).toBe('applied')
    }
    const preparedRevision = await workspace.prepareTransfer(
      'stale-scroll-transfer',
      preflight.documentId,
      preflight.viewId,
      preflight.documentRevision,
      preflight.preflightId
    )
    const canonical = workspace.getFacadeSnapshot().documents.find(
      (document) => document.documentId === 'note'
    )
    const activeSnapshot = binding.getSnapshot(lease)

    expect(preflight.view.scrollTop).toBe(100)
    expect(report.mock.results[0]?.value).toEqual({
      status: 'rejected',
      reason: 'transfer preflight fence is active'
    })
    expect(report).toHaveBeenCalledOnce()
    expect(finalScrollTop).toBe(200)
    expect(preparedRevision).toBeUndefined()
    expect(canonical).toMatchObject({ markdown: 'body', dirty: false, scrollTop: 200 })
    expect(activeSnapshot?.document.portableHistory).toEqual({ version: 1, value: [] })
    expect(activeSnapshot?.view.scrollTop).toBe(200)
    expect(editor.visibleScrollTop).toBe(200)
    expect(listener).toHaveBeenCalledOnce()
    expect(mirrorListener).toHaveBeenCalledOnce()

    unsubscribeMirror()
    mirror.dispose()
    unsubscribe()
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
