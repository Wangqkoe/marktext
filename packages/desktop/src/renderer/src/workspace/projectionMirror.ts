import type {
  WorkspaceController,
  WorkspaceFacadeSnapshot,
  WorkspaceProjection,
  WorkspaceViewStateUpdate
} from '@shared/workspace'

export const patchWorkspaceFacadeViewState = (
  current: WorkspaceFacadeSnapshot,
  projection: WorkspaceProjection,
  update: WorkspaceViewStateUpdate
): WorkspaceFacadeSnapshot => Object.freeze({
  projection,
  documents: Object.freeze(current.documents.map((document) =>
    document.viewId === update.viewId
      ? Object.freeze({
        ...document,
        cursor: update.view.cursor,
        selection: update.view.selection,
        scrollTop: update.view.scrollTop,
        mode: update.view.mode
      })
      : document
  ))
})

/**
 * The one-way compatibility seam for legacy renderer consumers.  It stores
 * the controller's already-frozen renderer-local display data. It never
 * carries a capability, fence, or disk revision. Keeping it independent of
 * Pinia makes disposal explicit and lets T03 mount more than one composition.
 */
export class WorkspaceProjectionMirror {
  private projection: WorkspaceFacadeSnapshot
  private readonly unsubscribe: () => void
  private readonly listeners = new Set<(
    projection: WorkspaceFacadeSnapshot,
    update?: WorkspaceViewStateUpdate
  ) => void>()

  private disposed = false

  constructor(private readonly controller: WorkspaceController) {
    this.projection = controller.getFacadeSnapshot()
    this.unsubscribe = controller.subscribe((projection, update) => {
      if (this.disposed) return
      this.projection = update?.kind === 'view-state'
        ? patchWorkspaceFacadeViewState(this.projection, projection, update)
        : controller.getFacadeSnapshot()
      for (const listener of this.listeners) listener(this.projection, update)
    })
  }

  getSnapshot(): WorkspaceFacadeSnapshot {
    return this.projection
  }

  subscribe(listener: (
    projection: WorkspaceFacadeSnapshot,
    update?: WorkspaceViewStateUpdate
  ) => void): () => void {
    if (this.disposed) return () => undefined
    this.listeners.add(listener)
    listener(this.projection)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
    this.listeners.clear()
  }
}

export const createWorkspaceProjectionMirror = (
  controller: WorkspaceController
): WorkspaceProjectionMirror => new WorkspaceProjectionMirror(controller)
