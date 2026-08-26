import type { PaneId } from '@shared/workspace'
import type { TransferIntent } from 'main_renderer/tabTransfer'
import type { WorkspaceController } from './controller'

export interface RendererTransferPort {
  run(intent: TransferIntent): Promise<unknown>
}

/** Narrow assembly action for T06. Menus may call it later without learning transfer internals. */
export const createMoveTabToNewWindowAction = (
  controller: WorkspaceController,
  transfer: RendererTransferPort
) => async (tabId: string, paneId: PaneId): Promise<unknown> => {
  const source = await controller.transferSourceSnapshot(paneId, tabId)
  if (!source) return { status: 'rejected', reason: 'explicit source tab is unavailable' }
  const requestId = crypto.randomUUID()
  const intent: TransferIntent = {
    requestId,
    fingerprint: `${source.sourceLineage}:${source.viewId}:${source.documentRevision}`,
    // Main replaces renderer supplied endpoint/session fields with its sender identity.
    source: { sessionId: 'renderer-untrusted', epoch: 0 },
    sourceDocumentId: source.documentId,
    sourceViewId: source.viewId,
    sourceLineage: source.sourceLineage,
    documentRevision: source.documentRevision,
    isLastSourceTab: source.isLastSourceTab,
    capsule: {
      version: 1,
      sourceDocumentId: source.documentId,
      sourceViewId: source.viewId,
      sourceSessionId: 'renderer-untrusted',
      sourceLineage: source.sourceLineage,
      documentRevision: source.documentRevision,
      ...(source.fileKey ? { fileKey: source.fileKey, observedDiskRevision: source.observedDiskRevision } : {}),
      title: source.title,
      markdown: source.markdown,
      dirty: source.dirty,
      conflict: source.conflict,
      options: {},
      history: source.history,
      view: source.view
    }
  }
  return transfer.run(intent)
}
