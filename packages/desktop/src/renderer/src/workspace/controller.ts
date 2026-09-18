import type {
  DocumentId,
  DocumentEncoding,
  DocumentLineEnding,
  EditorBindingSnapshot,
  EditorLease,
  EditorMode,
  EditorReport,
  FileKey,
  PaneEditorAdapter,
  PaneEditorBinding,
  PaneId,
  PortableHistory,
  TrailingNewlinePolicy,
  ViewId,
  ViewState,
  WorkspaceCapability,
  WorkspaceCommand,
  WorkspaceController as WorkspaceControllerContract,
  WorkspaceDocumentInput,
  WorkspaceFacadeSnapshot,
  WorkspaceProjection,
  WorkspaceResult,
  WorkspaceStatus,
  WorkspaceTocItem,
  WorkspaceViewStateUpdate,
  WorkspaceWarning
} from '@shared/workspace'
import type { DocumentIoSaveRequest, DocumentSaveAck } from '@shared/workspace/documentIo'
import { mapIndexCursor } from '@shared/workspace/indexCursorMap'

interface DocumentRecord {
  id: DocumentId
  fileKey?: string
  observedDiskRevision?: string | null
  markdown: string
  savedMarkdown: string
  /**
   * The WYSIWYG engine's serialization of `savedMarkdown`. Muya rewrites some
   * formatting (blank lines, table padding) without any user edit; a report
   * equal to this is unchanged content, so the file's own text is kept.
   */
  canonicalBaseline?: string
  /**
   * The current text was typed in Source mode and differs from the saved text.
   * Source reports are exact, so a Source edit that happens to equal the
   * canonical form is still a real edit.
   */
  sourceEdited: boolean
  dirty: boolean
  conflict: boolean
  revision: number
  history: PortableHistory
  title: string
  encoding: DocumentEncoding
  lineEnding: DocumentLineEnding
  adjustLineEndingOnSave: boolean
  trailingNewline: TrailingNewlinePolicy
  ownerFence: string
  sharedHistory: boolean
  reloadSerial: number
}

interface ViewRecord {
  id: ViewId
  documentId: DocumentId
  state: ViewState
  scrollObservationEpoch: number
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
  readonly ownerFence: string
  used: boolean
}
interface TransferFence {
  readonly paneId: PaneId
  readonly documentId: DocumentId
  readonly viewId: ViewId
  readonly documentRevision: number
  readonly ownerFence: string
  readonly preflightId?: string
  used: boolean
}

export interface TransferSourceSnapshot {
  readonly documentId: DocumentId
  readonly viewId: ViewId
  readonly sourceLineage: string
  readonly documentRevision: number
  readonly isLastSourceTab: boolean
  readonly fileKey?: string
  readonly observedDiskRevision?: string | null
  readonly title: string
  readonly markdown: string
  readonly dirty: boolean
  readonly conflict: boolean
  readonly history: PortableHistory
  readonly view: ViewState
}

export interface TransferPreflightSnapshot extends TransferSourceSnapshot {
  readonly preflightId: string
}

interface PendingDocumentIo {
  readonly request: DocumentIoSaveRequest
  readonly targetFileKey: string
  readonly targetTitle: string
}

interface BoundAdapter {
  readonly adapter: PaneEditorAdapter
  lease?: EditorLease
  snapshot?: EditorBindingSnapshot
  refreshing?: boolean
}

// Muya may vary only terminal line breaks while round-tripping source mode or
// rebuilding undo state. The legacy save tracker treats those as the same
// document; Controller keeps the exact markdown for DocumentIO but owns this
// canonical dirty comparison.
const sameDirtyContent = (left: string, right: string): boolean =>
  left.replace(/[\r\n]+$/, '') === right.replace(/[\r\n]+$/, '')

const EMPTY_HISTORY: PortableHistory = { version: 1, value: [] }
const DEFAULT_ENCODING: DocumentEncoding = { encoding: 'utf8', isBom: false }
const EMPTY_VIEW: ViewState = {
  cursor: { line: 0, column: 0 },
  selection: null,
  scrollTop: 0,
  mode: 'wysiwyg'
}

const isCursorSelectionReport = (report: EditorReport): boolean => {
  const fields = Object.keys(report)
  return fields.length > 0 && fields.every(field => field === 'cursor' || field === 'selection')
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
  private readonly inFlightAdapters = new Set<PaneEditorAdapter>()
  private readonly leases = new WeakSet<object>()
  /** Object identity makes a capability an opaque, controller-issued bearer. */
  private readonly capabilities = new WeakMap<WorkspaceCapability, CapabilityRecord>()
  private readonly transferFences = new Map<string, TransferFence>()
  private readonly pendingDocumentIo = new Map<string, PendingDocumentIo>()
  private readonly listeners = new Set<(
    projection: WorkspaceProjection,
    update?: WorkspaceViewStateUpdate
  ) => void>()

  private warnings: WorkspaceWarning[] = []
  private focusedPaneId: PaneId = 'left'
  private splitRatio = 0.5
  private workspaceRevision = 0
  private nextId = 1
  private nextDocumentIoRequest = 1
  private operationTail: Promise<void> = Promise.resolve()
  private pendingOperations = 0
  private disposed = false
  private lifecycleGeneration = 0

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
    if (this.disposed) return Promise.resolve(this.rejected('workspace controller is disposed'))
    return this.enqueue(async() => this.apply(command))
  }

  /** Internal Move edge: atomically adopts the action's already-flushed source fence. */
  prepareTransfer(transferId: string, documentId: DocumentId, viewId: ViewId, expectedRevision: number, preflightId: string): Promise<number | undefined> {
    return this.enqueue(async() => {
      const adopted = this.transferFences.get(transferId)
      const view = this.views.get(viewId)
      const document = this.documents.get(documentId)
      if (adopted) {
        return adopted.documentId === documentId && adopted.viewId === viewId &&
          adopted.documentRevision === expectedRevision && adopted.ownerFence === document?.ownerFence &&
          view?.documentId === documentId && document?.revision === expectedRevision
          ? document.revision
          : undefined
      }
      const preflightKey = this.preflightKey(preflightId)
      const preflight = this.transferFences.get(preflightKey)
      if (!preflight || !view || view.documentId !== documentId || !document ||
        preflight.preflightId !== preflightId || preflight.documentId !== documentId ||
        preflight.viewId !== viewId || preflight.documentRevision !== expectedRevision ||
        preflight.ownerFence !== document.ownerFence || document.revision !== expectedRevision) return undefined
      this.transferFences.delete(preflightKey)
      this.transferFences.set(transferId, {
        paneId: preflight.paneId,
        documentId,
        viewId,
        documentRevision: document.revision,
        ownerFence: document.ownerFence,
        preflightId,
        used: false
      })
      return document.revision
    })
  }

  /** Action-only preflight: one controller-queued flush seals the capsule source. */
  beginTransferPreflight(paneId: PaneId, tabId: string, preflightId: string): Promise<TransferPreflightSnapshot | undefined> {
    return this.enqueue(async() => {
      const source = await this.captureTransferSource(paneId, tabId)
      if (!source || [...this.transferFences.values()].some(fence =>
        fence.preflightId && fence.documentId === source.documentId && fence.viewId === source.viewId
      )) return undefined
      this.transferFences.set(this.preflightKey(preflightId), {
        paneId,
        documentId: source.documentId,
        viewId: source.viewId,
        documentRevision: source.documentRevision,
        ownerFence: this.requireDocument(source.documentId).ownerFence,
        preflightId,
        used: false
      })
      return { ...source, preflightId }
    })
  }

  /** A failed pre-authorization run removes its fence, including an unconsumed adoption. */
  clearTransferPreflight(preflightId: string): Promise<void> {
    return this.enqueue(async() => {
      this.transferFences.delete(this.preflightKey(preflightId))
      for (const [transferId, fence] of this.transferFences) {
        if (fence.preflightId === preflightId && !fence.used) this.transferFences.delete(transferId)
      }
    })
  }

  /** Only a pre-authorized Move fence may release a dirty source without a dialog. */
  releaseTransfer(transferId: string, documentId: DocumentId, viewId: ViewId): Promise<WorkspaceResult> {
    return this.enqueue(async() => {
      const fence = this.transferFences.get(transferId)
      const view = this.views.get(viewId)
      const document = this.documents.get(documentId)
      if (!fence || fence.used || !view || !document ||
        fence.documentId !== documentId || fence.viewId !== viewId || view.documentId !== documentId ||
        fence.documentRevision !== document.revision || fence.ownerFence !== document.ownerFence) {
        return this.rejected('stale transfer release fence')
      }
      const result = await this.removeView(viewId)
      if (result.status === 'applied') {
        fence.used = true
        this.transferFences.delete(transferId)
      }
      return result
    })
  }

  /** The only renderer assembly read used to construct a Move capsule. */
  transferSourceSnapshot(paneId: PaneId, tabId: string): Promise<TransferSourceSnapshot | undefined> {
    return this.enqueue(async() => this.captureTransferSource(paneId, tabId))
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
          conflict: document.conflict,
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
      splitRatio: this.panes.size === 2 ? this.splitRatio : null,
      panes,
      toc: clone(focusedView.toc),
      status: clone(focusedView.status),
      warnings: clone(this.warnings)
    })
  }

  subscribe(listener: (
    projection: WorkspaceProjection,
    update?: WorkspaceViewStateUpdate
  ) => void): () => void {
    if (this.disposed) return () => undefined
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Assembly lifecycle only: every controller-issued capability becomes inert. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lifecycleGeneration += 1
    for (const adapter of this.inFlightAdapters) adapter.dispose?.()
    for (const bound of this.adapters.values()) {
      this.invalidate(bound)
      bound.adapter.dispose?.()
    }
    this.adapters.clear()
    this.pendingDocumentIo.clear()
    this.listeners.clear()
  }

  /** Assembly-only binding: ordinary callers use the WorkspaceController interface. */
  async bindPaneEditor(
    paneId: PaneId,
    adapter: PaneEditorAdapter,
    isMounted: () => boolean = () => true
  ): Promise<PaneEditorBinding> {
    if (this.disposed) throw new Error('workspace controller is disposed')
    const lifecycleGeneration = this.lifecycleGeneration
    return this.enqueue(async() =>
      this.bindPaneEditorNow(paneId, adapter, lifecycleGeneration, isMounted)
    )
  }

  private async bindPaneEditorNow(
    paneId: PaneId,
    adapter: PaneEditorAdapter,
    lifecycleGeneration: number,
    isMounted: () => boolean
  ): Promise<PaneEditorBinding> {
    if (!this.isBindCurrent(lifecycleGeneration, isMounted)) {
      adapter.dispose?.()
      throw new Error('pane editor binding is no longer mounted')
    }
    const pane = this.panes.get(paneId)
    if (!pane) throw new Error(`Cannot bind missing pane ${paneId}`)
    const previous = this.adapters.get(paneId)
    // Rebinding can reuse the same adapter instance. Capture its live editor
    // state before any refresh replaces that active representation.
    if (previous) await this.flushPane(paneId)
    if (!this.isBindCurrent(lifecycleGeneration, isMounted)) {
      adapter.dispose?.()
      throw new Error('pane editor binding is no longer mounted')
    }
    const previousSnapshot = previous?.snapshot
    // Rebinding is a handoff, not a grace period: revoke the predecessor
    // before a successor can begin staging on the concrete surface.
    if (previous) this.invalidate(previous)
    const snapshot = this.snapshotFor(paneId, pane.activeViewId)
    const bound: BoundAdapter = { adapter }
    const lease = this.issueLease(bound, paneId, pane.activeViewId, snapshot.view.mode)
    const current = this.snapshotWithLease(snapshot, lease)
    bound.snapshot = current
    this.inFlightAdapters.add(adapter)
    try {
      await adapter.refresh(current)
      if (!this.isBindCurrent(lifecycleGeneration, isMounted)) {
        this.invalidate(bound)
        adapter.dispose?.()
        throw new Error('pane editor binding is no longer mounted')
      }
    } catch (error) {
      this.invalidate(bound)
      // A same-instance refresh can have partially staged its contents. Put
      // the prior accepted snapshot back; if that compensation also fails the
      // original binding is no longer trustworthy and must become inert.
      if (this.isBindCurrent(lifecycleGeneration, isMounted) && previous && previousSnapshot) {
        try {
          await this.restoreAdapterSnapshot(previous, previousSnapshot)
        } catch {
          this.invalidate(previous)
        }
      }
      throw error
    } finally {
      this.inFlightAdapters.delete(adapter)
    }
    // The predecessor remains available only while a replacement is staging.
    // Once the surface accepted its full snapshot, revoke it before exposing
    // the successor binding to any reporter.
    this.adapters.set(paneId, bound)
    // The editor surface owns canonical markdown serialization.  A pristine
    // input may differ from that serialization (for example trailing newline
    // normalization), so establish the clean baseline from the first accepted
    // surface report rather than comparing later edits to raw input bytes.
    const document = this.documentForPane(paneId)
    const wasDirty = document?.dirty ?? false
    await this.flushPane(paneId)
    if (document && !wasDirty && document.dirty && !document.sourceEdited) {
      document.canonicalBaseline = document.markdown
      document.markdown = document.savedMarkdown
      document.dirty = false
      this.updateBoundSnapshot(bound)
      this.commit()
    }
    return this.createBinding(bound)
  }

  private isBindCurrent(lifecycleGeneration: number, isMounted: () => boolean): boolean {
    try {
      return !this.disposed && this.lifecycleGeneration === lifecycleGeneration && isMounted()
    } catch {
      return false
    }
  }

  private createBinding(bound: BoundAdapter): PaneEditorBinding {
    return {
      get lease() {
        return bound.lease
      },
      getLease: () => bound.lease,
      getSnapshot: (candidate) => (this.validLease(bound, candidate) ? bound.snapshot : undefined),
      isSnapshotCurrent: (snapshot) => this.validSnapshot(bound, snapshot),
      report: (candidate, report) => {
        if (this.disposed) return this.rejected('workspace controller is disposed')
        if (!this.validLease(bound, candidate)) return this.rejected('stale editor lease')
        if (!this.documentIsCurrent(bound)) return this.rejected('stale document revision')
        if (this.hasPreflightForView(candidate.viewId)) return this.rejected('transfer preflight fence is active')
        if (this.pendingOperations > 0 || bound.refreshing) return this.rejected('workspace mutation is in progress')
        const viewStateOnly = isCursorSelectionReport(report)
        const changed = this.applyReport(candidate.viewId, report)
        if (changed) {
          if (viewStateOnly) {
            this.commitViewState(bound, candidate.viewId)
          } else {
            this.updateBoundSnapshot(bound)
            this.refreshSharedEditors(bound)
            this.commit()
          }
        }
        return this.applied()
      },
      finalizeScroll: (candidate, scrollTop) => {
        if (this.disposed) return this.rejected('workspace controller is disposed')
        if (!this.validLease(bound, candidate)) return this.rejected('stale editor lease')
        if (!Number.isFinite(scrollTop)) return this.rejected('invalid final scrollTop')
        const view = this.view(candidate.viewId)
        view.scrollObservationEpoch += 1
        if (this.applyReport(candidate.viewId, { scrollTop })) {
          if (this.documentIsCurrent(bound) && !bound.refreshing) this.updateBoundSnapshot(bound)
          this.commit()
        }
        return this.applied()
      },
      flush: async(candidate) =>
        this.enqueue(async() => {
          if (this.hasPreflightForView(candidate.viewId)) return this.rejected('transfer preflight fence is active')
          return this.withLease(bound, candidate, async() => {
            if (await this.applyAdapterFlush(bound, candidate.viewId)) {
              this.updateBoundSnapshot(bound)
            }
          })
        }),
      handoffMode: async(candidate, mode) =>
        this.enqueue(async() =>
          this.withLease(bound, candidate, async() => {
            const view = this.view(candidate.viewId)
            if (await this.applyAdapterFlush(bound, candidate.viewId)) {
              this.updateBoundSnapshot(bound)
              this.commit()
            }
            const nextState = { ...view.state, mode }
            const beforeState = view.state
            view.state = nextState
            try {
              await this.refreshAdapter(
                candidate.paneId,
                this.snapshotFor(candidate.paneId, candidate.viewId)
              )
            } catch (error) {
              view.state = beforeState
              try {
                await this.refreshAdapter(
                  candidate.paneId,
                  this.snapshotFor(candidate.paneId, candidate.viewId)
                )
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
            if (await this.applyAdapterFlush(bound, candidate.viewId)) {
              this.updateBoundSnapshot(bound)
              this.commit()
            }
            await this.refreshAdapter(
              candidate.paneId,
              this.snapshotFor(candidate.paneId, candidate.viewId)
            )
          })
        ),
      dispose: () => this.disposeBinding(bound)
    }
  }

  private async withLease(
    bound: BoundAdapter,
    lease: EditorLease,
    work: () => Promise<void>
  ): Promise<WorkspaceResult> {
    if (this.disposed) return this.rejected('workspace controller is disposed')
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

  private enqueue<T>(work: () => Promise<T>, blocksReports = true): Promise<T> {
    if (blocksReports) this.pendingOperations += 1
    const run = async(): Promise<T> => {
      try {
        return await work()
      } finally {
        if (blocksReports) this.pendingOperations -= 1
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
    if (this.disposed) return this.rejected('workspace controller is disposed')
    try {
      switch (command.kind) {
        case 'new-tab':
          return await this.newTab('left', command.markdown)
        case 'open-document':
          return await this.openDocument(command.document, command.selected, command.replacePristineBlank)
        case 'open-existing-document':
          return await this.openExistingDocument(command.documentId, command.fileKey)
        case 'activate-view':
          return await this.activate(command.paneId, command.viewId, true)
        case 'focus-pane':
          return await this.focus(command.paneId)
        case 'move-to-pane':
          return await this.moveToPane(command.targetPaneId, command.viewId)
        case 'split-right':
          return await this.splitRight(command.paneId, command.viewId)
        case 'set-split-ratio':
          return this.setSplitRatio(command.ratio)
        case 'move-view':
          return await this.move(command.viewId, command.targetPaneId)
        case 'reorder-view':
          return this.reorder(command.paneId, command.viewId, command.beforeViewId)
        case 'close-view':
          return await this.close(command.viewId)
        case 'close-focused-view':
          return await this.closeFocused(command.paneId ?? this.focusedPaneId)
        case 'save':
          return this.requestSave(command.paneId ?? this.focusedPaneId, command.viewId)
        case 'save-as':
          return this.requestSaveAs(
            command.paneId ?? this.focusedPaneId,
            command.fileKey,
            command.title,
            command.viewId
          )
        case 'rename':
          return this.requestRename(
            command.paneId ?? this.focusedPaneId,
            command.fileKey,
            command.title
          )
        case 'set-encoding':
          return this.setDocumentOption(command.paneId ?? this.focusedPaneId, (document) => {
            document.encoding = clone(command.encoding)
          })
        case 'set-line-ending':
          return this.setDocumentOption(command.paneId ?? this.focusedPaneId, (document) => {
            document.lineEnding = command.lineEnding
          })
        case 'set-adjust-line-ending-on-save':
          return this.setDocumentOption(command.paneId ?? this.focusedPaneId, (document) => {
            document.adjustLineEndingOnSave = command.adjustLineEndingOnSave
          })
        case 'set-trailing-newline':
          return this.setDocumentOption(command.paneId ?? this.focusedPaneId, (document) => {
            document.trailingNewline = command.trailingNewline
          })
        case 'commit-authorized':
          return await this.commitAuthorized(command.capability)
        case 'apply-document-io-bind':
          return this.applyDocumentIoBind(command)
        case 'apply-save-ack':
          return this.applySaveAck(command.ack)
        case 'replace-warnings':
          return this.replaceWarnings(command.warnings)
        case 'reload-document':
          return await this.reloadDocument(command)
        case 'mark-document-missing':
          return this.markDocumentMissing(command.documentId)
      }
    } catch (error) {
      return this.failed(errorMessage(error))
    }
  }

  private async newTab(paneId: PaneId, markdown?: string): Promise<WorkspaceResult> {
    const pane = this.panes.get(paneId)
    if (!pane) return this.rejected('missing pane')
    await this.flushPane(paneId)
    const doc = this.makeDocument({ markdown })
    const view = this.makeView(doc.id, { mode: this.modeForNewView(pane) })
    const cleanSurfaceReport = await this.refreshAdapter(
      paneId,
      this.snapshotForRecord(paneId, view, doc)
    )
    this.documents.set(doc.id, doc)
    this.views.set(view.id, view)
    pane.viewIds.push(view.id)
    pane.activeViewId = view.id
    this.focusedPaneId = paneId
    if (cleanSurfaceReport) {
      const bound = this.adapters.get(paneId)
      if (bound) this.acceptCleanSurfaceReport(bound, view.id, cleanSurfaceReport)
    }
    this.commit()
    return this.applied()
  }

  private async openDocument(
    input: WorkspaceDocumentInput,
    selected: boolean = true,
    replacePristineBlank: boolean = false
  ): Promise<WorkspaceResult> {
    if (input.fileKey) {
      const existing = [...this.documents.values()].find(
        (document) => document.fileKey === input.fileKey
      )
      if (existing) {
        return this.openExistingDocument(existing.id, input.fileKey)
      }
    }
    const pane = this.requirePane('left')
    await this.flushPane(pane.id)
    let replaceableBlankViewId: ViewId | undefined
    if (selected && replacePristineBlank) {
      const activeView = this.views.get(pane.activeViewId)
      const activeDocument = activeView && this.documents.get(activeView.documentId)
      if (activeDocument && !activeDocument.fileKey && !activeDocument.dirty && !activeDocument.markdown.trim()) {
        replaceableBlankViewId = activeView.id
      }
    }
    const doc = this.makeDocument(input)
    const view = this.makeView(doc.id, { mode: this.modeForNewView(pane), ...input.view })
    const cleanSurfaceReport = selected
      ? await this.refreshAdapter(pane.id, this.snapshotForRecord(pane.id, view, doc))
      : undefined
    if (replaceableBlankViewId) {
      pane.viewIds = pane.viewIds.filter((viewId) => viewId !== replaceableBlankViewId)
      this.removeDocumentAndView(replaceableBlankViewId)
    }
    this.documents.set(doc.id, doc)
    this.views.set(view.id, view)
    pane.viewIds.push(view.id)
    if (selected) pane.activeViewId = view.id
    if (selected) this.focusedPaneId = 'left'
    if (cleanSurfaceReport) {
      const bound = this.adapters.get(pane.id)
      if (bound) this.acceptCleanSurfaceReport(bound, view.id, cleanSurfaceReport)
    }
    this.commit()
    return this.applied()
  }

  private async openExistingDocument(documentId: DocumentId, fileKey: FileKey): Promise<WorkspaceResult> {
    const document = this.documents.get(documentId)
    if (!document || document.fileKey !== fileKey) return this.rejected('the requested document was closed or renamed before reopening')
    const leftViewId = this.requirePane('left').viewIds.find(id => this.view(id).documentId === documentId)
    if (leftViewId) return this.activate('left', leftViewId, true)
    return this.move(this.requireViewForDocument(documentId).id, 'left')
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

  private async splitRight(paneId: PaneId, viewId: ViewId): Promise<WorkspaceResult> {
    const source = this.panes.get(paneId)
    if (paneId !== 'left' || !source?.viewIds.includes(viewId)) return this.rejected('Split Right requires a left-pane tab')
    if (this.hasPreflightForView(viewId)) return this.rejected('transfer preflight fence is active')
    await this.flushPane('left')
    const original = this.view(viewId)
    const right = this.panes.get('right')
    const existing = right?.viewIds.find(id => this.view(id).documentId === original.documentId)
    if (existing) return this.activate('right', existing, true)
    const view = this.makeView(original.documentId, original.state)
    view.toc = clone(original.toc)
    view.status = clone(original.status)
    if (right) await this.flushAndRefresh('right', () => this.snapshotForRecord('right', view, this.requireDocument(view.documentId)))
    this.views.set(view.id, view)
    this.requireDocument(original.documentId).sharedHistory = true
    const target = right ?? this.createPane('right')
    target.viewIds.push(view.id)
    target.activeViewId = view.id
    this.focusedPaneId = 'right'
    this.commit()
    return this.applied()
  }

  private async moveToPane(targetPaneId: PaneId, viewId?: ViewId): Promise<WorkspaceResult> {
    if (targetPaneId !== 'left' && targetPaneId !== 'right') return this.rejected('invalid pane')
    if (this.panes.size === 2) return this.move(viewId ?? this.requirePane(this.focusedPaneId).activeViewId, targetPaneId)
    const source = this.requirePane('left')
    if (source.viewIds.length < 2) return this.rejected('move requires a remaining tab')
    if (viewId && !source.viewIds.includes(viewId)) return this.rejected('view is not in pane')
    await this.flushPane(source.id)
    const movingId = viewId ?? source.activeViewId
    const remaining = source.viewIds.filter((id) => id !== movingId)
    const sourceId: PaneId = targetPaneId === 'left' ? 'right' : 'left'
    const moved = this.view(movingId)
    const newSourceActive = remaining.includes(source.activeViewId) ? source.activeViewId : this.firstViewId(remaining, 'move source')
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
    this.splitRatio = 0.5
    this.commit()
    return this.applied()
  }

  private async move(viewId: ViewId, targetPaneId: PaneId): Promise<WorkspaceResult> {
    const source = this.paneForView(viewId)
    const target = this.panes.get(targetPaneId)
    if (!source || !target) return this.rejected('missing source or target pane')
    if (source.id === target.id) return this.rejected('view is already in target pane')
    await this.flushPane(source.id)
    const existingId = target.viewIds.find(id => this.view(id).documentId === this.view(viewId).documentId)
    if (existingId) {
      await this.activate(target.id, existingId, true)
      return this.removeView(viewId)
    }
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

  private setSplitRatio(ratio: number): WorkspaceResult {
    if (this.panes.size !== 2) return this.rejected('workspace is not split')
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return this.rejected('invalid split ratio')
    this.splitRatio = ratio
    this.commit()
    return this.applied()
  }

  private reorder(paneId: PaneId, viewId: ViewId, beforeViewId?: ViewId): WorkspaceResult {
    const pane = this.panes.get(paneId)
    if (!pane || !pane.viewIds.includes(viewId)) return this.rejected('view is not in pane')
    if (beforeViewId && !pane.viewIds.includes(beforeViewId)) return this.rejected('before view is not in pane')
    if (viewId === beforeViewId) return this.applied()
    const order = pane.viewIds.filter((id) => id !== viewId)
    const index = beforeViewId ? order.indexOf(beforeViewId) : order.length
    order.splice(index, 0, viewId)
    pane.viewIds = order
    this.commit()
    return this.applied()
  }

  private async close(viewId: ViewId): Promise<WorkspaceResult> {
    const pane = this.paneForView(viewId)
    if (!pane) return this.rejected('missing view')
    if (pane.activeViewId === viewId) await this.flushPane(pane.id)
    const document = this.requireDocument(this.view(viewId).documentId)
    if (document.dirty && !this.hasOtherView(viewId)) return this.needsCloseCapability(viewId, document)
    return this.removeView(viewId)
  }

  private async closeFocused(paneId: PaneId): Promise<WorkspaceResult> {
    const pane = this.panes.get(paneId)
    return pane ? this.close(pane.activeViewId) : this.rejected('missing pane')
  }

  private async commitAuthorized(capability: WorkspaceCapability): Promise<WorkspaceResult> {
    const stored = this.capabilities.get(capability)
    if (!stored || stored.used || capability.action !== 'close-view') {
      return this.rejected('stale or invalid capability')
    }
    const view = this.views.get(stored.viewId)
    const document = this.documents.get(stored.documentId)
    if (
      !view ||
      !document ||
      document.revision !== stored.documentRevision ||
      document.ownerFence !== stored.ownerFence
    ) {
      return this.rejected('stale capability target')
    }
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

  getFacadeSnapshot(): WorkspaceFacadeSnapshot {
    const projection = this.getProjection()
    const documents = [...this.views.values()].map((view) => {
      const document = this.requireDocument(view.documentId)
      return {
        viewId: view.id,
        documentId: document.id,
        ...(document.fileKey ? { fileKey: document.fileKey } : {}),
        ...(document.observedDiskRevision !== undefined ? { observedDiskRevision: document.observedDiskRevision } : {}),
        documentRevision: document.revision,
        title: document.title,
        markdown: document.markdown,
        portableHistory: clone(document.history),
        dirty: document.dirty,
        conflict: document.conflict,
        encoding: clone(document.encoding),
        lineEnding: document.lineEnding,
        adjustLineEndingOnSave: document.adjustLineEndingOnSave,
        trailingNewline: document.trailingNewline,
        cursor: clone(view.state.cursor),
        selection: clone(view.state.selection),
        scrollTop: view.state.scrollTop,
        mode: view.state.mode,
        toc: clone(view.toc),
        status: clone(view.status)
      }
    })
    return freeze({ projection, documents })
  }

  /**
   * The main process alone issues a live owner fence.  Assembly supplies the
   * old local fence from the current binding snapshot, so a late bind cannot
   * replace a newer document incarnation.
   */
  private applyDocumentIoBind(command: Extract<WorkspaceCommand, { kind: 'apply-document-io-bind' }>): WorkspaceResult {
    const document = this.documents.get(command.documentId)
    if (
      !document ||
      document.revision !== command.documentRevision ||
      document.ownerFence !== command.previousOwnerFence
    ) {
      return this.rejected('stale document I/O bind acknowledgement')
    }
    document.ownerFence = command.ownerFence
    document.observedDiskRevision = command.observedDiskRevision
    for (const bound of this.adapters.values()) {
      if (bound.snapshot?.documentId === document.id && this.documentIsCurrent(bound)) this.updateBoundSnapshot(bound)
    }
    this.commit()
    return this.applied()
  }

  /** T04b owns CAS and landed revisions; renderer accepts only its current ACK once. */
  private applySaveAck(ack: DocumentSaveAck): WorkspaceResult {
    if (ack.status === 'bound' || ack.status === 'unbound') {
      return this.rejected('stale document save acknowledgement')
    }
    const pending = this.pendingDocumentIo.get(ack.requestId)
    const document = this.documents.get(ack.documentId)
    if (
      !pending ||
      pending.request.documentId !== ack.documentId ||
      (pending.request.ownerFence !== undefined && pending.request.ownerFence !== ack.ownerFence) ||
      !document ||
      (pending.request.ownerFence !== undefined && document.ownerFence !== ack.ownerFence) ||
      (ack.status === 'durable-success' && ack.ownerFence === undefined)
    ) {
      return this.rejected('stale document save acknowledgement')
    }
    if (
      ack.status === 'durable-success' &&
      (pending.request.documentRevision !== ack.documentRevision ||
        document.revision !== ack.documentRevision)
    ) {
      return this.rejected('stale document save acknowledgement')
    }
    this.pendingDocumentIo.delete(ack.requestId)
    if (ack.status === 'conflict') {
      document.conflict = true
      this.commit()
      return this.failed('document I/O reported a conflict')
    }
    if (ack.status !== 'durable-success') {
      return this.failed('document I/O did not durably complete')
    }
    if (!this.isFileKeyAvailable(pending.targetFileKey, document.id, ack.requestId)) {
      return this.rejected('document file key is no longer available')
    }
    if (pending.request.kind !== 'save') {
      document.fileKey = pending.targetFileKey
      document.title = pending.targetTitle
    }
    if (pending.request.ownerFence === undefined) document.ownerFence = ack.ownerFence!
    if (ack.observedDiskRevision !== undefined) document.observedDiskRevision = ack.observedDiskRevision
    if (document.markdown !== document.savedMarkdown) {
      // Text saved from WYSIWYG is already the engine's serialization.
      document.canonicalBaseline = document.sourceEdited ? undefined : document.markdown
    }
    document.dirty = false
    document.sourceEdited = false
    document.savedMarkdown = document.markdown
    document.conflict = false
    for (const bound of this.adapters.values()) {
      if (bound.snapshot?.documentId === document.id && this.documentIsCurrent(bound)) this.updateBoundSnapshot(bound)
    }
    this.commit()
    return this.applied()
  }

  private async requestSave(paneId: PaneId, viewId?: ViewId): Promise<WorkspaceResult> {
    if (viewId === undefined || this.panes.get(paneId)?.activeViewId === viewId) {
      await this.flushPane(paneId)
    }
    const document = this.documentForPane(paneId, viewId)
    if (!document) return this.rejected('missing pane')
    if (!document.fileKey) return this.rejected('save requires a canonical file key')
    return this.requestDocumentIo('save', document, document.fileKey)
  }

  private async requestSaveAs(
    paneId: PaneId,
    fileKey: string,
    title?: string,
    viewId?: ViewId
  ): Promise<WorkspaceResult> {
    if (viewId === undefined || this.panes.get(paneId)?.activeViewId === viewId) {
      await this.flushPane(paneId)
    }
    const document = this.documentForPane(paneId, viewId)
    if (!document) return this.rejected('missing pane')
    return this.requestDocumentIo('save-as', document, fileKey, title)
  }

  private requestRename(paneId: PaneId, fileKey: string, title?: string): WorkspaceResult {
    const document = this.documentForPane(paneId)
    if (!document?.fileKey) return this.rejected('rename requires a canonical file key')
    return this.requestDocumentIo('rename', document, fileKey, title)
  }

  private requestDocumentIo(
    operation: DocumentIoSaveRequest['kind'],
    document: DocumentRecord,
    fileKey: string,
    title = document.title
  ): WorkspaceResult {
    if (document.conflict) return this.rejected('document conflict requires a decision')
    if (!this.isFileKeyAvailable(fileKey, document.id)) {
      return this.rejected('document file key is already in use')
    }
    for (const [requestId, pending] of this.pendingDocumentIo) {
      if (pending.request.documentId === document.id) this.pendingDocumentIo.delete(requestId)
    }
    const request: DocumentIoSaveRequest = freeze({
      requestId: `document-io-${this.nextDocumentIoRequest++}`,
      kind: operation,
      documentId: document.id,
      documentRevision: document.revision,
      ...(operation === 'save-as' && !document.fileKey ? {} : { ownerFence: document.ownerFence }),
      markdown: document.markdown,
      options: {
        encoding: clone(document.encoding),
        lineEnding: document.lineEnding,
        adjustLineEndingOnSave: document.adjustLineEndingOnSave
      },
      ...(operation === 'save' ? {} : { targetPathname: fileKey })
    })
    this.pendingDocumentIo.set(request.requestId, {
      request,
      targetFileKey: fileKey,
      targetTitle: title
    })
    return {
      status: 'applied',
      workspaceRevision: this.workspaceRevision,
      documentIoRequest: request
    }
  }

  private setDocumentOption(
    paneId: PaneId,
    set: (document: DocumentRecord) => void
  ): WorkspaceResult {
    const document = this.documentForPane(paneId)
    if (!document) return this.rejected('missing pane')
    const currentBindings = [...this.adapters.values()].filter(bound =>
      bound.snapshot?.documentId === document.id && this.documentIsCurrent(bound)
    )
    set(document)
    document.dirty = true
    document.revision += 1
    for (const bound of currentBindings) this.updateBoundSnapshot(bound)
    this.commit()
    return this.applied()
  }

  private async reloadDocument(
    command: Extract<WorkspaceCommand, { kind: 'reload-document' }>
  ): Promise<WorkspaceResult> {
    const document = this.documents.get(command.documentId)
    if (!document) return this.rejected('missing document')
    document.markdown = command.markdown
    document.savedMarkdown = command.markdown
    document.canonicalBaseline = undefined
    document.sourceEdited = false
    document.dirty = false
    document.conflict = false
    document.encoding = clone(command.encoding)
    document.lineEnding = command.lineEnding
    document.adjustLineEndingOnSave = command.adjustLineEndingOnSave
    document.trailingNewline = command.trailingNewline
    document.revision += 1
    document.reloadSerial += 1
    // Refresh without flushing: a flush would write the editors' outgoing
    // content back over the reloaded document.
    for (const [paneId, bound] of this.adapters) {
      if (bound.snapshot?.documentId !== document.id) continue
      await this.refreshAdapter(paneId, this.snapshotFor(paneId, this.requirePane(paneId).activeViewId))
    }
    this.commit()
    return this.applied()
  }

  private markDocumentMissing(documentId: DocumentId): WorkspaceResult {
    const document = this.documents.get(documentId)
    if (!document) return this.rejected('missing document')
    const currentBindings = [...this.adapters.values()].filter(bound =>
      bound.snapshot?.documentId === document.id && this.documentIsCurrent(bound)
    )
    document.dirty = true
    document.revision += 1
    for (const bound of currentBindings) this.updateBoundSnapshot(bound)
    this.commit()
    return this.applied()
  }

  private documentForPane(paneId: PaneId, viewId?: ViewId): DocumentRecord | undefined {
    const pane = this.panes.get(paneId)
    if (!pane) return undefined
    const targetViewId = viewId ?? pane.activeViewId
    return pane.viewIds.includes(targetViewId)
      ? this.documents.get(this.view(targetViewId).documentId)
      : undefined
  }

  /** A FileKey belongs to at most one Document and one current request. */
  private isFileKeyAvailable(fileKey: string, documentId: DocumentId, exceptRequestId?: string): boolean {
    if (
      [...this.documents.values()].some(
        (candidate) => candidate.id !== documentId && candidate.fileKey === fileKey
      )
    ) {
      return false
    }
    return ![...this.pendingDocumentIo].some(
      ([requestId, pending]) =>
        requestId !== exceptRequestId &&
        pending.request.documentId !== documentId &&
        pending.targetFileKey === fileKey
    )
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
      const replacement = this.makeView(clean.id, { mode: this.modeForNewView(pane) })
      await this.flushAndRefresh(pane.id, () => this.snapshotForRecord(pane.id, replacement, clean))
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
    // Vue keeps the component keyed as `left` when a two-pane projection
    // collapses. Keep that mounted composition as the controller binding too;
    // remapping the surviving right adapter would let its unmount dispose the
    // adapter that the new left projection still names.
    const adapter = this.adapters.get('left') ?? this.adapters.get(survivor.id)
    const adapterPaneId = this.adapters.get('left') === adapter ? 'left' : survivor.id
    if (this.adapters.has(survivor.id)) {
      await this.flushPane(survivor.id)
    }
    if (adapter) {
      const view = this.view(activeViewId)
      const document = this.requireDocument(view.documentId)
      await this.refreshAdapter(adapterPaneId, this.snapshotForRecord('left', view, document))
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
      const viewId = this.requirePane(paneId).activeViewId
      if (await this.applyAdapterFlush(bound, viewId)) {
        this.updateBoundSnapshot(bound)
        this.commit()
      }
    } catch (error) {
      this.invalidate(bound)
      throw error
    }
  }

  private async captureTransferSource(paneId: PaneId, tabId: string): Promise<TransferSourceSnapshot | undefined> {
    const pane = this.panes.get(paneId)
    const viewId = pane?.viewIds.find(id => id === tabId || this.views.get(id)?.documentId === tabId)
    if (!pane || !viewId || this.hasOtherView(viewId)) return undefined
    await this.flushPane(paneId)
    const view = this.views.get(viewId)
    if (!view) return undefined
    const document = this.documents.get(view.documentId)
    if (!document) return undefined
    return {
      documentId: document.id,
      viewId,
      sourceLineage: `lineage:${document.id}:${document.ownerFence}`,
      documentRevision: document.revision,
      isLastSourceTab: pane.viewIds.length === 1,
      ...(document.fileKey ? { fileKey: document.fileKey } : {}),
      ...(document.observedDiskRevision !== undefined ? { observedDiskRevision: document.observedDiskRevision } : {}),
      title: document.title,
      markdown: document.markdown,
      dirty: document.dirty,
      conflict: document.conflict,
      history: clone(document.history),
      view: clone(view.state)
    }
  }

  private preflightKey(preflightId: string): string { return `preflight:${preflightId}` }

  private hasPreflightForView(viewId: ViewId): boolean {
    return [...this.transferFences.values()].some(fence => fence.preflightId && fence.viewId === viewId)
  }

  private async applyAdapterFlush(bound: BoundAdapter, viewId: ViewId): Promise<boolean> {
    if (!this.documentIsCurrent(bound)) {
      const pane = this.paneForView(viewId)
      if (pane) await this.refreshAdapter(pane.id, this.snapshotFor(pane.id, viewId))
      return false
    }
    const scrollObservationEpoch = this.view(viewId).scrollObservationEpoch
    const report = await bound.adapter.flush()
    const changed = this.applyReport(viewId, report, scrollObservationEpoch)
    if (changed) this.refreshSharedEditors(bound)
    return changed
  }

  private documentIsCurrent(bound: BoundAdapter): boolean {
    const snapshot = bound.snapshot
    return !!snapshot && this.documents.get(snapshot.documentId)?.revision === snapshot.documentRevision
  }

  /** A stale peer never flushes its old markdown/history over the shared document. */
  private refreshSharedEditors(origin: BoundAdapter): void {
    const documentId = origin.snapshot?.documentId
    for (const [paneId, bound] of this.adapters) {
      if (bound === origin || bound.snapshot?.documentId !== documentId || this.documentIsCurrent(bound)) continue
      this.enqueue(async() => {
        if (this.adapters.get(paneId) !== bound || bound.snapshot?.documentId !== documentId || this.documentIsCurrent(bound)) return
        try {
          const viewId = this.requirePane(paneId).activeViewId
          const scrollObservationEpoch = this.view(viewId).scrollObservationEpoch
          // This peer is stale by definition: capture only its View-local live
          // scroll, never its old document, history, cursor, or selection data.
          const { scrollTop } = await bound.adapter.flush()
          if (Number.isFinite(scrollTop)) {
            this.applyReport(viewId, { scrollTop }, scrollObservationEpoch)
          }
          await this.refreshAdapter(paneId, this.snapshotFor(paneId, viewId))
          this.commit()
        } catch {
          this.invalidate(bound)
        }
      }, false)
    }
  }

  /** Assembly-only document ownership snapshots, one per document (not per surface). */
  getDocumentSnapshots(): readonly EditorBindingSnapshot[] {
    return [...this.documents.values()].map(document => {
      const view = this.requireViewForDocument(document.id)
      return this.snapshotFor(this.requirePaneForView(view.id).id, view.id)
    })
  }

  hasOtherView(viewId: ViewId): boolean {
    const view = this.views.get(viewId)
    return !!view && [...this.views.values()].some(candidate => candidate.id !== viewId && candidate.documentId === view.documentId)
  }

  usesSharedHistory(viewId: ViewId): boolean {
    const view = this.views.get(viewId)
    return !!view && !!this.documents.get(view.documentId)?.sharedHistory
  }

  private revokeTransferFencesForView(viewId: ViewId): void {
    for (const [transferId, fence] of this.transferFences) {
      if (fence.viewId === viewId) this.transferFences.delete(transferId)
    }
  }

  private async refreshAdapter(
    paneId: PaneId,
    snapshot: EditorBindingSnapshot
  ): Promise<EditorReport | undefined> {
    const bound = this.adapters.get(paneId)
    if (!bound) return
    const pane = this.panes.get(paneId)
    const previous = pane?.activeViewId ? this.snapshotFor(paneId, pane.activeViewId) : undefined
    bound.refreshing = true
    try {
      // A lease names a concrete active pane/view/mode; any controller-driven
      // activation replaces that binding, so the old lease must be inert.
      this.invalidate(bound)
      const lease = this.issueLease(bound, snapshot.paneId, snapshot.viewId, snapshot.view.mode)
      const current = this.snapshotWithLease(snapshot, lease)
      // Publish this identity before the surface callback can activate it, and
      // revoke it again on any failed staging path below. A delayed/stale scope
      // cannot obtain a successor by reconstructing this JSON shape because
      // both the lease object and this snapshot identity are controller-private.
      bound.snapshot = current
      await bound.adapter.refresh(current)
      if (!snapshot.document.dirty) {
        const report = await bound.adapter.flush()
        const document = this.documents.get(snapshot.documentId)
        if (!document) return report
        this.acceptCleanSurfaceReport(bound, snapshot.viewId, report)
      }
    } catch (error) {
      // An adapter may report failure after it has staged a snapshot. Restore
      // the controller's still-current binding before releasing its lease.
      if (previous) {
        try {
          await this.restoreAdapterSnapshot(bound, previous)
        } catch {
          // The adapter is no longer trusted either way; its lease stays dead.
        }
      }
      this.invalidate(bound)
      throw error
    } finally {
      bound.refreshing = false
    }
  }

  private acceptCleanSurfaceReport(
    bound: BoundAdapter,
    viewId: ViewId,
    report: EditorReport
  ): void {
    const view = this.views.get(viewId)
    const document = view && this.documents.get(view.documentId)
    if (!document || document.dirty) return
    const { markdown, ...rest } = report
    // A clean refresh records the engine's serialization as the comparison
    // baseline; the document keeps the text it was loaded or saved with.
    const changedBaseline =
      markdown !== undefined &&
      view.state.mode !== 'source' &&
      markdown !== document.canonicalBaseline
    if (changedBaseline) document.canonicalBaseline = markdown
    const cursor = markdown !== undefined
      ? mapIndexCursor(rest.cursor, markdown, document.markdown)
      : rest.cursor
    if (this.applyReport(viewId, { ...rest, cursor }) || changedBaseline) {
      this.updateBoundSnapshot(bound)
      this.refreshSharedEditors(bound)
    }
  }

  private async flushAndRefresh(
    paneId: PaneId,
    snapshot: () => EditorBindingSnapshot
  ): Promise<void> {
    await this.flushPane(paneId)
    await this.refreshAdapter(paneId, snapshot())
  }

  private applyReport(
    viewId: ViewId,
    report: EditorReport,
    scrollObservationEpoch?: number
  ): boolean {
    const view = this.view(viewId)
    const document = this.requireDocument(view.documentId)
    let changedDocument = false
    if (report.markdown !== undefined) {
      const fromSource = view.state.mode === 'source'
      if (
        !fromSource &&
        !document.sourceEdited &&
        document.canonicalBaseline !== undefined &&
        sameDirtyContent(report.markdown, document.canonicalBaseline)
      ) {
        if (document.markdown !== document.savedMarkdown || document.dirty) {
          document.markdown = document.savedMarkdown
          document.dirty = false
          changedDocument = true
        }
      } else if (report.markdown !== document.markdown) {
        document.markdown = report.markdown
        document.dirty = !sameDirtyContent(document.markdown, document.savedMarkdown)
        document.sourceEdited = document.dirty && (fromSource || document.sourceEdited)
        changedDocument = true
      }
    }
    if (report.portableHistory !== undefined) {
      const nextHistory = clone(report.portableHistory)
      if (JSON.stringify(document.history) !== JSON.stringify(nextHistory)) {
        document.history = nextHistory
        changedDocument = true
      }
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
    // A caret reported in the engine's serialization must address the text the
    // document keeps, which Source mode displays.
    const cursor = report.markdown !== undefined
      ? mapIndexCursor(report.cursor, report.markdown, document.markdown)
      : report.cursor
    const acceptsScroll =
      scrollObservationEpoch === undefined ||
      scrollObservationEpoch === view.scrollObservationEpoch
    const acceptsChangedScroll =
      acceptsScroll &&
      report.scrollTop !== undefined &&
      !Object.is(view.state.scrollTop, report.scrollTop)
    const nextState = {
      ...view.state,
      ...(cursor ? { cursor: clone(cursor) } : {}),
      ...(report.selection !== undefined ? { selection: clone(report.selection) } : {}),
      ...(acceptsScroll && report.scrollTop !== undefined ? { scrollTop: report.scrollTop } : {})
    }
    const changedView = JSON.stringify(view.state) !== JSON.stringify(nextState)
    if (acceptsChangedScroll) this.revokeTransferFencesForView(viewId)
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
    // This is an internal staging snapshot. refreshAdapter replaces the
    // detached lease with a current controller-issued generation before the
    // snapshot can reach a concrete editor surface.
    const detachedLease = freeze({ paneId, viewId: view.id, mode: state.mode })
    return freeze({
      paneId,
      documentId: document.id,
      viewId: view.id,
      lease: detachedLease,
      documentRevision: document.revision,
      workspaceRevision: this.workspaceRevision,
      document: {
        documentId: document.id,
        ...(document.fileKey ? { fileKey: document.fileKey } : {}),
        ...(document.observedDiskRevision !== undefined ? { observedDiskRevision: document.observedDiskRevision } : {}),
        ownerFence: document.ownerFence,
        markdown: document.markdown,
        dirty: document.dirty,
        conflict: document.conflict,
        documentRevision: document.revision,
        portableHistory: clone(document.history),
        title: document.title,
        encoding: clone(document.encoding),
        lineEnding: document.lineEnding,
        adjustLineEndingOnSave: document.adjustLineEndingOnSave,
        trailingNewline: document.trailingNewline,
        ...(document.reloadSerial ? { reloadSerial: document.reloadSerial } : {}),
        ...(document.canonicalBaseline !== undefined && !document.dirty
          ? { canonicalMarkdown: document.canonicalBaseline }
          : {})
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
      ...(input.observedDiskRevision !== undefined ? { observedDiskRevision: input.observedDiskRevision } : {}),
      markdown: input.markdown ?? '',
      savedMarkdown: input.savedMarkdown ?? input.markdown ?? '',
      dirty: input.dirty ?? false,
      conflict: input.conflict ?? false,
      revision: input.documentRevision ?? 0,
      history: clone(input.portableHistory ?? EMPTY_HISTORY),
      title: input.title ?? input.fileKey?.split(/[\\/]/).pop() ?? 'New Tab',
      encoding: clone(input.encoding ?? DEFAULT_ENCODING),
      lineEnding: input.lineEnding ?? 'lf',
      adjustLineEndingOnSave: input.adjustLineEndingOnSave ?? false,
      trailingNewline: input.trailingNewline ?? 'preserve',
      ownerFence: `owner-${id}-${this.nextId++}`,
      sharedHistory: false,
      sourceEdited: false,
      reloadSerial: 0
    }
  }

  // Opening a document keeps the editing mode the pane is showing, as the
  // single window-wide Source mode toggle did before views had their own mode.
  private modeForNewView(pane: PaneRecord): EditorMode {
    return this.views.get(pane.activeViewId)?.state.mode ?? EMPTY_VIEW.mode
  }

  private makeView(documentId: DocumentId, state: Partial<ViewState> = {}): ViewRecord {
    return {
      id: `view-${this.nextId++}`,
      documentId,
      state: { ...clone(EMPTY_VIEW), ...clone(state) },
      scrollObservationEpoch: 0,
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
    const view = this.makeView(document.id, input.view)
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
    if ([...this.views.values()].some(candidate => candidate.documentId === view.documentId)) return
    for (const [requestId, pending] of this.pendingDocumentIo) {
      if (pending.request.documentId === view.documentId) this.pendingDocumentIo.delete(requestId)
    }
    this.documents.delete(view.documentId)
  }

  private needsCloseCapability(viewId: ViewId, document: DocumentRecord): WorkspaceResult {
    const capability = freeze({ action: 'close-view' as const })
    this.capabilities.set(capability, {
      viewId,
      documentId: document.id,
      documentRevision: document.revision,
      ownerFence: document.ownerFence,
      used: false
    })
    return { status: 'needs-decision', capability: freeze(capability) }
  }

  private validLease(bound: BoundAdapter, lease: EditorLease): boolean {
    return bound.lease === lease && this.leases.has(lease)
  }

  private async restoreAdapterSnapshot(
    bound: BoundAdapter,
    snapshot: EditorBindingSnapshot
  ): Promise<void> {
    this.invalidate(bound)
    const lease = this.issueLease(bound, snapshot.paneId, snapshot.viewId, snapshot.view.mode)
    const restored = this.snapshotWithLease(snapshot, lease)
    bound.snapshot = restored
    await bound.adapter.refresh(restored)
  }

  private validSnapshot(bound: BoundAdapter, snapshot: EditorBindingSnapshot): boolean {
    const view = this.views.get(snapshot.viewId)
    const document = view ? this.documents.get(view.documentId) : undefined
    return (
      this.adapters.get(snapshot.paneId) === bound &&
      bound.snapshot === snapshot &&
      bound.snapshot.workspaceRevision === snapshot.workspaceRevision &&
      this.validLease(bound, snapshot.lease) &&
      (!view || view.documentId === snapshot.documentId) &&
      (!document || document.revision === snapshot.documentRevision) &&
      (!document || document.ownerFence === snapshot.document.ownerFence) &&
      snapshot.documentId === snapshot.document.documentId &&
      snapshot.documentRevision === snapshot.document.documentRevision &&
      snapshot.paneId === snapshot.lease.paneId &&
      snapshot.viewId === snapshot.lease.viewId &&
      snapshot.view.mode === snapshot.lease.mode
    )
  }

  private updateBoundSnapshot(bound: BoundAdapter): void {
    const lease = bound.lease
    if (!lease || !this.validLease(bound, lease)) return
    bound.snapshot = this.snapshotWithLease(this.snapshotFor(lease.paneId, lease.viewId), lease)
  }

  private updateBoundViewSnapshot(bound: BoundAdapter, viewId: ViewId): void {
    const lease = bound.lease
    const snapshot = bound.snapshot
    if (
      !lease ||
      !snapshot ||
      !this.validLease(bound, lease) ||
      lease.viewId !== viewId ||
      snapshot.viewId !== viewId
    ) return
    bound.snapshot = freeze({
      ...snapshot,
      workspaceRevision: this.workspaceRevision,
      view: clone(this.view(viewId).state)
    })
  }

  private disposeBinding(bound: BoundAdapter): void {
    for (const [paneId, candidate] of this.adapters) {
      if (candidate === bound) {
        this.adapters.delete(paneId)
        this.invalidate(bound)
        bound.adapter.dispose?.()
        return
      }
    }
  }

  private invalidate(bound: BoundAdapter): void {
    if (bound.lease) this.leases.delete(bound.lease)
    bound.lease = undefined
    bound.snapshot = undefined
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

  private snapshotWithLease(
    snapshot: EditorBindingSnapshot,
    lease: EditorLease
  ): EditorBindingSnapshot {
    return freeze({
      ...snapshot,
      documentId: snapshot.document.documentId,
      lease,
      documentRevision: snapshot.document.documentRevision,
      workspaceRevision: this.workspaceRevision
    })
  }

  private commitViewState(bound: BoundAdapter, viewId: ViewId): void {
    this.workspaceRevision += 1
    this.updateBoundViewSnapshot(bound, viewId)
    const update = freeze({
      kind: 'view-state' as const,
      viewId,
      view: clone(this.view(viewId).state)
    })
    this.notify(update)
  }

  private commit(): void {
    this.workspaceRevision += 1
    this.notify()
  }

  private notify(update?: WorkspaceViewStateUpdate): void {
    const projection = this.getProjection()
    for (const listener of this.listeners) {
      try {
        listener(projection, update)
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
