import type {
  EditorBindingSnapshot,
  EditorLease,
  EditorMode,
  EditorReport,
  PaneEditorAdapter,
  PaneEditorBinding,
  PaneId,
  ViewId,
  WorkspaceResult
} from '@shared/workspace'

/**
 * The renderer-facing half of the PaneEditorAdapter seam. A surface is one
 * concrete editor instance (Muya plus its source editor), never a process-wide
 * event bus. The controller owns the resulting lease; this adapter only keeps
 * the snapshot that the surface is currently representing.
 */
export interface PaneEditorSurface {
  refresh(snapshot: EditorBindingSnapshot, scope?: PaneEditorEventScope): Promise<void>
  flush(snapshot: EditorBindingSnapshot): Promise<EditorReport>
}

/**
 * Production renderer adapter used by pane assembly. `current` changes only
 * after a successful surface refresh, so a failed staging refresh leaves a
 * subsequent controller rollback able to address the old representation.
 */
export class RendererPaneEditorAdapter implements PaneEditorAdapter {
  private current: EditorBindingSnapshot | undefined

  constructor(
    private readonly surface: PaneEditorSurface,
    private readonly reporter?: PaneEditorLeaseReporter
  ) {}

  async refresh(snapshot: EditorBindingSnapshot): Promise<void> {
    const scope = this.reporter?.stage(snapshot)
    await this.surface.refresh(snapshot, scope)
    this.current = snapshot
    if (scope && this.reporter) this.reporter.activate(scope)
  }

  async flush(): Promise<EditorReport> {
    const snapshot = this.current
    return snapshot ? this.surface.flush(snapshot) : {}
  }
}

/**
 * Bounded compatibility edge for a renderer editor surface. Components report
 * their pane/view/mode identity, not an EditorLease. This bridge obtains the
 * opaque lease from the binding and refuses events from an old view or mode
 * before they can reach the controller.
 *
 * It deliberately has no fallback to `currentFile` or the global event bus.
 */
export interface PaneEditorEventScope {
  readonly paneId: PaneId
  readonly viewId: ViewId
  readonly documentId: string
  readonly mode: EditorMode
  report(report: EditorReport): WorkspaceResult
  flush(): Promise<WorkspaceResult>
  handoffMode(toMode: EditorMode): Promise<WorkspaceResult>
}

class RendererPaneEditorEventScope implements PaneEditorEventScope {
  constructor(
    private readonly reporter: PaneEditorLeaseReporter,
    readonly paneId: PaneId,
    readonly viewId: ViewId,
    readonly documentId: string,
    readonly mode: EditorMode
  ) {}

  report(report: EditorReport): WorkspaceResult {
    return this.reporter.report(this, report)
  }

  flush(): Promise<WorkspaceResult> {
    return this.reporter.flush(this)
  }

  handoffMode(toMode: EditorMode): Promise<WorkspaceResult> {
    return this.reporter.handoffMode(this, toMode)
  }
}

export class PaneEditorLeaseReporter {
  private binding: PaneEditorBinding | undefined
  private activeScope: RendererPaneEditorEventScope | undefined

  constructor(private readonly paneId: PaneId) {}

  attach(binding: PaneEditorBinding | undefined): void {
    this.binding = binding
  }

  getActiveScope(): PaneEditorEventScope | undefined {
    return this.activeScope
  }

  stage(snapshot: EditorBindingSnapshot): PaneEditorEventScope {
    if (snapshot.paneId !== this.paneId) {
      throw new Error('pane adapter received the wrong pane snapshot')
    }
    return new RendererPaneEditorEventScope(
      this,
      snapshot.paneId,
      snapshot.viewId,
      snapshot.document.documentId,
      snapshot.view.mode
    )
  }

  activate(scope: PaneEditorEventScope): void {
    if (!(scope instanceof RendererPaneEditorEventScope) || scope.paneId !== this.paneId) {
      throw new Error('pane adapter attempted to activate a foreign editor scope')
    }
    this.activeScope = scope
  }

  report(scope: RendererPaneEditorEventScope, report: EditorReport): WorkspaceResult {
    const lease = this.matchingLease(scope)
    const binding = this.binding
    return lease && binding
      ? binding.report(lease, report)
      : { status: 'rejected', reason: 'stale editor lease' }
  }

  flush(scope: RendererPaneEditorEventScope): Promise<WorkspaceResult> {
    const lease = this.matchingLease(scope)
    const binding = this.binding
    return lease && binding
      ? binding.flush(lease)
      : Promise.resolve({ status: 'rejected', reason: 'stale editor lease' })
  }

  handoffMode(scope: RendererPaneEditorEventScope, toMode: EditorMode): Promise<WorkspaceResult> {
    const lease = this.matchingLease(scope)
    const binding = this.binding
    return lease && binding
      ? binding.handoffMode(lease, toMode)
      : Promise.resolve({ status: 'rejected', reason: 'stale editor lease' })
  }

  private matchingLease(scope: RendererPaneEditorEventScope): EditorLease | undefined {
    const lease = this.binding?.getLease()
    return this.activeScope === scope &&
      lease?.paneId === this.paneId &&
      lease.viewId === scope.viewId &&
      lease.mode === scope.mode
      ? lease
      : undefined
  }
}
