import { describe, expect, it } from 'vitest'
import { createWorkspaceRuntime } from '@/workspace'
import type { DocumentIoSaveRequest, DocumentSaveAck } from '@shared/workspace/documentIo'
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

const durable = (request: DocumentIoSaveRequest): Extract<DocumentSaveAck, { status: 'durable-success' }> => ({
  status: 'durable-success',
  requestId: request.requestId,
  documentId: request.documentId,
  documentRevision: request.documentRevision,
  ownerFence: request.ownerFence ?? 'unbound-save-as-fence'
})

describe('Workspace command routing', () => {
  it('saves and closes a specified non-active dirty view without changing the active document', async() => {
    const controller = createWorkspaceRuntime([
      { documentId: 'active', fileKey: '/active.md', markdown: 'active' },
      { documentId: 'target', fileKey: '/target.md', markdown: 'target' }
    ])
    const binding = await controller.bindPaneEditor('left', new MemoryAdapter())
    const targetViewId = controller.getProjection().panes[0]!.tabs.find(
      (tab) => tab.documentId === 'target'
    )!.viewId
    const activeViewId = controller.getProjection().panes[0]!.tabs.find(
      (tab) => tab.documentId === 'active'
    )!.viewId

    expect((await controller.execute({ kind: 'activate-view', paneId: 'left', viewId: targetViewId })).status).toBe('applied')
    const targetLease = binding.getLease()
    if (!targetLease) throw new Error('missing target lease')
    expect(binding.report(targetLease, { markdown: 'target dirty' }).status).toBe('applied')
    expect((await controller.execute({ kind: 'activate-view', paneId: 'left', viewId: activeViewId })).status).toBe('applied')

    const close = await controller.execute({ kind: 'close-view', viewId: targetViewId })
    if (close.status !== 'needs-decision') throw new Error('expected close decision')
    const save = await controller.execute({ kind: 'save', paneId: 'left', viewId: targetViewId })
    if (save.status !== 'applied' || save.documentIoRequest?.kind !== 'save') {
      throw new Error('missing target save request')
    }
    expect(save.documentIoRequest).toMatchObject({ documentId: 'target', markdown: 'target dirty' })
    expect(controller.getProjection().panes[0]?.activeViewId).toBe(activeViewId)

    expect((await controller.execute({ kind: 'apply-save-ack', ack: durable(save.documentIoRequest) })).status).toBe('applied')
    expect((await controller.execute({ kind: 'commit-authorized', capability: close.capability })).status).toBe('applied')
    expect(controller.getProjection().panes[0]?.tabs.map((tab) => tab.documentId)).toEqual(['active'])
    expect(controller.getProjection().panes[0]?.activeViewId).toBe(activeViewId)
  })

  it('sends save through the opaque T04b request and accepts only its current durable ACK', async() => {
    const controller = createWorkspaceRuntime([{ fileKey: '/note.md', markdown: 'one' }])
    const binding = await controller.bindPaneEditor('left', new MemoryAdapter())
    const lease = binding.getLease()
    if (!lease) throw new Error('missing lease')
    expect(binding.report(lease, { markdown: 'two' }).status).toBe('applied')

    const save = await controller.execute({ kind: 'save' })
    if (save.status !== 'applied' || !save.documentIoRequest || save.documentIoRequest.kind !== 'save') {
      throw new Error('missing T04b save request')
    }
    const request = save.documentIoRequest
    expect(request.markdown).toBe('two')
    expect(request.options).toMatchObject({
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf'
    })
    expect(JSON.stringify(request)).not.toContain('observedDiskRevision')
    expect(JSON.stringify(request)).not.toContain('landedDiskRevision')

    expect(
      (await controller.execute({
        kind: 'apply-save-ack',
        ack: { ...durable(request), documentRevision: request.documentRevision - 1 }
      })).status
    ).toBe('rejected')
    expect((await controller.execute({ kind: 'apply-save-ack', ack: durable(request) })).status).toBe(
      'applied'
    )
    expect((await controller.execute({ kind: 'apply-save-ack', ack: durable(request) })).status).toBe(
      'rejected'
    )
    expect(controller.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)

    expect(binding.report(lease, { markdown: 'three' }).status).toBe('applied')
    const failedSave = await controller.execute({ kind: 'save' })
    if (
      failedSave.status !== 'applied' ||
      !failedSave.documentIoRequest ||
      failedSave.documentIoRequest.kind !== 'save'
    ) {
      throw new Error('missing second T04b save request')
    }
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            status: 'not-durable',
            requestId: failedSave.documentIoRequest.requestId,
            documentId: failedSave.documentIoRequest.documentId,
            ownerFence: failedSave.documentIoRequest.ownerFence
          }
        })
      ).status
    ).toBe('failed')
    expect(controller.getProjection().panes[0]?.tabs[0]?.dirty).toBe(true)
  })

  it('routes options and rename through controller commands without mutating projection data', async() => {
    const controller = createWorkspaceRuntime([{ fileKey: '/note.md', markdown: 'one' }])
    expect(
      (await controller.execute({ kind: 'set-encoding', encoding: { encoding: 'gbk', isBom: false } }))
        .status
    ).toBe('applied')
    expect((await controller.execute({ kind: 'set-line-ending', lineEnding: 'crlf' })).status).toBe(
      'applied'
    )
    expect(
      (await controller.execute({ kind: 'set-trailing-newline', trailingNewline: 'ensure-one' }))
        .status
    ).toBe('applied')

    const rename = await controller.execute({
      kind: 'rename',
      fileKey: '/renamed.md',
      title: 'renamed.md'
    })
    if (
      rename.status !== 'applied' ||
      !rename.documentIoRequest ||
      rename.documentIoRequest.kind !== 'rename'
    ) {
      throw new Error('missing T04b rename request')
    }
    expect(rename.documentIoRequest).toMatchObject({
      targetPathname: '/renamed.md',
      options: { encoding: { encoding: 'gbk', isBom: false }, lineEnding: 'crlf' }
    })
    expect(
      (await controller.execute({ kind: 'apply-save-ack', ack: durable(rename.documentIoRequest) }))
        .status
    ).toBe('applied')
    expect(controller.getProjection().panes[0]?.tabs[0]).toMatchObject({
      fileKey: '/renamed.md',
      title: 'renamed.md',
      dirty: false
    })
  })
})
