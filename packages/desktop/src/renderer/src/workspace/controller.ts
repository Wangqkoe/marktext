import type {
  DocumentId,
  EditorBindingSnapshot,
  EditorLease,
  EditorMode,
  EditorReport,
  PaneEditorAdapter,
  PaneEditorBinding,
  PaneId,
  PortableHistory,
  ViewId,
  ViewState,
  WorkspaceCapability,
  WorkspaceCommand,
  WorkspaceController as WorkspaceControllerContract,
  WorkspaceDocumentInput,
  WorkspaceProjection,
  WorkspaceResult,
  WorkspaceStatus,
  WorkspaceTocItem,
  WorkspaceWarning
} from '@shared/workspace'

interface DocumentRecord {
  id: DocumentId
  fileKey?: string
  observedDiskRevision?: string
  markdown: string
  dirty: boolean
  revision: number
  history: PortableHistory
  title: string
}

interface ViewRecord {
  id: ViewId
  documentId: DocumentId
  state: ViewState
  toc: WorkspaceTocItem[]
  status: WorkspaceStatus
}

interface PaneRecord {
  id: PaneId
  viewIds: ViewId[]
  activeViewId: ViewId
}

interface CapabilityRecord {
  readonly viewId: ViewId
  readonly documentId: DocumentId
  readonly documentRevision: number
  used: boolean
}

interface BoundAdapter {
  readonly adapter: PaneEditorAdapter
  lease?: EditorLease
}

const EMPTY_HISTORY: PortableHistory = { version: 1, value: [] }
const EMPTY_VIEW: ViewState = {
  cursor: { line: 0, column: 0 },
  selection: null,
  scrollTop: 0,
  mode: 'wysiwyg'
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child)
  }
  return value
}

/**
 * Renderer-local, deterministic workspace owner.  It intentionally has no
 * persistence/load method: live runtime state begins from an explicit seed.
 */
export class WorkspaceController implements WorkspaceControllerContract {
  private readonly documents = new Map<DocumentId, DocumentRecord>()
  private readonly views = new Map<ViewId, ViewRecord>()
  private readonly panes = new Map<PaneId, PaneRecord>()
  private readonly adapters = new Map<PaneId, BoundAdapter>()
  private readonly leases = new WeakSet<object>()
  /** Object identity makes a capability an opaque, controller-issued bearer. */
  private readonly capabilities = new WeakMap<WorkspaceCapability, CapabilityRecord>()
  private readonly listeners = new Set<(projection: WorkspaceProjection) => void>()
  private warnings: WorkspaceWarning[] = []
  private focusedPaneId: PaneId = 'left'
  private workspaceRevision = 0
  private nextId = 1
  private operationTail: Promise<void> = Promise.resolve()
  private pendingOperations = 0

  constructor(initial: readonly WorkspaceDocumentInput[] = []) {
    const first = this.createPane('left')
    for (const input of initial) {
      if (
        !input.fileKey ||
        ![...this.documents.values()].some((document) => document.fileKey === input.fileKey)
      ) {
        this.appendDocument(first, input)
      }
    }
    if (first.viewIds.length === 0) this.appendDocument(first, {})
  }

  execute(command: WorkspaceCommand): Promise<WorkspaceResult> {
    return this.enqueue(async() => this.apply(command))
  }

  getProjection(): WorkspaceProjection {
    const panes = [...this.panes.values()].map((pane) => ({
      paneId: pane.id,
      activeViewId: pane.activeViewId,
      tabs: pane.viewIds.map((viewId) => {
        const view = this.view(viewId)
        const document = this.requireDocument(view.documentId)
        return {
          viewId,
          documentId: document.id,
          title: document.title,
          ...(document.fileKey ? { fileKey: document.fileKey } : {}),
          dirty: document.dirty,
          mode: view.state.mode
        }
      }),
      toc: clone(this.view(pane.activeViewId).toc),
      status: clone(this.view(pane.activeViewId).status)
    }))
    const focused = this.requirePane(this.focusedPaneId)
    const focusedView = this.view(focused.activeViewId)
    return freeze({
      workspaceRevision: this.workspaceRevision,
      focusedPaneId: this.focusedPaneId,
      splitRatio: this.panes.size === 2 ? 0.5 : null,
      panes,
      toc: clone(focusedView.toc),
      status: clone(focusedView.status),
      warnings: clone(this.warnings)
    })
  }

  subscribe(listener: (projection: WorkspaceProjection) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Assembly-only binding: ordinary callers use the WorkspaceController interface. */
  async bindPaneEditor(paneId: PaneId, adapter: PaneEditorAdapter): Promise<PaneEditorBinding> {
    return this.enqueue(async() => this.bindPaneEditorNow(paneId, adapter))
  }

  private async bindPaneEditorNow(
    paneId: PaneId,
    adapter: PaneEditorAdapter
  ): Promise<PaneEditorBinding> {
    const pane = this.panes.get(paneId)
    if (!pane) throw new Error(`Cannot bind missing pane ${paneId}`)
    const previous = this.adapters.get(paneId)
    // Rebinding can reuse the same adapter instance. Capture its live editor
    // state before any refresh replaces that active representation.
    if (previous) await this.flushPane(paneId)
    const snapshot = this.snapshotFor(paneId, pane.activeViewId)
    const bound: BoundAdapter = { adapter }
    try {
      await adapter.refresh(snapshot)
    } catch (error) {
      if (previous?.adapter === adapter) {
        try {
          await adapter.refresh(snapshot)
        } catch {
          this.invalidate(previous)
        }
      }
      throw error
    }
    if (previous) this.invalidate(previous)
    this.adapters.set(paneId, bound)
    this.issueLease(bound, paneId, pane.activeViewId, this.view(pane.activeViewId).state.mode)
    return this.createBinding(bound)
  }

  private createBinding(bound: BoundAdapter): PaneEditorBinding {
    return {
      get lease() {
        return bound.lease
      },
      getLease: () => bound.lease,
      getSnapshot: (candidate) =>
        this.validLease(bound, candidate)
          ? this.snapshotFor(candidate.paneId, candidate.viewId)
          : undefined,
      report: (candidate, report) => {
        if (this.pendingOperations > 0) return this.rejected('workspace mutation is in progress')
        if (!this.validLease(bound, candidate)) return this.rejected('stale editor lease')
        this.applyReport(candidate.viewId, report)
        this.commit()
        return this.applied()
      },
      flush: async(candidate) =>
        this.enqueue(async() =>
          this.withLease(bound, candidate, async() => {
            this.applyReport(candidate.viewId, await bound.adapter.flush())
          })
        ),
      handoffMode: async(candidate, mode) =>
        this.enqueue(async() =>
          this.withLease(bound, candidate, async() => {
            const view = this.view(candidate.viewId)
            const report = await bound.adapter.flush()
            if (this.applyReport(candidate.viewId, report)) this.commit()
            const nextState = { ...view.state, mode }
            const beforeSnapshot = this.snapshotFor(candidate.paneId, candidate.viewId)
            try {
              await bound.adapter.refresh(
                this.snapshotForRecord(
                  candidate.paneId,
                  view,
                  this.requireDocument(view.documentId),
                  nextState
                )
              )
              view.state = nextState
              this.issueLease(bound, candidate.paneId, candidate.viewId, mode)
            } catch (error) {
              try {
                await bound.adapter.refresh(beforeSnapshot)
              } catch {
                // The lease is still invalidated by withLease; no stale writer remains.
              }
              throw error
            }
          })
        ),
      refresh: async(candidate) =>
        this.enqueue(async() =>
          this.withLease(bound, candidate, async() => {
            const report = await bound.adapter.flush()
            if (this.applyReport(candidate.viewId, report)) this.commit()
            const beforeSnapshot = this.snapshotFor(candidate.paneId, candidate.viewId)
            try {
              await bound.adapter.refresh(this.snapshotFor(candidate.paneId, candidate.viewId))
            } catch (error) {
              try {
                await bound.adapter.refresh(beforeSnapshot)
              } catch {
                // withLease invalidates the lease below; the adapter has no writer.
              }
              throw error
            }
          })
        )
    }
  }

  private async withLease(
    bound: BoundAdapter,
    lease: EditorLease,
    work: () => Promise<void>
  ): Promise<WorkspaceResult> {
    if (!this.validLease(bound, lease)) return this.rejected('stale editor lease')
    try {
      await work()
      this.commit()
      return this.applied()
    } catch (error) {
      this.invalidate(bound)
      return this.failed(errorMessage(error))
    }
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    this.pendingOperations += 1
    const run = async(): Promise<T> => {
      try {
        return await work()
      } finally {
        this.pendingOperations -= 1
      }
    }
    const result = this.operationTail.then(run, run)
    this.operationTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async apply(command: WorkspaceCommand): Promise<WorkspaceResult> {
    try {
      switch (command.kind) {
        case 'new-tab':
          return await this.newTab(command.paneId ?? this.focusedPaneId)
        case 'open-document':
          return await this.openDocument(command.document)
        case 'activate-view':
          return await this.activate(command.paneId, command.viewId, true)
        case 'focus-pane':
          return await this.focus(command.paneId)
        case 'split-pane':
          return await this.split(command.targetPaneId)
        case 'move-view':
          return await this.move(command.viewId, command.targetPaneId)
        case 'close-view':
          return await this.close(command.viewId)
        case 'commit-authorized':
          return await this.commitAuthorized(command.capability)
        case 'replace-warnings':
          return this.replaceWarnings(command.warnings)
      }
    } catch (error) {
      return this.failed(errorMessage(error))
    }
  }

  private async newTab(paneId: PaneId): Promise<WorkspaceResult> {
    const pane = this.panes.get(paneId)
    if (!pane) return this.rejected('missing pane')
    await this.flushPane(paneId)
    const doc = this.makeDocument({})
    const view = this.makeView(doc.id)
    await this.refreshAdapter(paneId, this.snapshotForRecord(paneId, view, doc))
    this.documents.set(doc.id, doc)
    this.views.set(view.id, view)
    pane.viewIds.push(view.id)
    pane.activeViewId = view.id
    this.focusedPaneId = paneId
    this.commit()
    return this.applied()
  }

  private async openDocument(input: WorkspaceDocumentInput): Promise<WorkspaceResult> {
    if (input.fileKey) {
      const existing = [...this.documents.values()].find(
        (document) => document.fileKey === input.fileKey
      )
      if (existing) {
        const existingView = this.requireViewForDocument(existing.id)
        const pane = this.requirePaneForView(existingView.id)
        return this.activate(pane.id, existingView.id, true)
      }
    }
    const pane = this.requirePane(this.focusedPaneId)
    await this.flushPane(pane.id)
    const doc = this.makeDocument(input)
    const view = this.makeView(doc.id)
    await this.refreshAdapter(pane.id, this.snapshotForRecord(pane.id, view, doc))
    this.documents.set(doc.id, doc)
    this.views.set(view.id, view)
    pane.viewIds.push(view.id)
    pane.activeViewId = view.id
    this.commit()
    return this.applied()
  }

  private async activate(paneId: PaneId, viewId: ViewId, focus: boolean): Promise<WorkspaceResult> {
    const pane = this.panes.get(paneId)
    if (!pane || !pane.viewIds.includes(viewId)) return this.rejected('view is not in pane')
    if (pane.activeViewId !== viewId) {
      await this.flushPane(paneId)
      await this.refreshAdapter(paneId, this.snapshotFor(paneId, viewId))
      pane.activeViewId = viewId
    }
    if (focus && this.focusedPaneId !== paneId) await this.focus(paneId, false)
    this.commit()
    return this.applied()
  }

  private async focus(paneId: PaneId, shouldCommit = true): Promise<WorkspaceResult> {
    if (!this.panes.has(paneId)) return this.rejected('missing pane')
    if (this.focusedPaneId !== paneId) {
      await this.flushPane(this.focusedPaneId)
      // Focusing does not replace the target active representation. Flush it
      // for current TOC/status, but retain its adapter and lease unchanged.
      await this.flushPane(paneId)
      this.focusedPaneId = paneId
    }
    if (shouldCommit) this.commit()
    return this.applied()
  }

  private async split(targetPaneId: PaneId): Promise<WorkspaceResult> {
    if (targetPaneId !== 'left' && targetPaneId !== 'right') return this.rejected('invalid pane')
    if (this.panes.size === 2) return this.rejected('workspace already has two panes')
    const source = this.requirePane('left')
    if (source.viewIds.length < 2) return this.rejected('split requires a remaining tab')
    await this.flushPane(source.id)
    const movingId = source.activeViewId
    const remaining = source.viewIds.filter((id) => id !== movingId)
    const sourceId: PaneId = targetPaneId === 'left' ? 'right' : 'left'
    const moved = this.view(movingId)
    const newSourceActive = this.firstViewId(remaining, 'split source')
    const adapterActiveId = targetPaneId === 'left' ? moved.id : newSourceActive
    await this.refreshAdapter('left', this.snapshotFor('left', adapterActiveId))
    const sourcePane: PaneRecord = {
      id: sourceId,
      viewIds: remaining,
      activeViewId: newSourceActive
    }
    const targetPane: PaneRecord = { id: targetPaneId, viewIds: [moved.id], activeViewId: moved.id }
    this.panes.clear()
    this.panes.set('left', targetPaneId === 'left' ? targetPane : sourcePane)
    this.panes.set('right', targetPaneId === 'right' ? targetPane : sourcePane)
    this.focusedPaneId = targetPaneId
    this.commit()
    return this.applied()
  }

  private async move(viewId: ViewId, targetPaneId: PaneId): Promise<WorkspaceResult> {
    const source = this.paneForView(viewId)
    const target = this.panes.get(targetPaneId)
    if (!source || !target) return this.rejected('missing source or target pane')
    if (source.id === target.id) return this.rejected('view is already in target pane')
    await this.flushPane(source.id)
    const remaining = source.viewIds.filter((id) => id !== viewId)
    const movingActiveView = source.activeViewId === viewId
    const nextSourceActiveId =
      movingActiveView && remaining.length > 0
        ? this.firstViewId(remaining, 'move source')
        : source.activeViewId
    const sourceSnapshot =
      movingActiveView && nextSourceActiveId
        ? this.snapshotFor(source.id, nextSourceActiveId)
        : undefined
    if (sourceSnapshot) await this.refreshAdapter(source.id, sourceSnapshot)
    try {
      if (remaining.length === 0) {
        await this.collapse(source.id, [...target.viewIds, viewId], viewId)
      } else {
        await this.flushAndRefresh(target.id, () => this.snapshotFor(target.id, viewId))
      }
    } catch (error) {
      if (sourceSnapshot) {
        await this.refreshAdapter(source.id, this.snapshotFor(source.id, source.activeViewId))
      }
      throw error
    }
    if (remaining.length > 0) {
      source.viewIds = remaining
      source.activeViewId = nextSourceActiveId
      target.viewIds.push(viewId)
      target.activeViewId = viewId
      this.focusedPaneId = target.id
    }
    this.commit()
    return this.applied()
  }

  private async close(viewId: ViewId): Promise<WorkspaceResult> {
    const pane = this.paneForView(viewId)
    if (!pane) return this.rejected('missing view')
    if (pane.activeViewId === viewId) await this.flushPane(pane.id)
    const document = this.requireDocument(this.view(viewId).documentId)
    if (document.dirty) return this.needsCloseCapability(viewId, document)
    return this.removeView(viewId)
  }

  private async commitAuthorized(capability: WorkspaceCapability): Promise<WorkspaceResult> {
    const stored = this.capabilities.get(capability)
    if (!stored || stored.used || capability.action !== 'close-view') { return this.rejected('stale or invalid capability') }
    const view = this.views.get(stored.viewId)
    const document = this.documents.get(stored.documentId)
    if (!view || !document || document.revision !== stored.documentRevision) { return this.rejected('stale capability target') }
    const result = await this.removeView(stored.viewId)
    if (result.status === 'applied') stored.used = true
    return result
  }

  private replaceWarnings(warnings: readonly WorkspaceWarning[]): WorkspaceResult {
    const nextWarnings = clone([...warnings])
    this.warnings = nextWarnings
    this.commit()
    return this.applied()
  }

  private async removeView(viewId: ViewId): Promise<WorkspaceResult> {
    const pane = this.paneForView(viewId)
    if (!pane) return this.rejected('missing view')
    const remaining = pane.viewIds.filter((id) => id !== viewId)
    if (remaining.length > 0) {
      const nextId = remaining.includes(pane.activeViewId)
        ? pane.activeViewId
        : this.firstViewId(remaining, 'remaining pane')
      if (nextId !== pane.activeViewId) {
        await this.flushAndRefresh(pane.id, () => this.snapshotFor(pane.id, nextId))
      }
      pane.viewIds = remaining
      pane.activeViewId = nextId
    } else if (this.panes.size === 2) {
      const survivor = this.otherPane(pane.id)
      await this.collapse(pane.id, survivor.viewIds, survivor.activeViewId)
      this.removeDocumentAndView(viewId)
      this.commit()
      return this.applied()
    } else {
      const clean = this.makeDocument({})
      const replacement = this.makeView(clean.id)
      await this.flushAndRefresh(pane.id, () =>
        this.snapshotForRecord(pane.id, replacement, clean)
      )
      this.documents.set(clean.id, clean)
      this.views.set(replacement.id, replacement)
      pane.viewIds = [replacement.id]
      pane.activeViewId = replacement.id
    }
    this.removeDocumentAndView(viewId)
    this.commit()
    return this.applied()
  }

  private async collapse(
    emptyPaneId: PaneId,
    survivingViewIds: readonly ViewId[],
    activeViewId: ViewId
  ): Promise<void> {
    const survivor = this.otherPane(emptyPaneId)
    const adapter = this.adapters.get(survivor.id)
    if (adapter) {
      await this.flushPane(survivor.id)
      const view = this.view(activeViewId)
      const document = this.requireDocument(view.documentId)
      await this.refreshAdapter(survivor.id, this.snapshotForRecord('left', view, document))
    }
    for (const bound of this.adapters.values()) {
      if (bound !== adapter) this.invalidate(bound)
    }
    this.panes.clear()
    this.panes.set('left', { id: 'left', viewIds: [...survivingViewIds], activeViewId })
    this.adapters.clear()
    if (adapter) this.adapters.set('left', adapter)
    this.focusedPaneId = 'left'
  }

  private async flushPane(paneId: PaneId): Promise<void> {
    const bound = this.adapters.get(paneId)
    if (!bound) return
    try {
      if (this.applyReport(this.requirePane(paneId).activeViewId, await bound.adapter.flush())) { this.commit() }
    } catch (error) {
      this.invalidate(bound)
      throw error
    }
  }

  private async refreshAdapter(
    paneId: PaneId,
    snapshot: EditorBindingSnapshot
  ): Promise<void> {
    const bound = this.adapters.get(paneId)
    if (!bound) return
    const pane = this.panes.get(paneId)
    const previous = pane?.activeViewId ? this.snapshotFor(paneId, pane.activeViewId) : undefined
    try {
      // A lease names a concrete active pane/view/mode; any controller-driven
      // activation replaces that binding, so the old lease must be inert.
      this.invalidate(bound)
      await bound.adapter.refresh(snapshot)
      this.issueLease(bound, snapshot.paneId, snapshot.viewId, snapshot.view.mode)
    } catch (error) {
      // An adapter may report failure after it has staged a snapshot. Restore
      // the controller's still-current binding before releasing its lease.
      if (previous) {
        try {
          await bound.adapter.refresh(previous)
        } catch {
          // The adapter is no longer trusted either way; its lease stays dead.
        }
      }
      this.invalidate(bound)
      throw error
    }
  }

  private async flushAndRefresh(
    paneId: PaneId,
    snapshot: () => EditorBindingSnapshot
  ): Promise<void> {
    await this.flushPane(paneId)
    await this.refreshAdapter(paneId, snapshot())
  }

  private applyReport(viewId: ViewId, report: EditorReport): boolean {
    const view = this.view(viewId)
    const document = this.requireDocument(view.documentId)
    let changedDocument = false
    if (report.markdown !== undefined && report.markdown !== document.markdown) {
      document.markdown = report.markdown
      document.dirty = true
      changedDocument = true
    }
    if (report.portableHistory !== undefined) {
      document.history = clone(report.portableHistory)
      changedDocument = true
    }
    let changedAuxiliary = false
    if (report.toc !== undefined) {
      const nextToc = clone([...report.toc])
      changedAuxiliary ||= JSON.stringify(view.toc) !== JSON.stringify(nextToc)
      view.toc = nextToc
    }
    if (report.status !== undefined) {
      const nextStatus = clone(report.status)
      changedAuxiliary ||= JSON.stringify(view.status) !== JSON.stringify(nextStatus)
      view.status = nextStatus
    }
    if (changedDocument) document.revision += 1
    const nextState = {
      ...view.state,
      ...(report.cursor ? { cursor: clone(report.cursor) } : {}),
      ...(report.selection !== undefined ? { selection: clone(report.selection) } : {}),
      ...(report.scrollTop !== undefined ? { scrollTop: report.scrollTop } : {})
    }
    const changedView = JSON.stringify(view.state) !== JSON.stringify(nextState)
    view.state = nextState
    return changedDocument || changedView || changedAuxiliary
  }

  // Global workspace revision deliberately stays out of this pane-local binding
  // snapshot: refreshing unrelated panes would violate pane isolation.
  private snapshotFor(paneId: PaneId, viewId: ViewId): EditorBindingSnapshot {
    const view = this.view(viewId)
    const document = this.requireDocument(view.documentId)
    return this.snapshotForRecord(paneId, view, document)
  }

  private snapshotForRecord(
    paneId: PaneId,
    view: ViewRecord,
    document: DocumentRecord,
    state = view.state
  ): EditorBindingSnapshot {
    return freeze({
      paneId,
      viewId: view.id,
      document: {
        documentId: document.id,
        ...(document.fileKey ? { fileKey: document.fileKey } : {}),
        ...(document.observedDiskRevision
          ? { observedDiskRevision: document.observedDiskRevision }
          : {}),
        markdown: document.markdown,
        dirty: document.dirty,
        documentRevision: document.revision,
        portableHistory: clone(document.history)
      },
      view: clone(state),
      toc: clone(view.toc),
      status: clone(view.status)
    })
  }

  private makeDocument(input: WorkspaceDocumentInput): DocumentRecord {
    const id = input.documentId ?? `document-${this.nextId++}`
    if (this.documents.has(id)) throw new Error(`duplicate document id ${id}`)
    return {
      id,
      ...(input.fileKey ? { fileKey: input.fileKey } : {}),
      ...(input.observedDiskRevision ? { observedDiskRevision: input.observedDiskRevision } : {}),
      markdown: input.markdown ?? '',
      dirty: false,
      revision: 0,
      history: clone(input.portableHistory ?? EMPTY_HISTORY),
      title: input.title ?? input.fileKey?.split(/[\\/]/).pop() ?? 'New Tab'
    }
  }

  private makeView(documentId: DocumentId): ViewRecord {
    return {
      id: `view-${this.nextId++}`,
      documentId,
      state: clone(EMPTY_VIEW),
      toc: [],
      status: {}
    }
  }

  private createPane(id: PaneId): PaneRecord {
    const pane: PaneRecord = { id, viewIds: [], activeViewId: '' }
    this.panes.set(id, pane)
    return pane
  }

  private appendDocument(pane: PaneRecord, input: WorkspaceDocumentInput): void {
    const document = this.makeDocument(input)
    const view = this.makeView(document.id)
    this.documents.set(document.id, document)
    this.views.set(view.id, view)
    pane.viewIds.push(view.id)
    pane.activeViewId = view.id
  }

  private view(viewId: ViewId): ViewRecord {
    const view = this.views.get(viewId)
    if (!view) throw new Error(`missing view ${viewId}`)
    return view
  }

  private requireDocument(documentId: DocumentId): DocumentRecord {
    const document = this.documents.get(documentId)
    if (!document) throw new Error(`missing document ${documentId}`)
    return document
  }

  private requirePane(paneId: PaneId): PaneRecord {
    const pane = this.panes.get(paneId)
    if (!pane) throw new Error(`missing pane ${paneId}`)
    return pane
  }

  private requireViewForDocument(documentId: DocumentId): ViewRecord {
    const view = [...this.views.values()].find((candidate) => candidate.documentId === documentId)
    if (!view) throw new Error(`missing view for document ${documentId}`)
    return view
  }

  private requirePaneForView(viewId: ViewId): PaneRecord {
    const pane = this.paneForView(viewId)
    if (!pane) throw new Error(`missing pane for view ${viewId}`)
    return pane
  }

  private otherPane(paneId: PaneId): PaneRecord {
    const pane = [...this.panes.values()].find((candidate) => candidate.id !== paneId)
    if (!pane) throw new Error(`missing pane other than ${paneId}`)
    return pane
  }

  private firstViewId(viewIds: readonly ViewId[], context: string): ViewId {
    const viewId = viewIds[0]
    if (!viewId) throw new Error(`missing first view for ${context}`)
    return viewId
  }

  private paneForView(viewId: ViewId): PaneRecord | undefined {
    return [...this.panes.values()].find((pane) => pane.viewIds.includes(viewId))
  }

  private removeDocumentAndView(viewId: ViewId): void {
    const view = this.views.get(viewId)
    if (!view) return
    this.views.delete(viewId)
    this.documents.delete(view.documentId)
  }

  private needsCloseCapability(viewId: ViewId, document: DocumentRecord): WorkspaceResult {
    const capability = freeze({ action: 'close-view' as const })
    this.capabilities.set(capability, {
      viewId,
      documentId: document.id,
      documentRevision: document.revision,
      used: false
    })
    return { status: 'needs-decision', capability: freeze(capability) }
  }

  private validLease(bound: BoundAdapter, lease: EditorLease): boolean {
    return bound.lease === lease && this.leases.has(lease)
  }

  private invalidate(bound: BoundAdapter): void {
    if (bound.lease) this.leases.delete(bound.lease)
    bound.lease = undefined
  }

  private issueLease(
    bound: BoundAdapter,
    paneId: PaneId,
    viewId: ViewId,
    mode: EditorMode
  ): EditorLease {
    this.invalidate(bound)
    const lease = freeze({ paneId, viewId, mode })
    this.leases.add(lease)
    bound.lease = lease
    return lease
  }

  private commit(): void {
    this.workspaceRevision += 1
    const projection = this.getProjection()
    for (const listener of this.listeners) {
      try {
        listener(projection)
      } catch {
        // An observer must never prevent other subscribers or a committed state.
      }
    }
  }

  private applied(): WorkspaceResult {
    return { status: 'applied', workspaceRevision: this.workspaceRevision }
  }

  private rejected(reason: string): WorkspaceResult {
    return { status: 'rejected', reason }
  }

  private failed(reason: string): WorkspaceResult {
    return { status: 'failed', reason }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createWorkspaceRuntime(
  initial: readonly WorkspaceDocumentInput[] = []
): WorkspaceController {
  return new WorkspaceController(initial)
}
