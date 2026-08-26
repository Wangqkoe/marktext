import { describe, expect, it } from 'vitest'
import type { EditorBindingSnapshot, EditorReport, PaneEditorAdapter } from '@shared/workspace'
import { createMoveTabToNewWindowAction, createWorkspaceRuntime } from '@/workspace'
import type { TransferIntent } from 'main_renderer/tabTransfer'

class FlushEditor implements PaneEditorAdapter {
  readonly reports: EditorReport[] = []
  flushCount = 0

  async refresh(_snapshot: EditorBindingSnapshot): Promise<void> {}

  async flush(): Promise<EditorReport> {
    this.flushCount += 1
    return this.reports.shift() ?? {}
  }
}

const firstTab = (workspace: ReturnType<typeof createWorkspaceRuntime>) =>
  workspace.getProjection().panes[0]!.tabs[0]!

describe('Move action preflight fence', () => {
  it('uses one flush to seal a bootstrap source before prepare', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'untitled', markdown: '', title: 'New Tab' }])
    const editor = new FlushEditor()
    await workspace.bindPaneEditor('left', editor)
    editor.reports.push({ scrollTop: 12 })
    const tab = firstTab(workspace)
    const beforePreflight = editor.flushCount

    const source = await workspace.beginTransferPreflight('left', tab.viewId, 'request-one')
    const afterPreflight = editor.flushCount

    expect(source?.documentRevision).toBe(0)
    expect(await workspace.prepareTransfer(
      'transfer-one', source!.documentId, source!.viewId, source!.documentRevision, source!.preflightId
    )).toBe(0)
    expect(await workspace.prepareTransfer(
      'transfer-one', source!.documentId, source!.viewId, source!.documentRevision, source!.preflightId
    )).toBe(0)
    expect(afterPreflight).toBe(beforePreflight + 1)
    expect(editor.flushCount).toBe(afterPreflight)
  })

  it('rejects a revision-changing report after preflight without changing its sealed revision', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'untitled', markdown: '', title: 'New Tab' }])
    const editor = new FlushEditor()
    const binding = await workspace.bindPaneEditor('left', editor)
    const tab = firstTab(workspace)
    const source = await workspace.beginTransferPreflight('left', tab.viewId, 'request-two')

    expect(binding.report(binding.getLease()!, { markdown: 'late edit' })).toMatchObject({
      status: 'rejected', reason: 'transfer preflight fence is active'
    })
    await expect(workspace.prepareTransfer(
      'transfer-two', source!.documentId, source!.viewId, source!.documentRevision, source!.preflightId
    )).resolves.toBe(source!.documentRevision)
  })

  it('clears an adopted, unconsumed fence after a pre-authorization Move failure', async() => {
    const workspace = createWorkspaceRuntime([{ documentId: 'untitled', markdown: '', title: 'New Tab' }])
    const tab = firstTab(workspace)
    let captured: TransferIntent | undefined
    const flushes: string[] = []
    const action = createMoveTabToNewWindowAction(workspace, {
      run: async(intent) => {
        captured = intent
        await expect(workspace.prepareTransfer(
          'transfer-three', intent.sourceDocumentId, intent.sourceViewId,
          intent.documentRevision, intent.capsule.sourcePreflightId!
        )).resolves.toBe(intent.documentRevision)
        return { status: 'failed', reason: 'transfer aborted before authorization: target creation failed' }
      }
    }, {
      flushSource: async(paneId, tabId) => {
        flushes.push(`${paneId}:${tabId}`)
        return true
      }
    })

    await expect(action(tab.viewId, 'left')).resolves.toMatchObject({ status: 'failed' })
    expect(flushes).toEqual([`left:${tab.viewId}`])
    expect(captured).toBeDefined()
    await expect(workspace.prepareTransfer(
      'transfer-three', captured!.sourceDocumentId, captured!.sourceViewId,
      captured!.documentRevision, captured!.capsule.sourcePreflightId!
    )).resolves.toBeUndefined()
  })
})
