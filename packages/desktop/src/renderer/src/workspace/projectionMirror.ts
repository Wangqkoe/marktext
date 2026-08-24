import type { WorkspaceController, WorkspaceProjection } from '@shared/workspace'

/**
 * The one-way compatibility seam for legacy renderer consumers.  It stores
 * only the controller's already-frozen JSON display shell; neither a document
 * buffer nor an editor capability can enter here.  Keeping it independent of
 * Pinia makes disposal explicit and lets T03 mount more than one composition
 * without a process-global editor owner.
 */
export class WorkspaceProjectionMirror {
  private projection: WorkspaceProjection
  private readonly unsubscribe: () => void
  private disposed = false

  constructor(private readonly controller: WorkspaceController) {
    this.projection = controller.getProjection()
    this.unsubscribe = controller.subscribe((projection) => {
      if (!this.disposed) this.projection = projection
    })
  }

  getSnapshot(): WorkspaceProjection {
    return this.projection
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
  }
}

export const createWorkspaceProjectionMirror = (
  controller: WorkspaceController
): WorkspaceProjectionMirror => new WorkspaceProjectionMirror(controller)
