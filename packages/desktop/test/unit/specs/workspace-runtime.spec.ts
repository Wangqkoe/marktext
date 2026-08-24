import { describe, expect, it } from 'vitest'
import type {
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

  async refresh(snapshot: EditorBindingSnapshot, scope?: PaneEditorEventScope): Promise<void> {
    this.snapshots.push(snapshot)
    this.scopes.push(scope)
  }

  async flush(snapshot: EditorBindingSnapshot): Promise<EditorReport> {
    expect(snapshot).toBe(this.snapshots.at(-1))
    return this.reports.shift() ?? {}
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
  it('binds independently created pane compositions to one controller', async () => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'left-doc', markdown: 'left', title: 'left' },
      { documentId: 'right-doc', markdown: 'right', title: 'right' }
    ])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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

  it('finishes an initially source pane bind with a source lease', async () => {
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

  it('routes the production pane adapter through its current lease only', async () => {
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

  it('isolates both panes and flushes/refreshes every active-view transition', async () => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'one', fileKey: '/one.md', markdown: 'one' },
      { documentId: 'two', fileKey: '/two.md', markdown: 'two' }
    ])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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

  it('flushes a dirty active tab before close, requires a single-use capability, and leaves a clean New Tab last', async () => {
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

  it('moves a View rather than its Document and collapses an empty pane', async () => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
    const right = tabAt(paneAt(workspace.getProjection(), 1), 0)
    expect(
      (await workspace.execute({ kind: 'move-view', viewId: right.viewId, targetPaneId: 'left' }))
        .status
    ).toBe('applied')
    const projection = workspace.getProjection()
    expect(projection.panes).toHaveLength(1)
    expect(paneAt(projection, 0).tabs.map((tab) => tab.fileKey)).toEqual(['/one.md', '/two.md'])
  })

  it('updates source active state only when a non-collapse move removes its active View', async () => {
    for (const movingKind of ['active', 'non-active'] as const) {
      const workspace = createWorkspaceRuntime([
        { fileKey: '/one.md' },
        { fileKey: '/two.md' },
        { fileKey: '/three.md' },
        { fileKey: '/four.md' }
      ])
      await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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

  it('restores the source active adapter and lease target when non-collapse target refresh fails', async () => {
    const workspace = createWorkspaceRuntime([
      { fileKey: '/one.md' },
      { fileKey: '/two.md' },
      { fileKey: '/three.md' },
      { fileKey: '/four.md' }
    ])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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
    async (movingKind) => {
      const workspace = createWorkspaceRuntime([
        { fileKey: '/one.md' },
        { fileKey: '/two.md' },
        { fileKey: '/three.md' },
        { fileKey: '/four.md' }
      ])
      await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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

  it('retains flushed target edits in the adapter rollback snapshot when non-collapse move refresh fails', async () => {
    const workspace = createWorkspaceRuntime([
      { fileKey: '/one.md' },
      { fileKey: '/two.md' },
      { fileKey: '/three.md' },
      { fileKey: '/four.md' }
    ])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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

  it('flushes survivor edits before move/close collapse and target edits before focus refresh', async () => {
    const moveWorkspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await moveWorkspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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
    await closeWorkspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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
    await focusWorkspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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

  it('keeps the surviving binding continuous across collapse in both directions', async () => {
    for (const direction of ['right-to-left', 'left-to-right'] as const) {
      const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
      await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
      const leftEditor = new MemoryEditor()
      const rightEditor = new MemoryEditor()
      const leftBinding = await workspace.bindPaneEditor('left', leftEditor)
      const rightBinding = await workspace.bindPaneEditor('right', rightEditor)
      const sourcePane = direction === 'right-to-left' ? 'right' : 'left'
      const targetPane = direction === 'right-to-left' ? 'left' : 'right'
      const survivorBinding = direction === 'right-to-left' ? leftBinding : rightBinding
      const oldLease = currentLease(survivorBinding)
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
      expect(survivorBinding.report(oldLease, { markdown: 'stale' }).status).toBe('rejected')
      const nextLease = currentLease(survivorBinding)
      expect(nextLease.paneId).toBe('left')
      expect(survivorBinding.getSnapshot(nextLease)?.paneId).toBe('left')
      expect((direction === 'right-to-left' ? leftEditor : rightEditor).active?.paneId).toBe('left')
    }
  })

  it('keeps controller and adapter aligned when a collapse refresh fails', async () => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
    await workspace.bindPaneEditor('left', new MemoryEditor())
    const rightEditor = new MemoryEditor()
    const rightBinding = await workspace.bindPaneEditor('right', rightEditor)
    const revision = workspace.getProjection().workspaceRevision
    const moved = tabAt(paneAt(workspace.getProjection(), 0), 0)
    rightEditor.reports.push({
      markdown: 'collapse rollback draft',
      toc: [{ id: 'rollback', title: 'Rollback', level: 1 }],
      status: { wordCount: 6 }
    })
    rightEditor.failAfterRefresh = true
    expect(
      (await workspace.execute({ kind: 'move-view', viewId: moved.viewId, targetPaneId: 'right' }))
        .status
    ).toBe('failed')
    expect(workspace.getProjection().workspaceRevision).toBeGreaterThan(revision)
    expect(workspace.getProjection().panes).toHaveLength(2)
    expect(rightEditor.active?.paneId).toBe('right')
    expect(rightEditor.active?.document.markdown).toBe('collapse rollback draft')
    expect(rightEditor.active?.toc[0]?.id).toBe('rollback')
    expect(rightBinding.getLease()).toBeUndefined()
  })

  it('keeps the survivor binding usable after closing the last tab in either pane', async () => {
    for (const closingPane of ['left', 'right'] as const) {
      const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
      await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
      const leftBinding = await workspace.bindPaneEditor('left', new MemoryEditor())
      const rightBinding = await workspace.bindPaneEditor('right', new MemoryEditor())
      const survivorBinding = closingPane === 'left' ? rightBinding : leftBinding
      const oldLease = currentLease(survivorBinding)
      const closingView = tabAt(paneById(workspace.getProjection(), closingPane), 0)
      expect(
        (await workspace.execute({ kind: 'close-view', viewId: closingView.viewId })).status
      ).toBe('applied')
      expect(workspace.getProjection().panes).toHaveLength(1)
      expect(survivorBinding.report(oldLease, { markdown: 'stale' }).status).toBe('rejected')
      expect(currentLease(survivorBinding).paneId).toBe('left')
    }
  })

  it('focuses an existing FileKey rather than creating a second Document', async () => {
    const workspace = createWorkspaceRuntime([{ documentId: 'saved', fileKey: '/same.md' }])
    await workspace.execute({ kind: 'new-tab' })
    expect(
      (await workspace.execute({ kind: 'open-document', document: { fileKey: '/same.md' } })).status
    ).toBe('applied')
    expect(
      paneAt(workspace.getProjection(), 0).tabs.filter((tab) => tab.fileKey === '/same.md')
    ).toHaveLength(1)
  })

  it('replaces a stale lease through the same binding after a successful controller transition', async () => {
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

  it('keeps a distinct previous binding usable when its replacement adapter fails staging', async () => {
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

    const snapshot = expectDefined(previousBinding.getSnapshot(previousLease))
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
    expect(previousBinding.report(previousLease, { scrollTop: 12 }).status).toBe('applied')
    expect((await previousBinding.flush(previousLease)).status).toBe('applied')
  })

  it('compensates a same-instance staged bind failure and preserves its existing lease', async () => {
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

    const snapshot = expectDefined(binding.getSnapshot(lease))
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
    expect(binding.report(lease, { scrollTop: 18 }).status).toBe('applied')
    expect((await binding.flush(lease)).status).toBe('applied')
  })

  it('invalidates a same-instance lease when staged bind recovery cannot restore its snapshot', async () => {
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

  it('serializes a suspended flush before a transition and rejects an interleaved report', async () => {
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

  it('serializes a suspended mode handoff and never resurrects its old lease', async () => {
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

  it('keeps unaffected pane bindings isolated while global projection revisions remain monotonic', async () => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/left.md' }, { fileKey: '/right.md' }])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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

  it('rotates leases on mode handoff and rolls back a staged mode refresh failure', async () => {
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

  it('rejects stale leases and failed staged refresh preserves a flushed edit without exposing a replacement lease', async () => {
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

  it('atomically rejects forged, kind-mismatched, stale, and replayed capabilities', async () => {
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

  it('accepts a genuine capability once, rejects replay, and isolates subscriber exceptions', async () => {
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

  it('routes JSON-only TOC/status through the focused pane and exposes assembly warnings immutably', async () => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/left.md' }, { fileKey: '/right.md' }])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
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
})
