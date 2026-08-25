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
  /**
   * Prepare a replacement without making it visible. `commit` is synchronous
   * so the adapter can choose the one winning generation atomically; `cancel`
   * must discard every staged resource/listener.
   */
  stage(
    snapshot: EditorBindingSnapshot,
    scope?: PaneEditorEventScope
  ): Promise<PaneEditorSurfaceStage>
  flush(snapshot: EditorBindingSnapshot): Promise<EditorReport>
}

export interface PaneEditorSurfaceStage {
  commit(): void
  cancel(): void
}

/**
 * Production renderer adapter used by pane assembly. `current` changes only
 * after a successful surface refresh, so a failed staging refresh leaves a
 * subsequent controller rollback able to address the old representation.
 */
export class RendererPaneEditorAdapter implements PaneEditorAdapter {
  private current: EditorBindingSnapshot | undefined
  private generation = 0

  constructor(
    private readonly surface: PaneEditorSurface,
    private readonly reporter?: PaneEditorLeaseReporter
  ) {}

  async refresh(snapshot: EditorBindingSnapshot): Promise<void> {
    const generation = ++this.generation
    const scope = this.reporter?.stage(snapshot)
    const staged = await this.surface.stage(snapshot, scope)
    if (generation !== this.generation || !this.isCurrent(snapshot)) {
      staged.cancel()
      return
    }
    staged.commit()
    this.current = snapshot
    if (scope && this.reporter) this.reporter.activate(scope)
  }

  async flush(): Promise<EditorReport> {
    const snapshot = this.current
    return snapshot ? this.surface.flush(snapshot) : {}
  }

  private isCurrent(snapshot: EditorBindingSnapshot): boolean {
    return !this.reporter || this.reporter.isSnapshotCurrent(snapshot)
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
    private currentSnapshot: EditorBindingSnapshot,
    readonly paneId: PaneId,
    readonly viewId: ViewId,
    readonly documentId: string,
    readonly mode: EditorMode
  ) {}

  get snapshot(): EditorBindingSnapshot {
    return this.currentSnapshot
  }

  replaceSnapshot(snapshot: EditorBindingSnapshot): void {
    this.currentSnapshot = snapshot
  }

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
    if (!binding) this.activeScope = undefined
  }

  isSnapshotCurrent(snapshot: EditorBindingSnapshot): boolean {
    return this.binding?.isSnapshotCurrent(snapshot) ?? true
  }

  getActiveScope(): PaneEditorEventScope | undefined {
    return this.activeScope
  }

  stage(snapshot: EditorBindingSnapshot): PaneEditorEventScope {
    if (snapshot.paneId !== this.paneId) {
      throw new Error('pane adapter received the wrong pane snapshot')
    }
    if (
      snapshot.documentId !== snapshot.document.documentId ||
      snapshot.documentRevision !== snapshot.document.documentRevision ||
      snapshot.lease.paneId !== snapshot.paneId ||
      snapshot.lease.viewId !== snapshot.viewId ||
      snapshot.lease.mode !== snapshot.view.mode
    ) {
      throw new Error('pane adapter received an incoherent editor snapshot')
    }
    return new RendererPaneEditorEventScope(
      this,
      snapshot,
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
    if (this.binding && !this.binding.isSnapshotCurrent(scope.snapshot)) {
      throw new Error('pane adapter attempted to activate a stale editor snapshot')
    }
    this.activeScope = scope
  }

  report(scope: RendererPaneEditorEventScope, report: EditorReport): WorkspaceResult {
    const lease = this.matchingLease(scope)
    const binding = this.binding
    if (!lease || !binding) return { status: 'rejected', reason: 'stale editor lease' }
    const result = binding.report(lease, report)
    if (result.status === 'applied') {
      const current = binding.getSnapshot(lease)
      if (current) scope.replaceSnapshot(current)
    }
    return result
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
      this.binding?.isSnapshotCurrent(scope.snapshot) &&
      lease?.paneId === this.paneId &&
      lease.viewId === scope.viewId &&
      lease.mode === scope.mode
      ? lease
      : undefined
  }
}
