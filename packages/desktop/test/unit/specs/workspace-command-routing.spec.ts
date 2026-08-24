import { describe, expect, it } from 'vitest'
import { createWorkspaceRuntime } from '@/workspace'
import type { EditorBindingSnapshot, EditorReport, PaneEditorAdapter } from '@shared/workspace'

class MemoryAdapter implements PaneEditorAdapter {
  snapshot: EditorBindingSnapshot | undefined

  async refresh(snapshot: EditorBindingSnapshot): Promise<void> {
    this.snapshot = snapshot
  }

  async flush(): Promise<EditorReport> {
    return {}
  }
}

describe('Workspace command routing', () => {
  it('routes close through a revision-fenced, single-use controller capability', async () => {
    const controller = createWorkspaceRuntime([{ documentId: 'draft', markdown: 'draft' }])
    const viewId = controller.getProjection().panes[0]?.activeViewId
    if (!viewId) throw new Error('missing active view')

    // A clean close is immediate. Dirty close and authorization are covered by
    // the runtime suite; this protects the public command-only route.
    const result = await controller.execute({ kind: 'close-view', viewId })
    expect(result.status).toBe('applied')
    expect(controller.getProjection().panes[0]?.tabs[0]?.title).toBe('New Tab')
  })

  it('does not expose editor-private payloads through focused-pane projection', async () => {
    const controller = createWorkspaceRuntime([{ markdown: 'controller private history' }])
    await controller.execute({ kind: 'focus-pane', paneId: 'left' })
    const serialized = JSON.stringify(controller.getProjection())
    expect(serialized).not.toContain('controller private history')
    expect(serialized).not.toContain('portableHistory')
    expect(serialized).not.toContain('lease')
  })

  it('applies a T04 ACK only for the current document revision, file key and owner fence', async () => {
    const controller = createWorkspaceRuntime([{ fileKey: '/note.md', markdown: 'one' }])
    const adapter = new MemoryAdapter()
    const binding = await controller.bindPaneEditor('left', adapter)
    const lease = binding.getLease()
    if (!lease) throw new Error('missing lease')
    expect(binding.report(lease, { markdown: 'two' }).status).toBe('applied')
    const snapshot = binding.getSnapshot(lease)
    if (!snapshot) throw new Error('missing current snapshot')

    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            documentId: snapshot.documentId,
            documentRevision: snapshot.documentRevision - 1,
            fileKey: '/note.md',
            diskRevision: 'stale',
            ownerFence: snapshot.document.ownerFence
          }
        })
      ).status
    ).toBe('rejected')
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            documentId: snapshot.documentId,
            documentRevision: snapshot.documentRevision,
            fileKey: '/note.md',
            diskRevision: 'landed',
            ownerFence: snapshot.document.ownerFence
          }
        })
      ).status
    ).toBe('applied')
    expect(controller.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)
  })
})
