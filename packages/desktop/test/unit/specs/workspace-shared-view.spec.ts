import { describe, expect, it, vi } from 'vitest'
import type { DocumentIoPort, DocumentIoRequest, EditorBindingSnapshot, EditorReport, PaneEditorAdapter } from '@shared/workspace'
import type { PaneEditorSurface } from '@/workspace'
import { createMoveTabToNewWindowAction, createPaneEditorComposition, createWorkspaceRuntime } from '@/workspace'

class Editor implements PaneEditorAdapter {
  snapshot!: EditorBindingSnapshot
  flushes = 0
  report: EditorReport = {}
  flushBarrier?: Promise<void>
  async refresh(snapshot: EditorBindingSnapshot) { this.snapshot = snapshot }
  async flush(): Promise<EditorReport> {
    this.flushes++
    await this.flushBarrier
    return this.report
  }
}

const split = async(workspace: ReturnType<typeof createWorkspaceRuntime>) => {
  const viewId = workspace.getProjection().panes[0]!.activeViewId
  expect((await workspace.execute({ kind: 'split-right', paneId: 'left', viewId })).status).toBe('applied')
  return { leftId: viewId, rightId: workspace.getProjection().panes[1]!.activeViewId }
}

describe('shared document views', () => {
  it('splits a single captured left view, reuses the right view, and has no split-left operation', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'one', view: { cursor: { line: 2, column: 3 }, scrollTop: 70, mode: 'source' } }])
    const { leftId, rightId } = await split(workspace)
    expect(leftId).not.toBe(rightId)
    const [leftDocument, rightDocument] = workspace.getFacadeSnapshot().documents.map(document => document.documentId)
    expect(rightDocument).toBe(leftDocument)
    expect(workspace.getFacadeSnapshot().documents[1]).toMatchObject({ cursor: { line: 2, column: 3 }, scrollTop: 70, mode: 'source' })
    await workspace.execute({ kind: 'split-right', paneId: 'left', viewId: leftId })
    expect(workspace.getProjection().panes[1]!.tabs).toHaveLength(1)
    expect(workspace.getProjection().focusedPaneId).toBe('right')
    expect((await workspace.execute({ kind: 'split-right', paneId: 'right', viewId: rightId })).status).toBe('rejected')
  })

  it('shares markdown and undo history while fencing stale reports, scroll finalization, and flushes', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'one' }])
    await split(workspace)
    const leftEditor = new Editor()
    const rightEditor = new Editor()
    const left = await workspace.bindPaneEditor('left', leftEditor)
    const right = await workspace.bindPaneEditor('right', rightEditor)
    const staleRight = right.getLease()!
    const flushes = rightEditor.flushes
    expect(left.report(left.getLease()!, { markdown: 'two', portableHistory: { version: 1, value: ['one', 'two'] }, cursor: { line: 1, column: 2 }, scrollTop: 100 }).status).toBe('applied')
    expect(right.finalizeScroll(staleRight, 240).status).toBe('applied')
    expect(right.report(staleRight, { markdown: 'stale' }).status).toBe('rejected')
    await workspace.execute({ kind: 'focus-pane', paneId: 'right' })
    expect(rightEditor.snapshot.document.markdown).toBe('two')
    expect(rightEditor.snapshot.document.portableHistory.value).toEqual(['one', 'two'])
    expect(rightEditor.snapshot.view.scrollTop).toBe(240)
    expect(rightEditor.snapshot.view.cursor).toEqual({ line: 0, column: 0 })
    expect(rightEditor.flushes).toBeLessThanOrEqual(flushes + 1)
    expect(right.report(right.getLease()!, { markdown: 'three', portableHistory: { version: 1, value: ['one', 'two', 'three'] } }).status).toBe('applied')
    await workspace.execute({ kind: 'focus-pane', paneId: 'left' })
    expect(leftEditor.snapshot.document.markdown).toBe('three')
    expect(leftEditor.snapshot.view).toMatchObject({ cursor: { line: 1, column: 2 }, scrollTop: 100 })
    expect(workspace.getFacadeSnapshot().documents.every(document => document.dirty && document.markdown === 'three')).toBe(true)
  })

  it('coalesces moves to an existing shared view without deleting the document', async() => {
    for (const targetPaneId of ['left', 'right'] as const) {
      const workspace = createWorkspaceRuntime([{ markdown: 'unsaved', dirty: true }])
      const { leftId, rightId } = await split(workspace)
      const viewId = targetPaneId === 'left' ? rightId : leftId
      expect((await workspace.execute({ kind: 'move-to-pane', targetPaneId, viewId })).status).toBe('applied')
      expect(workspace.getProjection().panes).toHaveLength(1)
      expect(workspace.getFacadeSnapshot().documents).toHaveLength(1)
      expect(workspace.getFacadeSnapshot().documents[0]).toMatchObject({ markdown: 'unsaved', dirty: true })
    }
  })

  it('rejects shared cross-window moves before transfer or flush, including native outside releases', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'shared draft', dirty: true }])
    const { leftId } = await split(workspace)
    const run = vi.fn()
    const flushSource = vi.fn()
    const action = createMoveTabToNewWindowAction(workspace, { run }, { flushSource })
    expect(await action(leftId, 'left', { x: 1900, y: 900 })).toMatchObject({
      status: 'rejected', reason: 'Close the other split view before moving this document to a new window.'
    })
    expect(run).not.toHaveBeenCalled()
    expect(flushSource).not.toHaveBeenCalled()
    expect(workspace.getProjection().warnings[0]?.message).toContain('Close the other split view')
    expect(workspace.getFacadeSnapshot().documents.every(document => document.markdown === 'shared draft')).toBe(true)
  })

  it('accepts continuing origin edits while a peer-only refresh is queued', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'one' }])
    await split(workspace)
    const left = await workspace.bindPaneEditor('left', new Editor())
    const rightEditor = new Editor()
    await workspace.bindPaneEditor('right', rightEditor)
    expect(left.report(left.getLease()!, { markdown: 'two' }).status).toBe('applied')
    expect(left.report(left.getLease()!, { markdown: 'three' }).status).toBe('applied')
    await workspace.execute({ kind: 'focus-pane', paneId: 'right' })
    expect(rightEditor.snapshot.document.markdown).toBe('three')
  })

  it('captures only the latest peer scroll before replacing its editor generation', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'one' }])
    const { rightId } = await split(workspace)
    const leftEditor = new Editor()
    const rightEditor = new Editor()
    const left = await workspace.bindPaneEditor('left', leftEditor)
    const right = await workspace.bindPaneEditor('right', rightEditor)
    const rightLease = right.getLease()
    const leftLease = left.getLease()
    if (!rightLease || !leftLease) throw new Error('expected both shared View leases')
    let releaseFlush!: () => void
    rightEditor.flushBarrier = new Promise(resolve => { releaseFlush = resolve })
    rightEditor.report = {
      markdown: 'stale peer markdown',
      portableHistory: { version: 1, value: ['stale-peer-history'] },
      cursor: { line: 8, column: 8 },
      selection: {
        anchor: { line: 8, column: 8 },
        head: { line: 8, column: 8 }
      },
      scrollTop: 350
    }

    expect(left.report(leftLease, {
      markdown: 'current markdown',
      portableHistory: { version: 1, value: ['current-history'] }
    }).status).toBe('applied')
    await vi.waitFor(() => expect(rightEditor.flushes).toBe(1))
    expect(right.finalizeScroll(rightLease, 400).status).toBe('applied')
    releaseFlush()
    await vi.waitFor(() => expect(rightEditor.snapshot.document.markdown).toBe('current markdown'))

    const rightView = workspace.getFacadeSnapshot().documents.find(document => document.viewId === rightId)
    expect(rightView).toMatchObject({
      markdown: 'current markdown',
      portableHistory: { version: 1, value: ['current-history'] },
      dirty: true,
      cursor: { line: 0, column: 0 },
      scrollTop: 400
    })
    expect(rightView?.selection).toBeNull()
    expect(rightEditor.snapshot.view).toMatchObject({ cursor: { line: 0, column: 0 }, scrollTop: 400 })
  })

  it('adds a shared view to an existing right pane and updates both identities on Save As', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'shared' }, { markdown: 'other' }])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    const { leftId, rightId } = await split(workspace)
    expect(workspace.getProjection().panes[1]!.tabs).toHaveLength(2)
    const result = await workspace.execute({ kind: 'save-as', paneId: 'left', viewId: leftId, fileKey: '/shared.md', title: 'shared.md' })
    if (result.status !== 'applied' || !result.documentIoRequest) throw new Error('missing save request')
    const request = result.documentIoRequest
    await workspace.execute({ kind: 'apply-save-ack', ack: { status: 'durable-success', requestId: request.requestId, documentId: request.documentId, documentRevision: 0, ownerFence: 'shared-fence' } })
    for (const viewId of [leftId, rightId]) {
      expect(workspace.getFacadeSnapshot().documents.find(document => document.viewId === viewId)).toMatchObject({ fileKey: '/shared.md', title: 'shared.md', dirty: false })
    }
    expect(await workspace.beginTransferPreflight('left', leftId, 'must-not-transfer')).toBeUndefined()
  })

  it('routes new tabs and file opens left, while explicitly activating right remains right', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/one.md' }, { fileKey: '/two.md' }])
    await workspace.execute({ kind: 'move-to-pane', targetPaneId: 'right' })
    expect(workspace.getProjection().focusedPaneId).toBe('right')
    await workspace.execute({ kind: 'open-document', document: { fileKey: '/three.md' } })
    expect(workspace.getProjection().panes[0]!.tabs.map(tab => tab.fileKey)).toEqual(['/one.md', '/three.md'])
    await workspace.execute({ kind: 'focus-pane', paneId: 'right' })
    await workspace.execute({ kind: 'new-tab', paneId: 'right' })
    expect(workspace.getProjection().panes[0]!.tabs).toHaveLength(3)
    const rightId = workspace.getProjection().panes[1]!.activeViewId
    await workspace.execute({ kind: 'activate-view', paneId: 'right', viewId: rightId })
    expect(workspace.getProjection().focusedPaneId).toBe('right')
    await workspace.execute({ kind: 'open-document', document: { fileKey: '/two.md', markdown: 'must not overwrite' } })
    expect(workspace.getProjection().panes).toHaveLength(1)
    expect(workspace.getFacadeSnapshot().documents.find(document => document.fileKey === '/two.md')?.markdown).toBe('')
  })

  it('rejects a captured native reopen after a queued close without creating an empty file-backed document', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/existing.md', markdown: 'keep on disk' }])
    const captured = workspace.getFacadeSnapshot().documents[0]!
    const close = workspace.execute({ kind: 'close-view', viewId: captured.viewId })
    const reopen = workspace.execute({ kind: 'open-existing-document', documentId: captured.documentId, fileKey: '/existing.md' })
    expect((await close).status).toBe('applied')
    expect(await reopen).toMatchObject({ status: 'rejected', reason: 'the requested document was closed or renamed before reopening' })
    expect(workspace.getFacadeSnapshot().documents.some(document => document.fileKey === '/existing.md')).toBe(false)
    const save = await workspace.execute({ kind: 'save' })
    expect(save).not.toHaveProperty('documentIoRequest')
  })

  it('only asks about the last dirty view and keeps an in-flight Save As valid when another view closes', async() => {
    const workspace = createWorkspaceRuntime([{ markdown: 'draft', dirty: true }])
    const { leftId, rightId } = await split(workspace)
    const save = await workspace.execute({ kind: 'save-as', paneId: 'right', viewId: rightId, fileKey: '/saved.md' })
    expect(save.status).toBe('applied')
    if (save.status !== 'applied' || !save.documentIoRequest) throw new Error('missing save request')
    expect((await workspace.execute({ kind: 'close-view', viewId: leftId })).status).toBe('applied')
    expect((await workspace.execute({ kind: 'close-view', viewId: rightId })).status).toBe('needs-decision')
    const request = save.documentIoRequest
    expect((await workspace.execute({ kind: 'apply-save-ack', ack: { status: 'durable-success', documentId: request.documentId, requestId: request.requestId, documentRevision: 0, ownerFence: 'saved-fence' } })).status).toBe('applied')
    expect(workspace.getFacadeSnapshot().documents[0]).toMatchObject({ fileKey: '/saved.md', markdown: 'draft', dirty: false })
  })

  it('owns one DocumentIO fence across both surfaces, close, collapse and save', async() => {
    const requests: DocumentIoRequest[] = []
    const confirmClose = vi.fn(async() => 'cancel' as const)
    const port: DocumentIoPort = {
      subscribe: () => () => {},
      confirmClose,
      request: async(request) => {
        requests.push(request)
        if (request.kind === 'bind' || request.kind === 'sync') return { status: 'bound', documentId: request.documentId, requestId: request.requestId, ownerFence: 'only-fence' }
        if (request.kind === 'unbind') return { status: 'unbound', documentId: request.documentId, requestId: request.requestId, ownerFence: request.ownerFence }
        return { status: 'durable-success', documentId: request.documentId, requestId: request.requestId, documentRevision: request.documentRevision, ownerFence: 'only-fence' }
      }
    }
    const workspace = createWorkspaceRuntime([{ documentId: 'shared', fileKey: '/shared.md', markdown: 'one' }])
    const { rightId } = await split(workspace)
    const surface = (): PaneEditorSurface => ({ stage: async() => ({ commit: () => {}, cancel: () => {} }), flush: async() => ({}) })
    const leftSurface = surface()
    const rightSurface = surface()
    const left = createPaneEditorComposition({ paneId: 'left', controller: workspace, documentIoPort: port })
    const right = createPaneEditorComposition({ paneId: 'right', controller: workspace, documentIoPort: port })
    const seed = { id: 'shared', title: 'shared', markdown: 'one', fileKey: '/shared.md' }
    await left.mount(leftSurface, seed)
    await right.mount(rightSurface, seed)
    await vi.waitFor(() => expect(workspace.getDocumentSnapshots()[0]!.document.ownerFence).toBe('only-fence'))
    expect(requests.filter(request => request.kind === 'bind')).toHaveLength(1)
    await workspace.execute({ kind: 'focus-pane', paneId: 'right' })
    const oldLeftScope = left.getScope()!
    expect(right.getScope()!.report({ markdown: 'edited' }).status).toBe('applied')
    const settledLeftScope = await left.flushScopeForAction(oldLeftScope)
    expect(settledLeftScope?.viewId).toBe(oldLeftScope.viewId)
    expect(settledLeftScope).not.toBe(oldLeftScope)
    await workspace.execute({ kind: 'focus-pane', paneId: 'right' })
    expect((await right.closeLegacyTab('shared')).status).toBe('applied')
    expect(workspace.getFacadeSnapshot().documents.some(document => document.viewId === rightId)).toBe(false)
    expect(confirmClose).not.toHaveBeenCalled()
    right.unmount(rightSurface)
    expect(requests.some(request => request.kind === 'unbind')).toBe(false)
    expect((await left.closeLegacyTab('shared')).status).toBe('rejected')
    expect(confirmClose).toHaveBeenCalledTimes(1)
    expect((await left.save()).status).toBe('applied')
    expect(requests.filter(request => request.kind === 'save')).toHaveLength(1)
    expect(workspace.getFacadeSnapshot().documents[0]).toMatchObject({ markdown: 'edited', dirty: false })
    left.unmount(leftSurface)
  })

  it('keeps current editors writable after representation options change', async() => {
    const workspace = createWorkspaceRuntime([{ fileKey: '/one.md', markdown: 'one' }])
    await split(workspace)
    const left = await workspace.bindPaneEditor('left', new Editor())
    await workspace.bindPaneEditor('right', new Editor())
    for (const command of [
      { kind: 'set-encoding', encoding: { encoding: 'utf8', isBom: true } },
      { kind: 'set-line-ending', lineEnding: 'crlf' },
      { kind: 'set-trailing-newline', trailingNewline: 'ensure-one' }
    ] as const) {
      expect((await workspace.execute({ ...command, paneId: 'left' })).status).toBe('applied')
      expect(left.report(left.getLease()!, { markdown: command.kind }).status).toBe('applied')
      const save = await workspace.execute({ kind: 'save', paneId: 'left' })
      expect(save).toMatchObject({ status: 'applied', documentIoRequest: { markdown: command.kind } })
    }
  })
})
