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
  private readonly listeners = new Set<(projection: WorkspaceProjection) => void>()
  private disposed = false

  constructor(private readonly controller: WorkspaceController) {
    this.projection = controller.getProjection()
    this.unsubscribe = controller.subscribe((projection) => {
      if (this.disposed) return
      this.projection = projection
      for (const listener of this.listeners) listener(projection)
    })
  }

  getSnapshot(): WorkspaceProjection {
    return this.projection
  }

  subscribe(listener: (projection: WorkspaceProjection) => void): () => void {
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
