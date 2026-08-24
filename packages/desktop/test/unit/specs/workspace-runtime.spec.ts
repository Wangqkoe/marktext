import { describe, expect, it } from 'vitest'
import type { EditorBindingSnapshot, EditorReport, PaneEditorAdapter } from '@shared/workspace'
import { createWorkspaceRuntime } from '@/workspace'

class MemoryEditor implements PaneEditorAdapter {
  readonly snapshots: EditorBindingSnapshot[] = []
  readonly reports: EditorReport[] = []
  flushCount = 0
  failAfterRefresh = false

  async refresh(snapshot: EditorBindingSnapshot): Promise<void> {
    this.snapshots.push(snapshot)
    if (this.failAfterRefresh) {
      this.failAfterRefresh = false
      throw new Error('refresh failed after staging')
    }
  }

  async flush(): Promise<EditorReport> {
    this.flushCount += 1
    return this.reports.shift() ?? {}
  }

  get active(): EditorBindingSnapshot | undefined {
    return this.snapshots.at(-1)
  }
}

describe('WorkspaceRuntime', () => {
  it('isolates both panes and flushes/refreshes every active-view transition', async() => {
    const workspace = createWorkspaceRuntime([
      { documentId: 'one', fileKey: '/one.md', markdown: 'one' },
      { documentId: 'two', fileKey: '/two.md', markdown: 'two' }
    ])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
    const left = new MemoryEditor()
    const right = new MemoryEditor()
    await workspace.bindPaneEditor('left', left)
    await workspace.bindPaneEditor('right', right)
    const [leftView] = workspace.getProjection().panes[0]!.tabs
    const rightView = workspace.getProjection().panes[1]!.tabs[0]!
    const leftLease = (await workspace.bindPaneEditor('left', left)).lease
    left.reports.push({ markdown: 'left edited' })
    expect((await workspace.execute({ kind: 'new-tab', paneId: 'left' })).status).toBe('applied')
    expect(left.flushCount).toBeGreaterThan(0)
    expect(left.active?.document.markdown).toBe('')
    expect(right.active?.document.markdown).toBe('two')
    const rightRefreshes = right.snapshots.length
    expect((await workspace.execute({ kind: 'focus-pane', paneId: 'right' })).status).toBe('applied')
    expect(right.snapshots.length).toBeGreaterThan(rightRefreshes)
    expect((await workspace.execute({ kind: 'activate-view', paneId: 'right', viewId: rightView.viewId })).status).toBe('applied')
    expect((await workspace.execute({ kind: 'move-view', viewId: leftView.viewId, targetPaneId: 'right' })).status).toBe('applied')
    expect(workspace.getProjection().panes).toHaveLength(2)
    expect((await workspace.bindPaneEditor('left', left)).getSnapshot(leftLease)).toBeUndefined()
  })

  it('flushes a dirty active tab before close, requires a single-use capability, and leaves a clean New Tab last', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    expect(binding.report(binding.lease, { markdown: 'unsaved' }).status).toBe('applied')
    const needsDecision = await workspace.execute({ kind: 'close-view', viewId: binding.lease.viewId })
    expect(needsDecision.status).toBe('needs-decision')
    expect(editor.flushCount).toBeGreaterThan(0)
    if (needsDecision.status !== 'needs-decision') throw new Error('expected decision')
    expect((await workspace.execute({ kind: 'commit-authorized', capability: needsDecision.capability })).status).toBe('applied')
    expect((await workspace.execute({ kind: 'commit-authorized', capability: needsDecision.capability })).status).toBe('rejected')
    const pane = workspace.getProjection().panes[0]!
    expect(pane.tabs).toHaveLength(1)
    expect(pane.tabs[0]!.title).toBe('New Tab')
    expect(pane.tabs[0]!.dirty).toBe(false)
  })

  it('moves a View rather than its Document and collapses an empty pane', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await workspace.execute({ kind: 'split-pane', targetPaneId: 'right' })
    const right = workspace.getProjection().panes[1]!.tabs[0]!
    expect((await workspace.execute({ kind: 'move-view', viewId: right.viewId, targetPaneId: 'left' })).status).toBe('applied')
    const projection = workspace.getProjection()
    expect(projection.panes).toHaveLength(1)
    expect(projection.panes[0]!.tabs.map((tab) => tab.fileKey)).toEqual(['/one.md', '/two.md'])
  })

  it('focuses an existing FileKey rather than creating a second Document', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'saved', fileKey: '/same.md' }])
    await workspace.execute({ kind: 'new-tab' })
    expect((await workspace.execute({ kind: 'open-document', document: { fileKey: '/same.md' } })).status).toBe('applied')
    expect(workspace.getProjection().panes[0]!.tabs.filter((tab) => tab.fileKey === '/same.md')).toHaveLength(1)
  })

  it('rejects stale leases and failed staged refresh leaves controller and adapter aligned', async() => {
    const workspace = createWorkspaceRuntime()
    const editor = new MemoryEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const before = editor.active
    editor.failAfterRefresh = true
    expect((await workspace.execute({ kind: 'new-tab' })).status).toBe('failed')
    expect(workspace.getProjection().panes[0]!.tabs).toHaveLength(1)
    expect(editor.active?.viewId).toBe(before?.viewId)
    expect(binding.report(binding.lease, { markdown: 'must not apply' }).status).toBe('rejected')
  })

  it('atomically rejects stale/replayed capability and isolates subscriber exceptions', async() => {
    const workspace = createWorkspaceRuntime()
    const binding = await workspace.bindPaneEditor('left', new MemoryEditor())
    binding.report(binding.lease, { markdown: 'dirty' })
    const decision = await workspace.execute({ kind: 'close-view', viewId: binding.lease.viewId })
    if (decision.status !== 'needs-decision') throw new Error('expected decision')
    binding.report(binding.lease, { markdown: 'changed again' })
    expect((await workspace.execute({ kind: 'commit-authorized', capability: decision.capability })).status).toBe('rejected')
    let observed = 0
    workspace.subscribe(() => { throw new Error('subscriber failure') })
    workspace.subscribe(() => { observed += 1 })
    await workspace.execute({ kind: 'new-tab' })
    expect(observed).toBe(1)
  })

  it('returns an immutable, JSON-only projection', () => {
    const workspace = createWorkspaceRuntime([{ markdown: 'secret markdown', portableHistory: { version: 1, value: ['secret'] } }])
    const projection = workspace.getProjection()
    expect(Object.isFrozen(projection)).toBe(true)
    expect(JSON.stringify(projection)).not.toContain('secret')
    expect(() => { (projection.panes as unknown as unknown[]).push('mutate') }).toThrow()
  })
})
