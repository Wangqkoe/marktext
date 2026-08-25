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
  it('routes focused close through a revision-fenced, single-use controller capability', async() => {
    const controller = createWorkspaceRuntime([{ documentId: 'draft', markdown: 'draft' }])

    // A clean close is immediate. Dirty close and authorization are covered by
    // the runtime suite; this protects the public command-only route.
    const result = await controller.execute({ kind: 'close-focused-view' })
    expect(result.status).toBe('applied')
    expect(controller.getProjection().panes[0]?.tabs[0]?.title).toBe('New Tab')
  })

  it('does not expose editor-private payloads through focused-pane projection', async() => {
    const controller = createWorkspaceRuntime([{ markdown: 'controller private history' }])
    await controller.execute({ kind: 'focus-pane', paneId: 'left' })
    const serialized = JSON.stringify(controller.getProjection())
    expect(serialized).not.toContain('controller private history')
    expect(serialized).not.toContain('portableHistory')
    expect(serialized).not.toContain('lease')
  })

  it('routes save, rename and document options through typed requests and fences their ACKs', async() => {
    const controller = createWorkspaceRuntime([{ fileKey: '/note.md', markdown: 'one' }])
    const adapter = new MemoryAdapter()
    const binding = await controller.bindPaneEditor('left', adapter)
    const lease = binding.getLease()
    if (!lease) throw new Error('missing lease')
    expect(binding.report(lease, { markdown: 'two' }).status).toBe('applied')
    const snapshot = binding.getSnapshot(lease)
    if (!snapshot) throw new Error('missing current snapshot')

    const save = await controller.execute({ kind: 'save' })
    if (save.status !== 'applied' || !save.documentIoRequest) {
      throw new Error('missing save request')
    }
    const request = save.documentIoRequest
    expect(request).toMatchObject({
      operation: 'save',
      documentId: snapshot.documentId,
      documentRevision: snapshot.documentRevision,
      fileKey: '/note.md',
      markdown: 'two',
      observedDiskRevision: null
    })
    expect(Object.isFrozen(request)).toBe(true)

    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...request,
            documentRevision: request.documentRevision - 1,
            outcome: 'durable-success',
            landedDiskRevision: 'stale'
          }
        })
      ).status
    ).toBe('rejected')
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...request,
            fileKey: '/forged.md',
            outcome: 'durable-success',
            landedDiskRevision: 'forged-key'
          }
        })
      ).status
    ).toBe('rejected')
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...request,
            ownerFence: 'forged-owner',
            outcome: 'durable-success',
            landedDiskRevision: 'forged-owner'
          }
        })
      ).status
    ).toBe('rejected')
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...request,
            outcome: 'durable-success',
            landedDiskRevision: 'landed'
          }
        })
      ).status
    ).toBe('applied')
    expect(controller.getProjection().panes[0]?.tabs[0]?.dirty).toBe(false)

    expect(
      (
        await controller.execute({
          kind: 'set-encoding',
          encoding: { encoding: 'gbk', isBom: false }
        })
      ).status
    ).toBe('applied')
    expect((await controller.execute({ kind: 'set-line-ending', lineEnding: 'crlf' })).status).toBe(
      'applied'
    )
    expect(
      (
        await controller.execute({
          kind: 'set-adjust-line-ending-on-save',
          adjustLineEndingOnSave: true
        })
      ).status
    ).toBe('applied')
    expect(
      (await controller.execute({ kind: 'set-trailing-newline', trailingNewline: 'ensure-one' }))
        .status
    ).toBe('applied')
    const rename = await controller.execute({
      kind: 'rename',
      fileKey: '/renamed.md',
      title: 'renamed'
    })
    if (rename.status !== 'applied' || !rename.documentIoRequest) {
      throw new Error('missing rename request')
    }
    expect(rename.documentIoRequest).toMatchObject({
      operation: 'rename',
      fileKey: '/renamed.md',
      encoding: { encoding: 'gbk', isBom: false },
      lineEnding: 'crlf',
      adjustLineEndingOnSave: true,
      trailingNewline: 'ensure-one'
    })
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...rename.documentIoRequest,
            outcome: 'durable-success',
            landedDiskRevision: 'renamed-landed'
          }
        })
      ).status
    ).toBe('applied')
    expect(controller.getProjection().panes[0]?.tabs[0]).toMatchObject({
      fileKey: '/renamed.md',
      title: 'renamed',
      dirty: false
    })
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...rename.documentIoRequest,
            outcome: 'durable-success',
            landedDiskRevision: 'replay'
          }
        })
      ).status
    ).toBe('rejected')
  })

  it('reserves FileKeys, supersedes same-document requests, and requires a durable matching ACK', async() => {
    const controller = createWorkspaceRuntime([
      { documentId: 'one', fileKey: '/one.md', observedDiskRevision: 'one-base' },
      { documentId: 'two', fileKey: '/two.md', observedDiskRevision: 'two-base' }
    ])
    const panes = controller.getProjection().panes[0]
    if (!panes) throw new Error('missing pane')
    const one = panes.tabs.find((tab) => tab.documentId === 'one')
    const two = panes.tabs.find((tab) => tab.documentId === 'two')
    if (!one || !two) throw new Error('missing seeded tabs')

    await controller.execute({ kind: 'activate-view', paneId: 'left', viewId: one.viewId })
    expect((await controller.execute({ kind: 'save-as', fileKey: '/two.md' })).status).toBe(
      'rejected'
    )
    const first = await controller.execute({ kind: 'save-as', fileKey: '/reserved.md' })
    if (first.status !== 'applied' || !first.documentIoRequest) { throw new Error('missing first request') }
    const firstRequest = first.documentIoRequest

    const replacement = await controller.execute({ kind: 'save-as', fileKey: '/replacement.md' })
    if (replacement.status !== 'applied' || !replacement.documentIoRequest) {
      throw new Error('missing replacement request')
    }
    const replacementRequest = replacement.documentIoRequest
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...firstRequest,
            outcome: 'durable-success',
            landedDiskRevision: 'must-stay-inert'
          }
        })
      ).status
    ).toBe('rejected')

    await controller.execute({ kind: 'activate-view', paneId: 'left', viewId: two.viewId })
    expect((await controller.execute({ kind: 'save-as', fileKey: '/replacement.md' })).status).toBe(
      'rejected'
    )
    await controller.execute({ kind: 'set-line-ending', lineEnding: 'crlf' })
    const twoSave = await controller.execute({ kind: 'save' })
    if (twoSave.status !== 'applied' || !twoSave.documentIoRequest) throw new Error('missing save')
    expect(twoSave.documentIoRequest.observedDiskRevision).toBe('two-base')
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...twoSave.documentIoRequest,
            observedDiskRevision: 'forged-base',
            outcome: 'durable-success',
            landedDiskRevision: 'forged-landed'
          }
        })
      ).status
    ).toBe('rejected')
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: { ...twoSave.documentIoRequest, outcome: 'not-durable' }
        })
      ).status
    ).toBe('failed')
    expect(
      controller.getProjection().panes[0]?.tabs.find((tab) => tab.documentId === 'two')?.dirty
    ).toBe(true)

    await controller.execute({ kind: 'activate-view', paneId: 'left', viewId: one.viewId })
    expect(
      (
        await controller.execute({
          kind: 'apply-save-ack',
          ack: {
            ...replacementRequest,
            outcome: 'durable-success',
            landedDiskRevision: 'replacement-landed'
          }
        })
      ).status
    ).toBe('applied')
    expect(
      controller.getProjection().panes[0]?.tabs.find((tab) => tab.documentId === 'one')
    ).toMatchObject({
      fileKey: '/replacement.md',
      dirty: false
    })
  })
})
