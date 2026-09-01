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

export interface FinalReportPaneEditorAdapter extends PaneEditorAdapter {
  takeFinalReport(): EditorReport | undefined
}

/**
 * Production renderer adapter used by pane assembly. `current` changes only
 * after a successful surface refresh, so a failed staging refresh leaves a
 * subsequent controller rollback able to address the old representation.
 */
export class RendererPaneEditorAdapter implements FinalReportPaneEditorAdapter {
  private current: EditorBindingSnapshot | undefined
  private finalReport: EditorReport | undefined
  private generation = 0

  constructor(
    private readonly surface: PaneEditorSurface,
    private readonly reporter?: PaneEditorLeaseReporter
  ) {}

  async refresh(snapshot: EditorBindingSnapshot): Promise<void> {
    const generation = ++this.generation
    const previousScope = this.reporter?.getActiveScope()
    const scope = this.reporter?.stage(snapshot)
    const staged = await this.surface.stage(snapshot, scope)
    if (generation !== this.generation || !this.isCurrent(snapshot)) {
      this.cancel(staged)
      return
    }
    try {
      staged.commit()
      if (scope && this.reporter) this.reporter.activate(scope)
      this.current = snapshot
    } catch (error) {
      this.cancel(staged)
      this.reporter?.restoreActiveScope(previousScope)
      throw error
    }
  }

  async flush(): Promise<EditorReport> {
    const snapshot = this.current
    return snapshot ? this.surface.flush(snapshot) : {}
  }

  dispose(): void {
    this.generation += 1
    if (this.current && !this.finalReport) {
      this.finalReport = this.reporter?.takeFinalReport(this.current)
    }
    this.current = undefined
    this.reporter?.attach(undefined)
  }

  takeFinalReport(): EditorReport | undefined {
    const report = this.finalReport
    this.finalReport = undefined
    return report
  }

  private isCurrent(snapshot: EditorBindingSnapshot): boolean {
    return !this.reporter || this.reporter.isSnapshotCurrent(snapshot)
  }

  /** Best-effort cleanup must never replace the originating refresh error. */
  private cancel(staged: PaneEditorSurfaceStage): void {
    try {
      staged.cancel()
    } catch {
      // A failed cleanup cannot safely revive a stale staged generation.
    }
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
  finalizeScroll(scrollTop: number): void
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

  finalizeScroll(scrollTop: number): void {
    this.reporter.finalizeScroll(this, scrollTop)
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
  private finalScroll:
    | { readonly scope: RendererPaneEditorEventScope; readonly scrollTop: number }
    | undefined

  private readonly scopeWaiters = new Set<{
    mode: EditorMode
    resolve: (scope: PaneEditorEventScope | undefined) => void
    signal: AbortSignal | undefined
    abort: () => void
  }>()

  constructor(private readonly paneId: PaneId) {}

  attach(binding: PaneEditorBinding | undefined): void {
    this.binding = binding
    if (!binding) {
      this.activeScope = undefined
      this.finalScroll = undefined
      this.resolveScopeWaiters(undefined)
    }
  }

  /** Restores the pre-refresh scope when commit/activation compensation runs. */
  restoreActiveScope(scope: PaneEditorEventScope | undefined): void {
    this.activeScope = scope instanceof RendererPaneEditorEventScope ? scope : undefined
  }

  isSnapshotCurrent(snapshot: EditorBindingSnapshot): boolean {
    return this.binding?.isSnapshotCurrent(snapshot) ?? true
  }

  getActiveScope(): PaneEditorEventScope | undefined {
    return this.activeScope
  }

  /** Wait for the controller to publish a scope for a newly mounted surface. */
  scopeForMode(mode: EditorMode, signal?: AbortSignal): Promise<PaneEditorEventScope | undefined> {
    const active = this.activeScope
    if (active?.mode === mode) return Promise.resolve(active)
    if (signal?.aborted) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const waiter = {
        mode,
        resolve,
        signal,
        abort: () => this.finishScopeWaiter(waiter, undefined)
      }
      this.scopeWaiters.add(waiter)
      signal?.addEventListener('abort', waiter.abort, { once: true })
    })
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
    if (this.activeScope !== scope) this.finalScroll = undefined
    this.activeScope = scope
    this.resolveScopeWaiters(scope)
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

  finalizeScroll(scope: RendererPaneEditorEventScope, scrollTop: number): void {
    if (!this.matchingLease(scope)) return
    this.finalScroll = { scope, scrollTop }
  }

  takeFinalReport(snapshot: EditorBindingSnapshot): EditorReport | undefined {
    const finalScroll = this.finalScroll
    this.finalScroll = undefined
    if (
      !finalScroll ||
      this.activeScope !== finalScroll.scope ||
      finalScroll.scope.snapshot.lease !== snapshot.lease ||
      finalScroll.scope.paneId !== snapshot.paneId ||
      finalScroll.scope.viewId !== snapshot.viewId ||
      finalScroll.scope.mode !== snapshot.view.mode
    ) return undefined
    return { scrollTop: finalScroll.scrollTop }
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
    if (
      this.activeScope !== scope ||
      !lease ||
      scope.snapshot.lease !== lease ||
      lease.paneId !== this.paneId ||
      lease.viewId !== scope.viewId ||
      lease.mode !== scope.mode
    ) return undefined
    // Controller-only metadata changes (for example a DocumentIO owner-fence
    // acknowledgement) refresh the binding snapshot without issuing a new
    // lease. Keep this active scope on that same lease current; a successor
    // lease can never be adopted here because its object identity differs.
    const snapshot = this.binding?.getSnapshot(lease)
    if (!snapshot) return undefined
    scope.replaceSnapshot(snapshot)
    return lease
  }

  private resolveScopeWaiters(scope: PaneEditorEventScope | undefined): void {
    for (const waiter of [...this.scopeWaiters]) {
      if (!scope || waiter.mode === scope.mode) this.finishScopeWaiter(waiter, scope)
    }
  }

  private finishScopeWaiter(
    waiter: {
      mode: EditorMode
      resolve: (scope: PaneEditorEventScope | undefined) => void
      signal: AbortSignal | undefined
      abort: () => void
    },
    scope: PaneEditorEventScope | undefined
  ): void {
    if (!this.scopeWaiters.delete(waiter)) return
    waiter.signal?.removeEventListener('abort', waiter.abort)
    waiter.resolve(scope)
  }
}
