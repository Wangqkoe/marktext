import type { PaneId } from '@shared/workspace'
import type { TabTransferResult, TransferIntent } from 'main_renderer/tabTransfer'
import type { WorkspaceController } from './controller'

export interface RendererTransferPort {
  run(intent: TransferIntent): Promise<TabTransferResult>
}

export interface MoveSourceFlusher {
  flushSource(paneId: PaneId, tabId: string): Promise<boolean>
}

/** Narrow assembly action for T06. Menus may call it later without learning transfer internals. */
export const createMoveTabToNewWindowAction = (
  controller: WorkspaceController,
  transfer: RendererTransferPort,
  sourceFlusher?: MoveSourceFlusher
) => async(tabId: string, paneId: PaneId): Promise<unknown> => {
  const requestId = crypto.randomUUID()
  if (sourceFlusher && !await sourceFlusher.flushSource(paneId, tabId)) {
    return { status: 'rejected', reason: 'explicit source tab is unavailable' }
  }
  const source = await controller.beginTransferPreflight(paneId, tabId, requestId)
  if (!source) return { status: 'rejected', reason: 'explicit source tab is unavailable' }
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
      sourcePreflightId: source.preflightId,
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
  try {
    const result = await transfer.run(intent)
    if (result.status === 'rejected' ||
      (result.status === 'failed' && result.reason.startsWith('transfer aborted before authorization:'))) {
      await controller.clearTransferPreflight(source.preflightId)
    }
    return result
  } catch (error) {
    await controller.clearTransferPreflight(source.preflightId)
    throw error
  }
}
