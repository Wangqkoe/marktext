import { describe, expect, it, vi } from 'vitest'
import type {
  DocumentIoObservation,
  DocumentIoPort,
  DocumentIoRequest,
  DocumentSaveAck,
  EditorBindingSnapshot,
  EditorLease,
  EditorReport,
  PaneEditorAdapter,
  PaneEditorBinding,
  PaneId,
  WorkspaceCapability,
  WorkspaceProjection,
  WorkspaceProjectionPane,
  WorkspaceProjectionTab
} from '@shared/workspace'
import {
  createWorkspaceRuntime,
  createPaneEditorComposition,
  PaneEditorLeaseReporter,
  RendererPaneEditorAdapter
} from '@/workspace'
import type { PaneEditorEventScope, PaneEditorSurface } from '@/workspace'

class MemoryEditor implements PaneEditorAdapter {
  readonly snapshots: EditorBindingSnapshot[] = []
  readonly reports: EditorReport[] = []
  readonly refreshFailures: boolean[] = []
  flushCount = 0
  failAfterRefresh = false
  flushBarrier?: Promise<void>

  async refresh(snapshot: EditorBindingSnapshot): Promise<void> {
    this.snapshots.push(snapshot)
    if (this.failAfterRefresh || this.refreshFailures.shift()) {
      this.failAfterRefresh = false
      throw new Error('refresh failed after staging')
    }
  }

  failRefreshTimes(count: number): void {
    for (let index = 0; index < count; index += 1) this.refreshFailures.push(true)
  }

  async flush(): Promise<EditorReport> {
    this.flushCount += 1
    await this.flushBarrier
    const report = this.reports.shift() ?? {}
    const active = this.active
    if (active) {
      this.snapshots[this.snapshots.length - 1] = {
        ...active,
        document: {
          ...active.document,
          ...(report.markdown !== undefined ? { markdown: report.markdown, dirty: true } : {}),
          ...(report.portableHistory !== undefined
            ? { portableHistory: report.portableHistory }
            : {})
        },
        view: {
          ...active.view,
          ...(report.cursor ? { cursor: report.cursor } : {}),
          ...(report.selection !== undefined ? { selection: report.selection } : {}),
          ...(report.scrollTop !== undefined ? { scrollTop: report.scrollTop } : {})
        },
        ...(report.toc !== undefined ? { toc: report.toc } : {}),
        ...(report.status !== undefined ? { status: report.status } : {})
      }
    }
    return report
  }

  get active(): EditorBindingSnapshot | undefined {
    return this.snapshots.at(-1)
  }
}

class MemoryPaneSurface implements PaneEditorSurface {
  readonly snapshots: EditorBindingSnapshot[] = []
  readonly scopes: Array<PaneEditorEventScope | undefined> = []
  readonly reports: EditorReport[] = []

  async stage(snapshot: EditorBindingSnapshot, scope?: PaneEditorEventScope) {
    return {
      commit: () => {
        this.snapshots.push(snapshot)
        this.scopes.push(scope)
      },
      cancel: () => undefined
    }
  }

  async flush(snapshot: EditorBindingSnapshot): Promise<EditorReport> {
    expect(snapshot).toBe(this.snapshots.at(-1))
    return this.reports.shift() ?? {}
  }
}

class RecordingDocumentIoPort implements DocumentIoPort {
  readonly requests: DocumentIoRequest[] = []
  private readonly observationListeners = new Set<(observation: DocumentIoObservation) => void>()
  private nextOwnerFence = 0
  readonly ownerFences = new Map<string, string>()

  async request(request: DocumentIoRequest): Promise<DocumentSaveAck> {
    this.requests.push(request)
    switch (request.kind) {
      case 'bind':
      {
        const ownerFence = `main-owner-fence:${++this.nextOwnerFence}`
        this.ownerFences.set(request.documentId, ownerFence)
        return {
          status: 'bound',
          requestId: request.requestId,
          documentId: request.documentId,
          ownerFence
        }
      }
      case 'save':
      case 'save-as':
      case 'rename':
        return {
          status: 'durable-success',
          requestId: request.requestId,
          documentId: request.documentId,
          documentRevision: request.documentRevision,
          ownerFence: request.ownerFence ?? 'main-owner-fence'
        }
      case 'sync':
        return {
          status: 'bound',
          requestId: request.requestId,
          documentId: request.documentId,
          ownerFence: request.ownerFence
        }
      case 'unbind':
        return {
          status: 'unbound',
          requestId: request.requestId,
          documentId: request.documentId,
          ownerFence: request.ownerFence
        }
    }
  }

  subscribe(listener: (observation: DocumentIoObservation) => void): () => void {
    this.observationListeners.add(listener)
    return () => {
      this.observationListeners.delete(listener)
    }
  }

  observe(observation: DocumentIoObservation): void {
    for (const listener of this.observationListeners) listener(observation)
  }

  async chooseSaveTarget() {
    return { status: 'selected' as const, pathname: '/saved.md' }
  }

  async confirmClose(): Promise<'save' | 'discard' | 'cancel'> {
    return 'save' as const
  }
}

class DeferredPaneSurface implements PaneEditorSurface {
  readonly committed: EditorBindingSnapshot[] = []
  readonly committedScopes: Array<PaneEditorEventScope | undefined> = []
  readonly cancelled: EditorBindingSnapshot[] = []
  private readonly stages: Array<{
    readonly snapshot: EditorBindingSnapshot
    readonly scope: PaneEditorEventScope | undefined
    readonly release: () => void
  }> = []

  async stage(snapshot: EditorBindingSnapshot, scope?: PaneEditorEventScope) {
    const gate = deferred()
    this.stages.push({ snapshot, scope, release: gate.release })
    await gate.promise
    return {
      commit: () => {
        this.committed.push(snapshot)
        this.committedScopes.push(scope)
      },
      cancel: () => this.cancelled.push(snapshot)
    }
  }

  async flush(snapshot: EditorBindingSnapshot): Promise<EditorReport> {
    expect(snapshot).toBe(this.committed.at(-1))
    return {}
  }

  release(index: number): void {
    const stage = this.stages[index]
    if (!stage) throw new Error(`missing staged refresh ${index}`)
    stage.release()
  }
}

class FaultPaneSurface implements PaneEditorSurface {
  current: EditorBindingSnapshot | undefined
  readonly cancelled: EditorBindingSnapshot[] = []
  commitError: Error | undefined
  cancelError: Error | undefined

  async stage(snapshot: EditorBindingSnapshot) {
    const previous = this.current
    return {
      commit: () => {
        if (this.commitError) throw this.commitError
        this.current = snapshot
      },
      cancel: () => {
        this.current = previous
        this.cancelled.push(snapshot)
        if (this.cancelError) throw this.cancelError
      }
    }
  }

  async flush(snapshot: EditorBindingSnapshot): Promise<EditorReport> {
    expect(snapshot).toBe(this.current)
    return {}
  }
}

function deferred(): { readonly promise: Promise<void>; readonly release: () => void } {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function currentLease(binding: PaneEditorBinding): EditorLease {
  const lease = binding.getLease()
  if (!lease) throw new Error('expected a current editor lease')
  return lease
}

function expectDefined<T>(value: T | undefined, message = 'expected a defined value'): T {
  if (value === undefined) throw new Error(message)
  return value
}

function paneAt(projection: WorkspaceProjection, index: number): WorkspaceProjectionPane {
  return expectDefined(projection.panes[index], `expected pane ${index}`)
}

function paneById(projection: WorkspaceProjection, paneId: PaneId): WorkspaceProjectionPane {
  return expectDefined(
    projection.panes.find((pane) => pane.paneId === paneId),
    `expected ${paneId} pane`
  )
}

function tabAt(pane: WorkspaceProjectionPane, index: number): WorkspaceProjectionTab {
  return expectDefined(pane.tabs[index], `expected tab ${index} in ${pane.paneId}`)
}

describe('WorkspaceRuntime', () => {
  it('uses window exit only for a singleton tab close, not multi-tab or batch closes', async() => {
    const testWindow = window as unknown as {
      electron?: { ipcRenderer?: { send?: (...args: unknown[]) => void } }
    }
    const originalElectron = testWindow.electron
    const send = vi.fn()
    testWindow.electron = {
      ...originalElectron,
      ipcRenderer: { ...originalElectron?.ipcRenderer, send }
    }

    try {
      const singleton = createWorkspaceRuntime([{ documentId: 'only', fileKey: '/only.md' }])
      const singletonComposition = createPaneEditorComposition({ paneId: 'left', controller: singleton })
      await singletonComposition.closeTab('only')
      expect(send).toHaveBeenCalledWith('mt::cmd-close-window')

      send.mockClear()
      const multiTab = createWorkspaceRuntime([
        { documentId: 'first', fileKey: '/first.md' },
        { documentId: 'second', fileKey: '/second.md' }
      ])
      const multiTabComposition = createPaneEditorComposition({ paneId: 'left', controller: multiTab })
      await multiTabComposition.closeTab('first')
      expect(send).not.toHaveBeenCalledWith('mt::cmd-close-window')
      expect(paneAt(multiTab.getProjection(), 0).tabs.map((tab) => tab.documentId)).toEqual(['second'])

      for (const [name, match] of [
        ['Close Saved', (_documentId: string, dirty: boolean) => !dirty],
        ['Close All', () => true]
      ] as const) {
        send.mockClear()
        const batch = createWorkspaceRuntime([{ documentId: name, fileKey: `/${name}.md` }])
        const batchComposition = createPaneEditorComposition({ paneId: 'left', controller: batch })
        await batchComposition.closeMatchingTabs(match)
        expect(send, name).not.toHaveBeenCalledWith('mt::cmd-close-window')
        const remaining = paneAt(batch.getProjection(), 0).tabs
        expect(remaining).toHaveLength(1)
        expect(remaining[0]).toMatchObject({ title: 'New Tab', dirty: false })
      }
    } finally {
      testWindow.electron = originalElectron
    }
  })

  it('reports an applied file-backed legacy tab close once but not a cancelled close', async() => {
    const testWindow = window as unknown as {
      electron?: { ipcRenderer?: { send?: (...args: unknown[]) => void } }
    }
    const originalElectron = testWindow.electron
    const send = vi.fn()
    testWindow.electron = {
      ...originalElectron,
      ipcRenderer: { ...originalElectron?.ipcRenderer, send }
    }

    try {
      const cleanWorkspace = createWorkspaceRuntime([
        { documentId: 'saved', fileKey: '/saved.md' },
        { documentId: 'other', fileKey: '/other.md' }
      ])
      const cleanComposition = createPaneEditorComposition({ paneId: 'left', controller: cleanWorkspace })
      expect((await cleanComposition.closeLegacyTab('saved')).status).toBe('applied')
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith('mt::window-tab-closed', '/saved.md')

      send.mockClear()
      const cancelledWorkspace = createWorkspaceRuntime([
        { documentId: 'saved', fileKey: '/cancelled.md', markdown: 'saved' }
      ])
      const port = new RecordingDocumentIoPort()
      port.confirmClose = async() => 'cancel'
      const cancelledComposition = createPaneEditorComposition({
        paneId: 'left',
        controller: cancelledWorkspace,
        documentIoPort: port
      })
      const surface = new MemoryPaneSurface()
      await cancelledComposition.mount(surface, { id: 'saved', fileKey: '/cancelled.md', markdown: 'saved', title: 'saved' })
      expect(expectDefined(surface.scopes.at(-1)).report({ markdown: 'dirty' }).status).toBe('applied')

      expect((await cancelledComposition.closeLegacyTab('saved')).status).toBe('rejected')
      expect(send).not.toHaveBeenCalled()
      cancelledComposition.unmount(surface)
    } finally {
      testWindow.electron = originalElectron
    }
  })

  it('routes the mounted production facade through one T04b port and releases its binding', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'note', fileKey: '/note.md', markdown: 'one', title: 'note.md' }
    ])
    const port = new RecordingDocumentIoPort()
    const composition = createPaneEditorComposition({
      paneId: 'left',
      controller: workspace,
      documentIoPort: port
    })
    const surface = new MemoryPaneSurface()
    await composition.mount(surface, { id: 'note', fileKey: '/note.md', markdown: 'one', title: 'note.md' })
    await vi.waitFor(() => expect(port.requests.some((request) => request.kind === 'bind')).toBe(true))

    expect((await composition.execute({ kind: 'save' })).status).toBe('applied')
    expect(port.requests.some((request) => request.kind === 'save')).toBe(true)
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)

    port.observe({
      documentId: 'note',
      ownerFence: expectDefined(port.ownerFences.get('note')),
      kind: 'conflict'
    })
    await vi.waitFor(() =>
      expect(workspace.getProjection().warnings).toContainEqual(
        expect.objectContaining({ kind: 'conflict', message: 'File changed on disk' })
      )
    )

    await workspace.execute({ kind: 'close-focused-view' })
    await vi.waitFor(() => expect(port.requests.some((request) => request.kind === 'unbind')).toBe(true))
    composition.unmount(surface)
  })

  it('uses accepted canonical surface markdown for clean and durable-save baselines', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'note', fileKey: '/note.md', markdown: 'disk form\n', title: 'note.md' }
    ])
    const editor = new MemoryEditor()
    // Muya may normalize the disk/input representation as it mounts.
    editor.reports.push({ markdown: 'canonical form' })
    const binding = await workspace.bindPaneEditor('left', editor)
    const initial = expectDefined(workspace.getFacadeSnapshot().documents[0])
    expect(initial.markdown).toBe('canonical form')
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)

    const lease = currentLease(binding)
    expect(binding.report(lease, { markdown: 'edited form' }).status).toBe('applied')
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(true)

    // A save must flush the active surface before freezing the DocumentIO request.
    editor.reports.push({ markdown: 'written canonical form' })
    const save = await workspace.execute({ kind: 'save' })
    if (save.status !== 'applied' || save.documentIoRequest?.kind !== 'save') {
      throw new Error('expected save request')
    }
    const saveRequest = save.documentIoRequest
    expect(saveRequest.markdown).toBe('written canonical form')
    expect((await workspace.execute({
      kind: 'apply-save-ack',
      ack: {
        status: 'durable-success',
        requestId: saveRequest.requestId,
        documentId: 'note',
        documentRevision: saveRequest.documentRevision,
        ownerFence: expectDefined(saveRequest.ownerFence)
      }
    })).status).toBe('applied')
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)

    // A stale acknowledgement has no request to authorize and cannot move the
    // durable baseline.
    expect((await workspace.execute({
      kind: 'apply-save-ack',
      ack: {
        status: 'durable-success',
        requestId: 'stale-request',
        documentId: 'note',
        documentRevision: saveRequest.documentRevision,
        ownerFence: expectDefined(saveRequest.ownerFence)
      }
    })).status).toBe('rejected')
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)

    // Undoing exactly to the acknowledged canonical write is clean; a divergent
    // re-edit at the same history depth is still dirty because the Controller
    // compares canonical markdown, never a renderer-side history flag.
    expect(binding.report(lease, { markdown: 'divergent form' }).status).toBe('applied')
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(true)
    expect(binding.report(lease, { markdown: 'written canonical form' }).status).toBe('applied')
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)

    expect(binding.report(lease, { markdown: 'conflicting write' }).status).toBe('applied')
    const conflictSave = await workspace.execute({ kind: 'save' })
    if (conflictSave.status !== 'applied' || conflictSave.documentIoRequest?.kind !== 'save') {
      throw new Error('expected conflict save request')
    }
    const conflictSaveRequest = conflictSave.documentIoRequest
    expect((await workspace.execute({
      kind: 'apply-save-ack',
      ack: {
        status: 'conflict',
        requestId: conflictSaveRequest.requestId,
        documentId: 'note',
        ownerFence: expectDefined(conflictSaveRequest.ownerFence)
      }
    })).status).toBe('failed')
    expect(workspace.getProjection().panes[0]?.tabs[0]?.dirty).toBe(true)
  })

  it('binds independently created pane compositions to one controller', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'left-doc', markdown: 'left', title: 'left' },
      { documentId: 'right-doc', markdown: 'right', title: 'right' }
    ])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const left = createPaneEditorComposition({ paneId: 'left', controller: workspace })
    const right = createPaneEditorComposition({ paneId: 'right', controller: workspace })
    const leftSurface = new MemoryPaneSurface()
    const rightSurface = new MemoryPaneSurface()
    await left.mount(leftSurface, { id: 'left-doc', markdown: 'left', title: 'left' })
    await right.mount(rightSurface, { id: 'right-doc', markdown: 'right', title: 'right' })

    const staleLeft = expectDefined(leftSurface.scopes.at(-1))
    const rightScope = expectDefined(rightSurface.scopes.at(-1))
    expect(rightScope.report({ markdown: 'right edit', scrollTop: 32 }).status).toBe('applied')
    await workspace.execute({ kind: 'new-tab', paneId: 'left' })

    expect(staleLeft.report({ markdown: 'must stay stale', scrollTop: 99 }).status).toBe('rejected')
    const projection = workspace.getProjection()
    expect(paneById(projection, 'right').tabs[0]?.title).toBe('right')
    expect(paneById(projection, 'right').status).toMatchObject({})
  })

  it('hands a file-backed View between mounted compositions with one active DocumentIO fence', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'left-doc', fileKey: '/left.md', markdown: 'left', title: 'left' },
      { documentId: 'right-doc', fileKey: '/right.md', markdown: 'right', title: 'right' }
    ])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const port = new RecordingDocumentIoPort()
    const left = createPaneEditorComposition({ paneId: 'left', controller: workspace, documentIoPort: port })
    const right = createPaneEditorComposition({ paneId: 'right', controller: workspace, documentIoPort: port })
    const leftSurface = new MemoryPaneSurface()
    const rightSurface = new MemoryPaneSurface()
    await left.mount(leftSurface, { id: 'left-doc', fileKey: '/left.md', markdown: 'left', title: 'left' })
    await right.mount(rightSurface, { id: 'right-doc', fileKey: '/right.md', markdown: 'right', title: 'right' })
    await vi.waitFor(() => expect(port.ownerFences.size).toBe(2))
    const oldRightScope = expectDefined(rightSurface.scopes.at(-1))
    const oldRightFence = expectDefined(port.ownerFences.get('right-doc'))
    const rightView = paneById(workspace.getProjection(), 'right').activeViewId

    expect((await workspace.execute({ kind: 'move-view', viewId: rightView, targetPaneId: 'left' })).status).toBe('applied')
    expect(port.requests).not.toContainEqual(expect.objectContaining({
      kind: 'unbind', documentId: 'right-doc', ownerFence: oldRightFence
    }))
    expect(port.ownerFences.get('right-doc')).toBe(oldRightFence)
    const activeFence = expectDefined(port.ownerFences.get('right-doc'))
    expect(workspace.getProjection().panes).toHaveLength(1)
    expect(oldRightScope.report({ markdown: 'stale editor write' }).status).toBe('rejected')

    const savesBefore = port.requests.filter((request) => request.kind === 'save').length
    expect(await right.execute({ kind: 'save' })).not.toMatchObject({ status: 'applied' })
    expect(port.requests.filter((request) => request.kind === 'save')).toHaveLength(savesBefore)
    const warningsBefore = workspace.getProjection().warnings
    port.observe({ documentId: 'right-doc', ownerFence: `${oldRightFence}:retired`, kind: 'conflict' })
    expect(workspace.getProjection().warnings).toEqual(warningsBefore)

    left.unmount(leftSurface)
    right.unmount(rightSurface)
    await vi.waitFor(() => expect(port.requests).toContainEqual(expect.objectContaining({
      kind: 'unbind', documentId: 'right-doc', ownerFence: activeFence
    })))
  })

  it('commits a fresh close capability after an untitled Save As fence rotation', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'note', markdown: 'one', title: 'note' }])
    const port = new RecordingDocumentIoPort()
    const composition = createPaneEditorComposition({ paneId: 'left', controller: workspace, documentIoPort: port })
    const surface = new MemoryPaneSurface()
    await composition.mount(surface, { id: 'note', markdown: 'one', title: 'note' })
    const scope = expectDefined(surface.scopes.at(-1))
    expect(scope.report({ markdown: 'dirty' }).status).toBe('applied')

    expect((await composition.closeLegacyTab('note')).status).toBe('applied')
    expect(port.requests.some((request) => request.kind === 'save-as')).toBe(true)
    expect(workspace.getProjection().panes[0]?.tabs.some((tab) => tab.documentId === 'note')).toBe(false)
    composition.unmount(surface)
  })

  it('finishes an initially source pane bind with a source lease', async() => {
    const composition = createPaneEditorComposition({ paneId: 'left' })
    const surface = new MemoryPaneSurface()
    await composition.mount(surface, {
      id: 'source-doc',
      markdown: 'source body',
      title: 'source',
      mode: 'source'
    })
    expect(composition.getScope()?.mode).toBe('source')
    expect(surface.snapshots.at(-1)?.view.mode).toBe('source')
  })

  it('cancels a deferred composition mount after unmount without reviving its scope', async() => {
    const composition = createPaneEditorComposition({ paneId: 'left' })
    const surface = new DeferredPaneSurface()
    const pendingMount = composition.mount(surface, {
      id: 'deferred-doc',
      markdown: 'deferred',
      title: 'deferred'
    })
    await Promise.resolve()

    composition.unmount(surface)
    surface.release(0)
    await expect(pendingMount).resolves.toBeUndefined()

    expect(composition.isMounted()).toBe(false)
    expect(composition.getScope()).toBeUndefined()
    expect(surface.committed).toEqual([])
    expect(surface.cancelled).toHaveLength(1)
  })

  it('cancels a deferred controller bind after disposal without registering its scope', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'deferred' }])
    const surface = new DeferredPaneSurface()
    const reporter = new PaneEditorLeaseReporter('left')
    const pendingBind = workspace.bindPaneEditor(
      'left',
      new RendererPaneEditorAdapter(surface, reporter)
    )
    await Promise.resolve()

    workspace.dispose()
    surface.release(0)
    await expect(pendingBind).rejects.toThrow('no longer mounted')

    expect(reporter.getActiveScope()).toBeUndefined()
    expect(surface.committed).toEqual([])
    expect(surface.cancelled).toHaveLength(1)
  })

  it('routes the production pane adapter through its current lease only', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'first' }])
    const surface = new MemoryPaneSurface()
    const reporter = new PaneEditorLeaseReporter('left')
    const binding = await workspace.bindPaneEditor(
      'left',
      new RendererPaneEditorAdapter(surface, reporter)
    )
    reporter.attach(binding)
    const firstScope = expectDefined(surface.scopes.at(-1))

    expect(
      firstScope.report({
        markdown: 'first edit',
        cursor: { line: 2, column: 4 },
        scrollTop: 120,
        toc: [{ id: 'first-heading', title: 'First', level: 1 }],
        status: { wordCount: 2, caret: { line: 2, column: 4 } },
        portableHistory: { version: 1, value: ['first history'] }
      }).status
    ).toBe('applied')
    expect((await firstScope.handoffMode('source')).status).toBe('applied')
    expect(firstScope.report({ markdown: 'stale' }).status).toBe('rejected')

    const sourceLease = currentLease(binding)
    expect(sourceLease.mode).toBe('source')
    const sourceScope = expectDefined(surface.scopes.at(-1))
    expect(sourceScope.report({ markdown: 'source edit' }).status).toBe('applied')
    surface.reports.push({ markdown: 'flushed source edit', scrollTop: 240 })
    expect((await sourceScope.flush()).status).toBe('applied')

    expect((await workspace.execute({ kind: 'new-tab', paneId: 'left' })).status).toBe('applied')
    // This is the delayed production-surface generation: every field is sent
    // through the captured source scope after the controller has rebound.
    expect(
      sourceScope.report({
        markdown: 'late source event',
        portableHistory: { version: 1, value: ['late'] },
        cursor: { line: 99, column: 99 },
        selection: {
          anchor: { line: 99, column: 99 },
          head: { line: 99, column: 99 }
        },
        scrollTop: 999,
        toc: [{ id: 'late', title: 'Late', level: 1 }],
        status: { wordCount: 999, caret: { line: 99, column: 99 } }
      }).status
    ).toBe('rejected')
    const active = currentLease(binding)
    expect(binding.getSnapshot(active)?.document.markdown).toBe('')
    expect(surface.snapshots.at(-1)?.viewId).toBe(active.viewId)

    await workspace.execute({ kind: 'activate-view', paneId: 'left', viewId: firstScope.viewId })
    const restored = currentLease(binding)
    expect(binding.getSnapshot(restored)?.document.markdown).toBe('flushed source edit')
    expect(binding.getSnapshot(restored)?.document.portableHistory.value).toEqual(['first history'])
    expect(binding.getSnapshot(restored)?.view).toMatchObject({ scrollTop: 240, mode: 'source' })
    expect(binding.getSnapshot(restored)?.toc).toEqual([
      { id: 'first-heading', title: 'First', level: 1 }
    ])
  })

  it('notifies a source surface only when its controller scope is active', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'first' }])
    const surface = new MemoryPaneSurface()
    const reporter = new PaneEditorLeaseReporter('left')
    const binding = await workspace.bindPaneEditor(
      'left',
      new RendererPaneEditorAdapter(surface, reporter)
    )
    reporter.attach(binding)

    const pendingSourceScope = reporter.scopeForMode('source')
    const abort = new AbortController()
    const cancelledSourceScope = reporter.scopeForMode('source', abort.signal)
    abort.abort()

    expect((await binding.handoffMode(currentLease(binding), 'source')).status).toBe('applied')
    expect(await pendingSourceScope).toBe(surface.scopes.at(-1))
    await expect(cancelledSourceScope).resolves.toBeUndefined()
  })

  it('cancels a late staged A refresh after B commits without replacing B scope or adapter state', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'A' }])
    const surface = new DeferredPaneSurface()
    const reporter = new PaneEditorLeaseReporter('left')
    const adapter = new RendererPaneEditorAdapter(surface, reporter)
    const pendingBind = workspace.bindPaneEditor('left', adapter)
    await Promise.resolve()
    surface.release(0)
    const binding = await pendingBind
    reporter.attach(binding)
    const a = expectDefined(binding.getSnapshot(currentLease(binding)))

    const pendingA = adapter.refresh(a)
    await Promise.resolve()
    expect(binding.report(currentLease(binding), { markdown: 'B' }).status).toBe('applied')
    const b = expectDefined(binding.getSnapshot(currentLease(binding)))
    const pendingB = adapter.refresh(b)
    await Promise.resolve()
    surface.release(2)
    await pendingB
    const bScope = expectDefined(surface.committedScopes.at(-1))
    surface.release(1)
    await pendingA

    expect(surface.committed).toEqual([a, b])
    expect(surface.cancelled).toEqual([a])
    expect(reporter.getActiveScope()).toBe(bScope)
    expect(bScope.report({ scrollTop: 5 }).status).toBe('applied')
    expect((await bScope.flush()).status).toBe('applied')
  })

  it('accepts only the controller-current snapshot object, never an old, copied, or forged generation', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'one' }])
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    const first = expectDefined(binding.getSnapshot(lease))

    expect(binding.isSnapshotCurrent(first)).toBe(true)
    expect(binding.report(lease, { markdown: 'two' }).status).toBe('applied')
    const current = expectDefined(binding.getSnapshot(lease))
    expect(current).not.toBe(first)
    expect(binding.isSnapshotCurrent(first)).toBe(false)
    expect(binding.isSnapshotCurrent(current)).toBe(true)
    expect(binding.isSnapshotCurrent(structuredClone(current))).toBe(false)
    expect(
      binding.isSnapshotCurrent({
        ...current,
        document: { ...current.document, markdown: 'forged' }
      })
    ).toBe(false)

    expect((await binding.handoffMode(lease, 'source')).status).toBe('applied')
    expect(binding.isSnapshotCurrent(current)).toBe(false)
  })

  it('cancels a throwing commit, retains the prior current surface, and allows a later refresh', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'A' }])
    const surface = new FaultPaneSurface()
    const reporter = new PaneEditorLeaseReporter('left')
    const adapter = new RendererPaneEditorAdapter(surface, reporter)
    const binding = await workspace.bindPaneEditor('left', adapter)
    reporter.attach(binding)
    const first = expectDefined(binding.getSnapshot(currentLease(binding)))
    expect(surface.current).toBe(first)
    expect(binding.report(currentLease(binding), { markdown: 'B' }).status).toBe('applied')
    const second = expectDefined(binding.getSnapshot(currentLease(binding)))
    surface.commitError = new Error('commit failed')
    surface.cancelError = new Error('cancel also failed')

    await expect(adapter.refresh(second)).rejects.toThrow('commit failed')
    expect(surface.current).toBe(first)
    expect(surface.cancelled).toEqual([second])
    surface.commitError = undefined
    surface.cancelError = undefined
    await adapter.refresh(second)
    expect(surface.current).toBe(second)
  })

  it('cancels and restores the previous reporter scope when activation throws', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'A' }])
    const surface = new FaultPaneSurface()
    const reporter = new PaneEditorLeaseReporter('left')
    const adapter = new RendererPaneEditorAdapter(surface, reporter)
    const binding = await workspace.bindPaneEditor('left', adapter)
    reporter.attach(binding)
    const firstScope = reporter.getActiveScope()
    const first = expectDefined(binding.getSnapshot(currentLease(binding)))
    expect(binding.report(currentLease(binding), { markdown: 'B' }).status).toBe('applied')
    const second = expectDefined(binding.getSnapshot(currentLease(binding)))
    const activate = reporter.activate.bind(reporter)
    reporter.activate = () => {
      throw new Error('activate failed')
    }

    await expect(adapter.refresh(second)).rejects.toThrow('activate failed')
    expect(surface.current).toBe(first)
    expect(surface.cancelled).toEqual([second])
    expect(reporter.getActiveScope()).toBe(firstScope)
    reporter.activate = activate
    await adapter.refresh(second)
    expect(surface.current).toBe(second)
  })

  it('releases binding, adapter and controller resources idempotently', async() => {
    const workspace = createWorkspaceRuntime()
    const surface = new MemoryPaneSurface()
    const reporter = new PaneEditorLeaseReporter('left')
    const adapter = new RendererPaneEditorAdapter(surface, reporter)
    const binding = await workspace.bindPaneEditor('left', adapter)
    reporter.attach(binding)
    const lease = currentLease(binding)
    const snapshot = expectDefined(binding.getSnapshot(lease))
    expect(reporter.getActiveScope()).toBeDefined()

    binding.dispose()
    binding.dispose()
    expect(binding.getLease()).toBeUndefined()
    expect(binding.getSnapshot(lease)).toBeUndefined()
    expect(binding.isSnapshotCurrent(snapshot)).toBe(false)
    expect(binding.report(lease, { markdown: 'inert' }).status).toBe('rejected')
    expect((await binding.flush(lease)).status).toBe('rejected')
    expect((await binding.handoffMode(lease, 'source')).status).toBe('rejected')
    expect(reporter.getActiveScope()).toBeUndefined()

    workspace.dispose()
    workspace.dispose()
    expect((await workspace.execute({ kind: 'new-tab' })).status).toBe('rejected')
    await expect(workspace.bindPaneEditor('left', new MemoryEditor())).rejects.toThrow('disposed')
  })

  it('isolates both panes and flushes/refreshes every active-view transition', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'one', fileKey: '/one.md', markdown: 'one' },
      { documentId: 'two', fileKey: '/two.md', markdown: 'two' }
    ])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const left = new MemoryEditor()
    const right = new MemoryEditor()
    await workspace.bindPaneEditor('left', left)
    await workspace.bindPaneEditor('right', right)
    const projection = workspace.getProjection()
    const leftView = tabAt(paneAt(projection, 0), 0)
    const rightView = tabAt(paneAt(projection, 1), 0)
    const leftBinding = await workspace.bindPaneEditor('left', left)
    const leftLease = currentLease(leftBinding)
    left.reports.push({ markdown: 'left edited' })
    expect((await workspace.execute({ kind: 'new-tab', paneId: 'left' })).status).toBe('applied')
    expect(left.flushCount).toBeGreaterThan(0)
    expect(left.active?.document.markdown).toBe('')
    expect(right.active?.document.markdown).toBe('two')
    const rightRefreshes = right.snapshots.length
    expect((await workspace.execute({ kind: 'focus-pane', paneId: 'right' })).status).toBe(
      'applied'
    )
    expect(right.snapshots).toHaveLength(rightRefreshes)
    expect(
      (
        await workspace.execute({
          kind: 'activate-view',
          paneId: 'right',
          viewId: rightView.viewId
        })
      ).status
    ).toBe('applied')
    expect(
      (
        await workspace.execute({
          kind: 'move-view',
          viewId: leftView.viewId,
          targetPaneId: 'right'
        })
      ).status
    ).toBe('applied')
    expect(workspace.getProjection().panes).toHaveLength(2)
    expect(leftBinding.getSnapshot(leftLease)).toBeUndefined()
  })

  it('flushes a dirty active tab before close, requires a single-use capability, and leaves a clean New Tab last', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const lease = currentLease(binding)
    expect(binding.report(lease, { markdown: 'unsaved' }).status).toBe('applied')
    const needsDecision = await workspace.execute({ kind: 'close-view', viewId: lease.viewId })
    expect(needsDecision.status).toBe('needs-decision')
    expect(editor.flushCount).toBeGreaterThan(0)
    if (needsDecision.status !== 'needs-decision') throw new Error('expected decision')
    expect(
      (await workspace.execute({ kind: 'commit-authorized', capability: needsDecision.capability }))
        .status
    ).toBe('applied')
    expect(
      (await workspace.execute({ kind: 'commit-authorized', capability: needsDecision.capability }))
        .status
    ).toBe('rejected')
    const pane = paneAt(workspace.getProjection(), 0)
    expect(pane.tabs).toHaveLength(1)
    expect(tabAt(pane, 0).title).toBe('New Tab')
    expect(tabAt(pane, 0).dirty).toBe(false)
  })

  it('moves a View rather than its Document and collapses an empty pane', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const right = tabAt(paneAt(workspace.getProjection(), 1), 0)
    expect(
      (await workspace.execute({ kind: 'move-view', viewId: right.viewId, targetPaneId: 'left' }))
        .status
    ).toBe('applied')
    const projection = workspace.getProjection()
    expect(projection.panes).toHaveLength(1)
    expect(paneAt(projection, 0).tabs.map((tab) => tab.fileKey)).toEqual(['/one.md', '/two.md'])
  })

  it('reorders a View within its pane without changing the active View', async() => {
    const workspace = createWorkspaceRuntime([
      { fileKey: '/one.md' },
      { fileKey: '/two.md' },
      { fileKey: '/three.md' }
    ])
    const before = paneAt(workspace.getProjection(), 0)
    const moved = tabAt(before, 0)
    const active = before.activeViewId
    expect((await workspace.execute({ kind: 'reorder-view', paneId: 'left', viewId: moved.viewId })).status).toBe('applied')
    const after = paneAt(workspace.getProjection(), 0)
    expect(after.tabs.map((tab) => tab.fileKey)).toEqual(['/two.md', '/three.md', '/one.md'])
    expect(after.activeViewId).toBe(active)
  })

  it('updates source active state only when a non-collapse move removes its active View', async() => {
    for (const movingKind of ['active', 'non-active'] as const) {
      const workspace = createWorkspaceRuntime([
        { fileKey: '/one.md' },
        { fileKey: '/two.md' },
        { fileKey: '/three.md' },
        { fileKey: '/four.md' }
      ])
      await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
      const leftEditor = new MemoryEditor()
      const rightEditor = new MemoryEditor()
      const left = await workspace.bindPaneEditor('left', leftEditor)
      const right = await workspace.bindPaneEditor('right', rightEditor)
      const source = paneById(workspace.getProjection(), 'left')
      const moved = movingKind === 'active' ? tabAt(source, 0) : tabAt(source, 1)
      const originalActive = source.activeViewId
      const originalLease = currentLease(left)
      const originalRefreshes = leftEditor.snapshots.length

      expect(
        (
          await workspace.execute({
            kind: 'move-view',
            viewId: moved.viewId,
            targetPaneId: 'right'
          })
        ).status
      ).toBe('applied')
      const leftPane = paneById(workspace.getProjection(), 'left')
      const rightPane = paneById(workspace.getProjection(), 'right')
      expect(leftPane.tabs.map((tab) => tab.fileKey)).toEqual(
        movingKind === 'active' ? ['/two.md', '/three.md'] : ['/one.md', '/three.md']
      )
      const expectedSourceActive =
        movingKind === 'active' ? tabAt(leftPane, 0).viewId : originalActive
      expect(leftPane.activeViewId).toBe(expectedSourceActive)
      expect(leftEditor.active?.viewId).toBe(expectedSourceActive)
      expect(currentLease(left).viewId).toBe(expectedSourceActive)
      expect(rightPane.activeViewId).toBe(moved.viewId)
      expect(rightEditor.active?.viewId).toBe(moved.viewId)
      expect(currentLease(right).viewId).toBe(moved.viewId)
      if (movingKind === 'active') expect(currentLease(left)).not.toBe(originalLease)
      else {
        expect(currentLease(left)).toBe(originalLease)
        expect(leftEditor.snapshots).toHaveLength(originalRefreshes)
      }
    }
  })

  it('restores the source active adapter and lease target when non-collapse target refresh fails', async() => {
    const workspace = createWorkspaceRuntime([
      { fileKey: '/one.md' },
      { fileKey: '/two.md' },
      { fileKey: '/three.md' },
      { fileKey: '/four.md' }
    ])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const leftEditor = new MemoryEditor()
    const rightEditor = new MemoryEditor()
    const left = await workspace.bindPaneEditor('left', leftEditor)
    await workspace.bindPaneEditor('right', rightEditor)
    const before = paneById(workspace.getProjection(), 'left')
    const activeViewId = before.activeViewId
    rightEditor.failAfterRefresh = true
    expect(
      (await workspace.execute({ kind: 'move-view', viewId: activeViewId, targetPaneId: 'right' }))
        .status
    ).toBe('failed')
    const restored = paneById(workspace.getProjection(), 'left')
    expect(restored.activeViewId).toBe(activeViewId)
    expect(restored.tabs.map((tab) => tab.viewId)).toEqual(before.tabs.map((tab) => tab.viewId))
    expect(leftEditor.active?.viewId).toBe(activeViewId)
    expect(currentLease(left).viewId).toBe(activeViewId)
  })

  it.each(['active', 'non-active'] as const)(
    'flushes and preserves target edits before a non-collapse %s move',
    async(movingKind) => {
      const workspace = createWorkspaceRuntime([
        { fileKey: '/one.md' },
        { fileKey: '/two.md' },
        { fileKey: '/three.md' },
        { fileKey: '/four.md' }
      ])
      await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
      const left = await workspace.bindPaneEditor('left', new MemoryEditor())
      const rightEditor = new MemoryEditor()
      const right = await workspace.bindPaneEditor('right', rightEditor)
      const source = paneById(workspace.getProjection(), 'left')
      const previousTargetViewId = currentLease(right).viewId
      const moved = movingKind === 'active' ? tabAt(source, 0) : tabAt(source, 1)
      rightEditor.reports.push({
        markdown: 'target draft',
        portableHistory: { version: 1, value: ['target history'] },
        toc: [{ id: 'target-toc', title: 'Target', level: 1 }],
        status: { wordCount: 9 }
      })
      expect(
        (
          await workspace.execute({
            kind: 'move-view',
            viewId: moved.viewId,
            targetPaneId: 'right'
          })
        ).status
      ).toBe('applied')
      expect(currentLease(right).viewId).toBe(moved.viewId)
      await workspace.execute({
        kind: 'activate-view',
        paneId: 'right',
        viewId: previousTargetViewId
      })
      const preserved = expectDefined(right.getSnapshot(currentLease(right)))
      expect(preserved.document).toMatchObject({ markdown: 'target draft', documentRevision: 1 })
      expect(preserved.document.portableHistory.value).toEqual(['target history'])
      expect(preserved.toc).toEqual([{ id: 'target-toc', title: 'Target', level: 1 }])
      expect(preserved.status).toEqual({ wordCount: 9 })
      expect(currentLease(left).viewId).toBe(
        movingKind === 'active'
          ? paneById(workspace.getProjection(), 'left').activeViewId
          : source.activeViewId
      )
    }
  )

  it('retains flushed target edits in the adapter rollback snapshot when non-collapse move refresh fails', async() => {
    const workspace = createWorkspaceRuntime([
      { fileKey: '/one.md' },
      { fileKey: '/two.md' },
      { fileKey: '/three.md' },
      { fileKey: '/four.md' }
    ])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const left = await workspace.bindPaneEditor('left', new MemoryEditor())
    const rightEditor = new MemoryEditor()
    await workspace.bindPaneEditor('right', rightEditor)
    const moving = paneById(workspace.getProjection(), 'left').activeViewId
    rightEditor.reports.push({
      markdown: 'rollback target draft',
      portableHistory: { version: 1, value: ['rollback'] },
      toc: [{ id: 'rollback-toc', title: 'Rollback', level: 1 }],
      status: { wordCount: 10 }
    })
    rightEditor.failAfterRefresh = true
    expect(
      (await workspace.execute({ kind: 'move-view', viewId: moving, targetPaneId: 'right' })).status
    ).toBe('failed')
    expect(rightEditor.active?.document).toMatchObject({
      markdown: 'rollback target draft',
      documentRevision: 1
    })
    expect(rightEditor.active?.document.portableHistory.value).toEqual(['rollback'])
    expect(rightEditor.active?.toc).toEqual([{ id: 'rollback-toc', title: 'Rollback', level: 1 }])
    expect(rightEditor.active?.status).toEqual({ wordCount: 10 })
    expect(currentLease(left).viewId).toBe(moving)
  })

  it('flushes survivor edits before move/close collapse and target edits before focus refresh', async() => {
    const moveWorkspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await moveWorkspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const moveLeftEditor = new MemoryEditor()
    const moveLeft = await moveWorkspace.bindPaneEditor('left', moveLeftEditor)
    const moveRight = await moveWorkspace.bindPaneEditor('right', new MemoryEditor())
    const survivorViewId = currentLease(moveLeft).viewId
    moveLeftEditor.reports.push({
      markdown: 'survivor move draft',
      portableHistory: { version: 1, value: ['move history'] },
      toc: [{ id: 'move-toc', title: 'Move', level: 1 }]
    })
    expect(
      (
        await moveWorkspace.execute({
          kind: 'move-view',
          viewId: currentLease(moveRight).viewId,
          targetPaneId: 'left'
        })
      ).status
    ).toBe('applied')
    await moveWorkspace.execute({ kind: 'activate-view', paneId: 'left', viewId: survivorViewId })
    expect(moveLeft.getSnapshot(currentLease(moveLeft))?.document.markdown).toBe(
      'survivor move draft'
    )
    expect(moveLeft.getSnapshot(currentLease(moveLeft))?.toc[0]?.id).toBe('move-toc')
    expect(moveLeft.getSnapshot(currentLease(moveLeft))?.document.portableHistory.value).toEqual([
      'move history'
    ])

    const closeWorkspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await closeWorkspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const closeLeftEditor = new MemoryEditor()
    const closeLeft = await closeWorkspace.bindPaneEditor('left', closeLeftEditor)
    const closeRight = await closeWorkspace.bindPaneEditor('right', new MemoryEditor())
    closeLeftEditor.reports.push({
      markdown: 'survivor close draft',
      portableHistory: { version: 1, value: ['close history'] },
      toc: [{ id: 'close-toc', title: 'Close', level: 1 }],
      status: { wordCount: 4 }
    })
    expect(
      (
        await closeWorkspace.execute({
          kind: 'close-view',
          viewId: currentLease(closeRight).viewId
        })
      ).status
    ).toBe('applied')
    expect(closeLeft.getSnapshot(currentLease(closeLeft))?.document.markdown).toBe(
      'survivor close draft'
    )
    expect(closeLeft.getSnapshot(currentLease(closeLeft))?.status).toEqual({ wordCount: 4 })
    expect(closeLeft.getSnapshot(currentLease(closeLeft))?.document.portableHistory.value).toEqual([
      'close history'
    ])
    expect(closeLeftEditor.active?.document.markdown).toBe('survivor close draft')
    expect(closeLeftEditor.active?.document.portableHistory.value).toEqual(['close history'])
    expect(closeLeftEditor.active?.toc).toEqual([{ id: 'close-toc', title: 'Close', level: 1 }])
    expect(closeLeftEditor.active?.status).toEqual({ wordCount: 4 })

    const focusWorkspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await focusWorkspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    await focusWorkspace.bindPaneEditor('left', new MemoryEditor())
    const focusRightEditor = new MemoryEditor()
    const focusRight = await focusWorkspace.bindPaneEditor('right', focusRightEditor)
    await focusWorkspace.execute({ kind: 'focus-pane', paneId: 'left' })
    const focusLease = currentLease(focusRight)
    const focusRefreshes = focusRightEditor.snapshots.length
    focusRightEditor.reports.push({
      markdown: 'focus target draft',
      portableHistory: { version: 1, value: ['focus history'] },
      toc: [{ id: 'focus-toc', title: 'Focus', level: 1 }],
      status: { wordCount: 7 }
    })
    expect((await focusWorkspace.execute({ kind: 'focus-pane', paneId: 'right' })).status).toBe(
      'applied'
    )
    expect(focusRightEditor.snapshots).toHaveLength(focusRefreshes)
    expect(currentLease(focusRight)).toBe(focusLease)
    expect(focusRight.getSnapshot(currentLease(focusRight))?.document.markdown).toBe(
      'focus target draft'
    )
    expect(
      focusRight.getSnapshot(currentLease(focusRight))?.document.portableHistory.value
    ).toEqual(['focus history'])
    expect(focusRightEditor.active?.document.markdown).toBe('focus target draft')
    expect(focusRightEditor.active?.document.portableHistory.value).toEqual(['focus history'])
    expect(focusRightEditor.active?.toc).toEqual([{ id: 'focus-toc', title: 'Focus', level: 1 }])
    expect(focusRightEditor.active?.status).toEqual({ wordCount: 7 })
    expect(focusWorkspace.getProjection().toc[0]?.id).toBe('focus-toc')
    expect(focusWorkspace.getProjection().status).toEqual({ wordCount: 7 })
  })

  it('keeps the surviving binding continuous across collapse in both directions', async() => {
    for (const direction of ['right-to-left', 'left-to-right'] as const) {
      const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
      await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
      const leftEditor = new MemoryEditor()
      const rightEditor = new MemoryEditor()
      const leftBinding = await workspace.bindPaneEditor('left', leftEditor)
      const rightBinding = await workspace.bindPaneEditor('right', rightEditor)
      const sourcePane = direction === 'right-to-left' ? 'right' : 'left'
      const targetPane = direction === 'right-to-left' ? 'left' : 'right'
      const oldLease = currentLease(leftBinding)
      const moved = tabAt(paneById(workspace.getProjection(), sourcePane), 0)
      expect(
        (
          await workspace.execute({
            kind: 'move-view',
            viewId: moved.viewId,
            targetPaneId: targetPane
          })
        ).status
      ).toBe('applied')
      expect(workspace.getProjection().panes).toHaveLength(1)
      expect(leftBinding.report(oldLease, { markdown: 'stale' }).status).toBe('rejected')
      const nextLease = currentLease(leftBinding)
      expect(nextLease.paneId).toBe('left')
      expect(leftBinding.getSnapshot(nextLease)?.paneId).toBe('left')
      expect(leftEditor.active?.paneId).toBe('left')
      expect(rightBinding.getLease()).toBeUndefined()
    }
  })

  it('keeps the left adapter canonical when the left pane collapses into the right', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'left-doc', fileKey: '/left.md', markdown: 'left', title: 'left' },
      { documentId: 'right-doc', fileKey: '/right.md', markdown: 'right', title: 'right' }
    ])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const port = new RecordingDocumentIoPort()
    const left = createPaneEditorComposition({ paneId: 'left', controller: workspace, documentIoPort: port })
    const right = createPaneEditorComposition({ paneId: 'right', controller: workspace, documentIoPort: port })
    const leftSurface = new MemoryPaneSurface()
    const rightSurface = new MemoryPaneSurface()
    await left.mount(leftSurface, { id: 'left-doc', fileKey: '/left.md', markdown: 'left', title: 'left' })
    await right.mount(rightSurface, { id: 'right-doc', fileKey: '/right.md', markdown: 'right', title: 'right' })
    await vi.waitFor(() => expect(port.ownerFences.size).toBe(2))
    const oldRightScope = expectDefined(rightSurface.scopes.at(-1))
    const oldRightFence = expectDefined(port.ownerFences.get('right-doc'))
    const moving = tabAt(paneById(workspace.getProjection(), 'left'), 0)

    expect(
      (await workspace.execute({ kind: 'move-view', viewId: moving.viewId, targetPaneId: 'right' }))
        .status
    ).toBe('applied')
    expect(port.requests).not.toContainEqual(expect.objectContaining({
      kind: 'unbind', documentId: 'right-doc', ownerFence: oldRightFence
    }))
    expect(workspace.getProjection().panes).toHaveLength(1)
    expect(oldRightScope.report({ markdown: 'stale right surface' }).status).toBe('rejected')

    const leftScope = expectDefined(leftSurface.scopes.at(-1))
    expect(leftScope.paneId).toBe('left')
    expect(leftScope.viewId).toBe(moving.viewId)
    expect(leftScope.report({ markdown: 'left surface remains live' }).status).toBe('applied')
    expect((await left.execute({ kind: 'save' })).status).toBe('applied')
    expect(await right.execute({ kind: 'save' })).not.toMatchObject({ status: 'applied' })
    const warningsBefore = workspace.getProjection().warnings
    port.observe({ documentId: 'right-doc', ownerFence: `${oldRightFence}:retired`, kind: 'conflict' })
    expect(workspace.getProjection().warnings).toEqual(warningsBefore)
    expect(workspace.getFacadeSnapshot().documents.find((document) => document.documentId === moving.documentId)?.markdown)
      .toBe('left surface remains live')
    left.unmount(leftSurface)
    right.unmount(rightSurface)
  })

  it('keeps controller and adapter aligned when a collapse refresh fails', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const leftEditor = new MemoryEditor()
    const leftBinding = await workspace.bindPaneEditor('left', leftEditor)
    await workspace.bindPaneEditor('right', new MemoryEditor())
    const revision = workspace.getProjection().workspaceRevision
    const moved = tabAt(paneAt(workspace.getProjection(), 0), 0)
    leftEditor.reports.push({
      markdown: 'collapse rollback draft',
      toc: [{ id: 'rollback', title: 'Rollback', level: 1 }],
      status: { wordCount: 6 }
    })
    leftEditor.failAfterRefresh = true
    expect(
      (await workspace.execute({ kind: 'move-view', viewId: moved.viewId, targetPaneId: 'right' }))
        .status
    ).toBe('failed')
    expect(workspace.getProjection().workspaceRevision).toBeGreaterThan(revision)
    expect(workspace.getProjection().panes).toHaveLength(2)
    expect(leftEditor.active?.paneId).toBe('left')
    expect(leftEditor.active?.document.markdown).toBe('collapse rollback draft')
    expect(leftEditor.active?.toc[0]?.id).toBe('rollback')
    expect(leftBinding.getLease()).toBeUndefined()
  })

  it('keeps the survivor binding usable after closing the last tab in either pane', async() => {
    for (const closingPane of ['left', 'right'] as const) {
      const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
      await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
      const leftBinding = await workspace.bindPaneEditor('left', new MemoryEditor())
      const rightBinding = await workspace.bindPaneEditor('right', new MemoryEditor())
      const oldLease = currentLease(leftBinding)
      const closingView = tabAt(paneById(workspace.getProjection(), closingPane), 0)
      expect(
        (await workspace.execute({ kind: 'close-view', viewId: closingView.viewId })).status
      ).toBe('applied')
      expect(workspace.getProjection().panes).toHaveLength(1)
      expect(leftBinding.report(oldLease, { markdown: 'stale' }).status).toBe('rejected')
      expect(currentLease(leftBinding).paneId).toBe('left')
      expect(rightBinding.getLease()).toBeUndefined()
    }
  })

  it('focuses an existing FileKey rather than creating a second Document', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'saved', fileKey: '/same.md' }])
    await workspace.execute({ kind: 'new-tab' })
    expect(
      (await workspace.execute({ kind: 'open-document', document: { fileKey: '/same.md' } })).status
    ).toBe('applied')
    expect(
      paneAt(workspace.getProjection(), 0).tabs.filter((tab) => tab.fileKey === '/same.md')
    ).toHaveLength(1)
  })

  it('keeps the focused document active when a file-open batch adds an unselected document', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'first', fileKey: '/first.md' }])
    expect(
      (await workspace.execute({
        kind: 'open-document',
        document: { documentId: 'second', fileKey: '/second.md', markdown: 'second' },
        selected: false
      })).status
    ).toBe('applied')
    const pane = paneAt(workspace.getProjection(), 0)
    expect(pane.tabs.map((tab) => tab.documentId)).toEqual(['first', 'second'])
    expect(pane.tabs.find((tab) => tab.viewId === pane.activeViewId)?.documentId).toBe('first')
  })

  it('atomically replaces a pristine blank once for a selected native file-open batch target', async() => {
    const workspace = createWorkspaceRuntime()
    const [second, first] = await Promise.all([
      workspace.execute({
        kind: 'open-document',
        document: { documentId: 'second', fileKey: '/second.md', markdown: 'second' },
        selected: false,
        replacePristineBlank: true
      }),
      workspace.execute({
        kind: 'open-document',
        document: { documentId: 'first', fileKey: '/first.md', markdown: 'first' },
        selected: true,
        replacePristineBlank: true
      })
    ])
    expect(second.status).toBe('applied')
    expect(first.status).toBe('applied')
    const pane = paneAt(workspace.getProjection(), 0)
    expect(pane.tabs.map((tab) => tab.fileKey)).toEqual(['/second.md', '/first.md'])
    expect(pane.tabs.find((tab) => tab.viewId === pane.activeViewId)?.fileKey).toBe('/first.md')
  })

  it('replaces a stale lease through the same binding after a successful controller transition', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const oldLease = currentLease(binding)
    expect((await workspace.execute({ kind: 'new-tab' })).status).toBe('applied')
    expect(binding.report(oldLease, { markdown: 'stale' }).status).toBe('rejected')
    const nextLease = currentLease(binding)
    expect(nextLease).not.toBe(oldLease)
    expect(binding.report(nextLease, { markdown: 'current' }).status).toBe('applied')
    expect((await binding.flush(nextLease)).status).toBe('applied')
  })

  it('revokes a previous generation before rebind and reissues it only after replacement staging fails', async() => {
    const workspace = createWorkspaceRuntime()
    const previousEditor = new MemoryEditor()
    const previousBinding = await workspace.bindPaneEditor('left', previousEditor)
    const previousLease = currentLease(previousBinding)
    previousEditor.reports.push({
      markdown: 'previous draft',
      portableHistory: { version: 1, value: ['previous history'] },
      toc: [{ id: 'previous-toc', title: 'Previous', level: 1 }],
      status: { wordCount: 8 }
    })
    const replacement = new MemoryEditor()
    replacement.failAfterRefresh = true

    await expect(workspace.bindPaneEditor('left', replacement)).rejects.toThrow('refresh failed')

    expect(previousBinding.getSnapshot(previousLease)).toBeUndefined()
    const restoredLease = currentLease(previousBinding)
    const snapshot = expectDefined(previousBinding.getSnapshot(restoredLease))
    expect(snapshot.document).toMatchObject({ markdown: 'previous draft', documentRevision: 1 })
    expect(snapshot.document.portableHistory.value).toEqual(['previous history'])
    expect(snapshot.toc).toEqual([{ id: 'previous-toc', title: 'Previous', level: 1 }])
    expect(snapshot.status).toEqual({ wordCount: 8 })
    expect(expectDefined(previousEditor.active).document.markdown).toBe('previous draft')
    expect(expectDefined(previousEditor.active).document.portableHistory.value).toEqual([
      'previous history'
    ])
    expect(expectDefined(previousEditor.active).toc).toEqual([
      { id: 'previous-toc', title: 'Previous', level: 1 }
    ])
    expect(expectDefined(previousEditor.active).status).toEqual({ wordCount: 8 })
    expect(previousBinding.report(previousLease, { scrollTop: 12 }).status).toBe('rejected')
    expect(previousBinding.report(restoredLease, { scrollTop: 12 }).status).toBe('applied')
    expect((await previousBinding.flush(restoredLease)).status).toBe('applied')
  })

  it('compensates a same-instance staged bind failure with a successor lease', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const lease = currentLease(binding)
    editor.reports.push({
      markdown: 'same adapter draft',
      portableHistory: { version: 1, value: ['same adapter history'] },
      toc: [{ id: 'same-toc', title: 'Same', level: 1 }],
      status: { wordCount: 11 }
    })
    editor.failRefreshTimes(1)

    await expect(workspace.bindPaneEditor('left', editor)).rejects.toThrow('refresh failed')

    expect(binding.getSnapshot(lease)).toBeUndefined()
    const restoredLease = currentLease(binding)
    const snapshot = expectDefined(binding.getSnapshot(restoredLease))
    expect(snapshot.document).toMatchObject({ markdown: 'same adapter draft', documentRevision: 1 })
    expect(snapshot.document.portableHistory.value).toEqual(['same adapter history'])
    expect(snapshot.toc).toEqual([{ id: 'same-toc', title: 'Same', level: 1 }])
    expect(snapshot.status).toEqual({ wordCount: 11 })
    expect(expectDefined(editor.active).document.markdown).toBe('same adapter draft')
    expect(expectDefined(editor.active).document.portableHistory.value).toEqual([
      'same adapter history'
    ])
    expect(expectDefined(editor.active).toc).toEqual([{ id: 'same-toc', title: 'Same', level: 1 }])
    expect(expectDefined(editor.active).status).toEqual({ wordCount: 11 })
    expect(binding.report(lease, { scrollTop: 18 }).status).toBe('rejected')
    expect(binding.report(restoredLease, { scrollTop: 18 }).status).toBe('applied')
    expect((await binding.flush(restoredLease)).status).toBe('applied')
  })

  it('invalidates a same-instance lease when staged bind recovery cannot restore its snapshot', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const lease = currentLease(binding)
    editor.reports.push({ markdown: 'unrecoverable draft' })
    editor.failRefreshTimes(2)

    await expect(workspace.bindPaneEditor('left', editor)).rejects.toThrow('refresh failed')

    expect(binding.getLease()).toBeUndefined()
    expect(binding.report(lease, { markdown: 'must remain stale' }).status).toBe('rejected')
    expect((await binding.flush(lease)).status).toBe('rejected')
  })

  it('serializes a suspended flush before a transition and rejects an interleaved report', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const oldLease = currentLease(binding)
    const barrier = deferred()
    editor.flushBarrier = barrier.promise
    editor.reports.push({ markdown: 'late old view edit' })
    const pendingFlush = binding.flush(oldLease)
    await Promise.resolve()
    const pendingTransition = workspace.execute({ kind: 'new-tab' })
    expect(binding.report(oldLease, { markdown: 'interleaved' }).status).toBe('rejected')
    barrier.release()
    expect((await pendingFlush).status).toBe('applied')
    expect((await pendingTransition).status).toBe('applied')
    expect(binding.report(oldLease, { markdown: 'stale' }).status).toBe('rejected')
    const newLease = currentLease(binding)
    expect(binding.getSnapshot(newLease)?.document.markdown).toBe('')
    await workspace.execute({ kind: 'activate-view', paneId: 'left', viewId: oldLease.viewId })
    expect(binding.getSnapshot(currentLease(binding))?.document.markdown).toBe('late old view edit')
  })

  it('serializes a suspended mode handoff and never resurrects its old lease', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const oldLease = currentLease(binding)
    const barrier = deferred()
    editor.flushBarrier = barrier.promise
    const pendingHandoff = binding.handoffMode(oldLease, 'source')
    await Promise.resolve()
    const pendingTransition = workspace.execute({ kind: 'new-tab' })
    expect(binding.report(oldLease, { markdown: 'interleaved' }).status).toBe('rejected')
    barrier.release()
    expect((await pendingHandoff).status).toBe('applied')
    expect((await pendingTransition).status).toBe('applied')
    expect(binding.report(oldLease, { markdown: 'stale' }).status).toBe('rejected')
    expect(currentLease(binding).mode).toBe('wysiwyg')
  })

  it('keeps unaffected pane bindings isolated while global projection revisions remain monotonic', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/left.md' }, { fileKey: '/right.md' }])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const leftEditor = new MemoryEditor()
    const rightEditor = new MemoryEditor()
    const left = await workspace.bindPaneEditor('left', leftEditor)
    const right = await workspace.bindPaneEditor('right', rightEditor)
    const leftLease = currentLease(left)
    const rightLease = currentLease(right)
    const rightRefreshes = rightEditor.snapshots.length
    const rightDocument = rightEditor.active?.document
    const before = workspace.getProjection().workspaceRevision

    const reported = left.report(leftLease, {
      markdown: 'left-only',
      portableHistory: { version: 1, value: ['left'] }
    })
    expect(reported.status).toBe('applied')
    expect(rightEditor.snapshots).toHaveLength(rightRefreshes)
    expect(currentLease(right)).toBe(rightLease)

    const opened = await workspace.execute({ kind: 'new-tab', paneId: 'left' })
    expect(opened.status).toBe('applied')
    if (opened.status !== 'applied') throw new Error('expected applied')
    expect(opened.workspaceRevision).toBeGreaterThan(before)
    expect(workspace.getProjection().workspaceRevision).toBe(opened.workspaceRevision)
    expect(left.report(leftLease, { markdown: 'stale' }).status).toBe('rejected')
    const currentLeft = currentLease(left)
    expect(left.getSnapshot(currentLeft)?.document).toMatchObject({
      markdown: '',
      documentRevision: 0
    })
    expect(rightEditor.snapshots).toHaveLength(rightRefreshes)
    expect(rightEditor.active?.document).toEqual(rightDocument)
    expect(right.report(rightLease, { markdown: 'right-only' }).status).toBe('applied')

    const leftRefreshes = leftEditor.snapshots.length
    const focusedRightRefreshes = rightEditor.snapshots.length
    const focused = await workspace.execute({ kind: 'focus-pane', paneId: 'right' })
    expect(focused.status).toBe('applied')
    expect(leftEditor.snapshots).toHaveLength(leftRefreshes)
    expect(rightEditor.snapshots).toHaveLength(focusedRightRefreshes)
    expect(currentLease(right)).toBe(rightLease)
    expect(leftEditor.snapshots.at(-1)?.document.markdown).toBe('')
    expect(left.report(currentLeft, { markdown: 'left remains active' }).status).toBe('applied')
    expect(right.report(rightLease, { markdown: 'focus keeps lease active' }).status).toBe(
      'applied'
    )
  })

  it('rotates leases on mode handoff and rolls back a staged mode refresh failure', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const first = currentLease(binding)
    expect((await binding.handoffMode(first, 'source')).status).toBe('applied')
    expect(binding.report(first, { markdown: 'stale mode' }).status).toBe('rejected')
    const sourceLease = currentLease(binding)
    expect(sourceLease.mode).toBe('source')
    editor.failAfterRefresh = true
    expect((await binding.handoffMode(sourceLease, 'wysiwyg')).status).toBe('failed')
    expect(editor.active?.view.mode).toBe('source')
    expect(binding.getLease()).toBeUndefined()
  })

  it('rejects stale leases and failed staged refresh preserves a flushed edit without exposing a replacement lease', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const lease = currentLease(binding)
    const before = editor.active
    const beforeRevision = workspace.getProjection().workspaceRevision
    editor.reports.push({ markdown: 'captured before failed transition' })
    editor.failAfterRefresh = true
    expect((await workspace.execute({ kind: 'new-tab' })).status).toBe('failed')
    expect(paneAt(workspace.getProjection(), 0).tabs).toHaveLength(1)
    expect(editor.active?.viewId).toBe(before?.viewId)
    expect(editor.active?.document.markdown).toBe('captured before failed transition')
    expect(workspace.getProjection().workspaceRevision).toBeGreaterThan(beforeRevision)
    expect(binding.getLease()).toBeUndefined()
    expect(binding.report(lease, { markdown: 'must not apply' }).status).toBe('rejected')
  })

  it('atomically rejects forged, kind-mismatched, stale, and replayed capabilities', async() => {
    const workspace = createWorkspaceRuntime()
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    binding.report(lease, { markdown: 'dirty' })
    const decision = await workspace.execute({ kind: 'close-view', viewId: lease.viewId })
    if (decision.status !== 'needs-decision') throw new Error('expected decision')
    const forged = { ...decision.capability } as WorkspaceCapability
    expect(
      (await workspace.execute({ kind: 'commit-authorized', capability: forged })).status
    ).toBe('rejected')
    expect(
      (
        await workspace.execute({
          kind: 'commit-authorized',
          capability: { action: 'wrong-kind' } as unknown as WorkspaceCapability
        })
      ).status
    ).toBe('rejected')
    binding.report(lease, { markdown: 'changed again' })
    expect(
      (await workspace.execute({ kind: 'commit-authorized', capability: decision.capability }))
        .status
    ).toBe('rejected')
  })

  it('accepts a genuine capability once, rejects replay, and isolates subscriber exceptions', async() => {
    const workspace = createWorkspaceRuntime()
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    const lease = currentLease(binding)
    binding.report(lease, { markdown: 'dirty' })
    const decision = await workspace.execute({ kind: 'close-view', viewId: lease.viewId })
    if (decision.status !== 'needs-decision') throw new Error('expected decision')
    expect(
      (await workspace.execute({ kind: 'commit-authorized', capability: decision.capability }))
        .status
    ).toBe('applied')
    expect(
      (await workspace.execute({ kind: 'commit-authorized', capability: decision.capability }))
        .status
    ).toBe('rejected')
    let observed = 0
    workspace.subscribe(() => {
      throw new Error('subscriber failure')
    })
    workspace.subscribe(() => {
      observed += 1
    })
    await workspace.execute({ kind: 'new-tab' })
    expect(observed).toBe(1)
  })

  it('returns an immutable, JSON-only projection', () => {
    const workspace = createWorkspaceRuntime([
      { markdown: 'secret markdown', portableHistory: { version: 1, value: ['secret'] } }
    ])
    const projection = workspace.getProjection()
    expect(Object.isFrozen(projection)).toBe(true)
    expect(JSON.stringify(projection)).not.toContain('secret')
    expect(() => {
      ;(projection.panes as unknown as unknown[]).push('mutate')
    }).toThrow()
  })

  it('routes JSON-only TOC/status through the focused pane and exposes assembly warnings immutably', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/left.md' }, { fileKey: '/right.md' }])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const left = await workspace.bindPaneEditor('left', new MemoryEditor())
    const right = await workspace.bindPaneEditor('right', new MemoryEditor())
    left.report(currentLease(left), {
      toc: [{ id: 'left-heading', title: 'Left', level: 1 }],
      status: { wordCount: 2, caret: { line: 1, column: 2 } }
    })
    await workspace.execute({ kind: 'focus-pane', paneId: 'right' })
    right.report(currentLease(right), {
      toc: [{ id: 'right-heading', title: 'Right', level: 2 }],
      status: { wordCount: 5 }
    })
    const revisionBeforeWarnings = workspace.getProjection().workspaceRevision
    let warningNotifications = 0
    workspace.subscribe(() => {
      warningNotifications += 1
    })
    const warningResult = await workspace.execute({
      kind: 'replace-warnings',
      warnings: [{ id: 'conflict-1', kind: 'conflict', message: 'disk changed' }]
    })
    expect(warningResult.status).toBe('applied')
    if (warningResult.status !== 'applied') throw new Error('expected warning update to apply')
    expect(warningResult.workspaceRevision).toBeGreaterThan(revisionBeforeWarnings)
    expect(warningNotifications).toBe(1)
    const rightProjection = workspace.getProjection()
    expect(rightProjection.toc).toEqual([{ id: 'right-heading', title: 'Right', level: 2 }])
    expect(rightProjection.status).toEqual({ wordCount: 5 })
    expect(expectDefined(paneById(rightProjection, 'left').toc[0]).id).toBe('left-heading')
    expect(rightProjection.warnings).toEqual([
      { id: 'conflict-1', kind: 'conflict', message: 'disk changed' }
    ])
    expect(Object.isFrozen(rightProjection.warnings)).toBe(true)
    expect(JSON.parse(JSON.stringify(rightProjection)).warnings[0].id).toBe('conflict-1')
    await workspace.execute({ kind: 'focus-pane', paneId: 'left' })
    expect(expectDefined(workspace.getProjection().toc[0]).id).toBe('left-heading')
  })

  it('preserves DocumentIO\'s observed missing-file baseline in the controller and editor snapshot', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'missing', fileKey: '/missing.md', markdown: 'draft', dirty: true }])
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const current = expectDefined(editor.active)
    await expect(workspace.execute({
      kind: 'apply-document-io-bind',
      documentId: 'missing',
      documentRevision: current.documentRevision,
      previousOwnerFence: current.document.ownerFence,
      ownerFence: 'main-owner:missing',
      observedDiskRevision: null
    })).resolves.toMatchObject({ status: 'applied' })
    await binding.refresh(current.lease)
    expect(workspace.getFacadeSnapshot().documents[0]?.observedDiskRevision).toBeNull()
    expect(editor.active?.document.observedDiskRevision).toBeNull()
    binding.dispose()
  })
})
