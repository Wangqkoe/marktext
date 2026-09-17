import type {
  EditorBindingSnapshot,
  EditorReport,
  PaneEditorBinding,
  PaneId,
  WorkspaceDocumentInput,
  WorkspaceResult,
  WorkspaceCommand,
  DocumentIoObservation,
  DocumentIoPort,
  TrailingNewlinePolicy
} from '@shared/workspace'
import type { DocumentIoReadOptions, DocumentIoReadResult } from '@shared/workspace/documentIo'
import type { IFileState } from '@shared/types/files'
import { createWorkspaceRuntime, type WorkspaceController } from './controller'
import {
  PaneEditorLeaseReporter,
  RendererPaneEditorAdapter,
  type PaneEditorEventScope,
  type PaneEditorSurface
} from './paneEditorAdapter'
import type { EditorMode } from '@shared/workspace'
import { createElectronDocumentIoPort, RendererDocumentIoAdapter } from './documentIO'
import { createElectronCrashDraftPort } from './crashDraft'

export interface LegacyPaneSeed {
  readonly id: string
  readonly markdown: string
  readonly title: string
  readonly fileKey?: string
  readonly mode?: EditorMode
}

export interface PaneEditorCompositionOptions {
  readonly paneId: PaneId
  /** T03 supplies one controller to independently mounted pane compositions. */
  readonly controller?: WorkspaceController
  /** T04b production transport; tests may inject a deterministic port. */
  readonly documentIoPort?: DocumentIoPort
}

// Documents outlive mounted panes. Both views share one IO fence, save queue,
// and crash-draft receipt, including while either view is inactive or unmounted.
const createPersistence = () => ({
  members: new Set<PaneEditorComposition>(),
  documentIo: undefined as RendererDocumentIoAdapter | undefined,
  pendingDocumentIoBinds: new Set<string>(),
  boundDocumentFences: new Map<string, string>(),
  pendingSaves: new Map<string, Promise<WorkspaceResult>>(),
  crashReceipts: new Map<string, { readonly revision: number; readonly receipt: string }>(),
  crashDraftLineage: new Map<string, string>(),
  crashDraftDispositions: new Map<string, string>(),
  crashDraftTail: Promise.resolve()
})
const persistenceByRuntime = new WeakMap<WorkspaceController, ReturnType<typeof createPersistence>>()

type DiskChangeListener = (observation: DocumentIoObservation) => void
// Keyed by controller rather than pane: one window owns one set of document
// bindings, so each disk change must be handled once even with two panes.
const diskChangeListeners = new WeakMap<WorkspaceController, Set<DiskChangeListener>>()

/** Observe external changes to files bound to this controller's documents. */
export const onWorkspaceDiskChange = (controller: WorkspaceController, listener: DiskChangeListener): (() => void) => {
  const listeners = diskChangeListeners.get(controller) ?? new Set<DiskChangeListener>()
  diskChangeListeners.set(controller, listeners)
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type DiskReadResult = Extract<DocumentIoReadResult, { status: 'read' }>

const diskConflictWarningId = (documentId: string): string => `document-io:${documentId}`

/**
 * The temporary V1 single-pane assembly. It is the only compatibility edge
 * allowed to translate the legacy tab shell into WorkspaceController commands.
 * T03 replaces this composition with its two-pane assembly without changing
 * editor callbacks or the adapter/lease contract.
 */
export class PaneEditorComposition {
  private readonly reporter: PaneEditorLeaseReporter
  private surface: PaneEditorSurface | undefined
  private binding: PaneEditorBinding | undefined
  private adapter: RendererPaneEditorAdapter | undefined
  private runtime: WorkspaceController | undefined
  private sourceReport: { scope: PaneEditorEventScope; report: EditorReport } | undefined
  private sourceReportFlush: Promise<void> | undefined
  private sourceHandoffHandler: ((report: EditorReport) => void) | undefined
  private sourceHistoryHandler: ((report: EditorReport, action?: 'undo' | 'redo') => EditorReport) | undefined
  private readonly paneId: PaneId
  private mountGeneration = 0
  private readonly documentIoPort: DocumentIoPort | undefined
  private persistence = createPersistence()
  private stopDocumentIoSync: (() => void) | undefined
  private modeTransition: Promise<WorkspaceResult> | undefined
  private readonly crashDraft = createElectronCrashDraftPort()
  private stopCrashDraftSync: (() => void) | undefined

  constructor(options: PaneEditorCompositionOptions) {
    this.paneId = options.paneId
    this.reporter = new PaneEditorLeaseReporter(options.paneId)
    this.runtime = options.controller
    this.documentIoPort = options.documentIoPort
  }

  async mount(surface: PaneEditorSurface, seed: LegacyPaneSeed): Promise<void> {
    const mountGeneration = ++this.mountGeneration
    this.surface = surface
    if (!this.runtime) {
      const input: WorkspaceDocumentInput = {
        documentId: seed.id,
        markdown: seed.markdown,
        title: seed.title,
        ...(seed.fileKey ? { fileKey: seed.fileKey } : {})
      }
      this.runtime = createWorkspaceRuntime([input])
    }
    const persistence = persistenceByRuntime.get(this.runtime) ?? this.persistence
    persistenceByRuntime.set(this.runtime, persistence)
    this.persistence = persistence
    persistence.members.add(this)
    const adapter = new RendererPaneEditorAdapter(surface, this.reporter)
    this.adapter = adapter
    let binding: PaneEditorBinding
    try {
      binding = await this.runtime.bindPaneEditor(this.paneId, adapter, () =>
        this.isMountCurrent(mountGeneration, surface, adapter)
      )
    } catch (error) {
      if (!this.isMountCurrent(mountGeneration, surface, adapter)) return
      throw error
    }
    if (!this.isMountCurrent(mountGeneration, surface, adapter)) {
      binding.dispose()
      return
    }
    this.binding = binding
    this.reporter.attach(this.binding)
    this.mountDocumentIo()
    this.stopCrashDraftSync = this.runtime.subscribe(() => { this.syncCrashDraft().catch(() => undefined) })
    this.syncCrashDraft().catch(() => undefined)
    if (seed.mode === 'source') {
      const lease = this.binding.getLease()
      if (lease) await this.binding.handoffMode(lease, 'source')
    }
  }

  unmount(surface: PaneEditorSurface): void {
    if (this.surface !== surface) return
    this.mountGeneration += 1
    this.adapter?.dispose()
    this.adapter = undefined
    this.binding?.dispose()
    this.binding = undefined
    this.reporter.attach(undefined)
    this.stopDocumentIoSync?.()
    this.stopDocumentIoSync = undefined
    this.persistence.members.delete(this)
    if (this.persistence.members.size === 0) {
      this.persistence.pendingDocumentIoBinds.clear()
      this.persistence.boundDocumentFences.clear()
      this.persistence.documentIo?.dispose()
      this.persistence.documentIo = undefined
    }
    this.stopCrashDraftSync?.()
    this.stopCrashDraftSync = undefined
    // A clean marker is only accepted by main after every durable draft has a
    // durable disposition; failed/dirty cases remain recoverable by design.
    this.persistence.crashDraftTail.then(() => this.crashDraft.request({ kind: 'mark-clean' })).catch(() => undefined)
    this.surface = undefined
  }

  /**
   * Move's final target checkpoint joins the pane's existing emergency-draft
   * queue.  It never races a dirty editor's ordinary checkpoint with a second
   * write for the same document revision.
   */
  async hasDurableCrashDraft(documentId: string, documentRevision: number): Promise<boolean> {
    await this.syncCrashDraft()
    await this.persistence.crashDraftTail
    return this.persistence.crashReceipts.get(documentId)?.revision === documentRevision
  }

  private isMountCurrent(
    mountGeneration: number,
    surface: PaneEditorSurface,
    adapter: RendererPaneEditorAdapter
  ): boolean {
    return (
      this.mountGeneration === mountGeneration &&
      this.surface === surface &&
      this.adapter === adapter
    )
  }

  /** Replays the latest source report after a mode transition releases its lease. */
  private flushSourceReport(scope: PaneEditorEventScope): void {
    if (this.sourceReportFlush) return
    const queuedReport = this.sourceReport
    this.sourceReportFlush = scope.flush()
      .catch(() => undefined)
      .then(() => {
        this.sourceReportFlush = undefined
        if (this.sourceReport !== queuedReport && scope === this.reporter.getActiveScope()) {
          this.flushSourceReport(scope)
        }
      })
  }

  getScope(): PaneEditorEventScope | undefined {
    return this.reporter.getActiveScope()
  }

  async flushScopeForAction(scope: PaneEditorEventScope): Promise<PaneEditorEventScope | undefined> {
    const result = await scope.flush()
    const current = this.getScope()
    if (!current || current.paneId !== scope.paneId || current.viewId !== scope.viewId || current.documentId !== scope.documentId || current.mode !== scope.mode) return undefined
    if (current !== scope) {
      // A peer update may renew the binding without changing the clicked view.
      if ((await current.flush()).status !== 'applied') return undefined
    } else if (result.status !== 'applied') return undefined
    return this.getScope() === current ? current : undefined
  }

  /** Move action flushes only the explicit live source view before sealing it. */
  async flushTransferSource(tabId: string): Promise<boolean> {
    const scope = this.getScope()
    if (!scope || (scope.viewId !== tabId && scope.documentId !== tabId)) return false
    return (await scope.flush()).status === 'applied'
  }

  /**
   * Source mode is a child surface of the Muya host. Keep its last report at
   * this composition boundary so the controller's handoff flush cannot read
   * the hidden WYSIWYG document and overwrite a source edit.
   */
  reportSource(scope: PaneEditorEventScope, report: EditorReport): WorkspaceResult {
    const previousReport = this.sourceReport?.scope === scope
      ? this.sourceReport.report
      : undefined
    // Validate the generation before touching the hidden engine's shared undo
    // stack. A superseded CodeMirror callback cannot author a new revision.
    const current = scope.report({})
    if (current.status === 'applied' && this.sourceHistoryHandler && this.runtime?.usesSharedHistory(scope.viewId)) {
      report = this.sourceHistoryHandler(report)
    }
    const result = scope.report(report)
    if (result.status === 'applied') {
      this.sourceReport = { scope, report: { ...previousReport, ...report } }
    } else if (
      result.status === 'rejected' &&
      result.reason === 'workspace mutation is in progress' &&
      scope === this.reporter.getActiveScope() &&
      scope.mode === 'source'
    ) {
      this.sourceReport = { scope, report: { ...previousReport, ...report } }
      this.flushSourceReport(scope)
    }
    return result
  }

  /** Keep Source's live position local until an existing pane command flushes it. */
  observeSourceScroll(scope: PaneEditorEventScope, scrollTop: number): void {
    if (
      !Number.isFinite(scrollTop) ||
      scope !== this.reporter.getActiveScope() ||
      scope.mode !== 'source'
    ) return
    const report = this.sourceReport?.scope === scope ? this.sourceReport.report : {}
    this.sourceReport = { scope, report: { ...report, scrollTop } }
  }

  setSourceHandoffHandler(handler: ((report: EditorReport) => void) | undefined): void {
    this.sourceHandoffHandler = handler
  }

  handoffSource(scope: PaneEditorEventScope): void {
    const pending = this.sourceReport
    if (pending?.scope !== scope || scope !== this.reporter.getActiveScope()) return
    // Vue removes CodeMirror before the controller's queued handoff completes.
    // Apply its already lease-accepted payload synchronously to the Muya host,
    // then let the controller perform the durable mode transition.
    this.sourceHandoffHandler?.(pending.report)
    scope.handoffMode('wysiwyg').catch((error) => {
      console.error('Failed to hand off source pane editor mode:', error)
    })
  }

  sourceReportFor(snapshot: EditorBindingSnapshot): EditorReport | undefined {
    const pending = this.sourceReport
    const result = pending &&
      snapshot.view.mode === 'source' &&
      pending.scope === this.reporter.getActiveScope() &&
      pending.scope.viewId === snapshot.viewId
      ? pending.report
      : undefined
    return result
  }

  isSourceHandoff(snapshot: EditorBindingSnapshot): boolean {
    const pending = this.sourceReport
    return !!(
      pending &&
      snapshot.view.mode === 'wysiwyg' &&
      pending.scope === this.reporter.getActiveScope() &&
      pending.scope.mode === 'source' &&
      pending.scope.viewId === snapshot.viewId
    )
  }

  isMounted(): boolean {
    return this.binding !== undefined && this.surface !== undefined
  }

  handoffMode(mode: EditorMode): Promise<WorkspaceResult> {
    const scope = this.getScope()
    const transition = scope ? scope.handoffMode(mode) : Promise.resolve({ status: 'rejected' as const, reason: 'missing pane scope' })
    this.modeTransition = transition
    return transition
  }

  async scopeForMode(mode: EditorMode, signal?: AbortSignal): Promise<PaneEditorEventScope | undefined> {
    await this.modeTransition
    if (signal?.aborted) return undefined
    const current = this.getScope()
    const scope = current?.mode === mode
      ? current
      : await this.reporter.scopeForMode(mode, signal)
    // A source component can mount before its parent watcher records the
    // controller transition. Activation publishes the lease during that
    // transition, but reports remain rejected until the queue has drained.
    await this.modeTransition
    if (signal?.aborted || scope !== this.getScope() || scope?.mode !== mode) return undefined
    return scope
  }

  private mountDocumentIo(): void {
    if (!this.runtime || !this.binding) return
    const hasProductionPort = typeof window !== 'undefined' && !!window.electron?.ipcRenderer?.invoke
    const port = this.documentIoPort ?? (hasProductionPort ? createElectronDocumentIoPort() : undefined)
    if (!port) return
    const runtime = this.runtime
    this.persistence.documentIo ??= new RendererDocumentIoAdapter(port, (observation) => {
      if (observation.kind === 'conflict') {
        const warning = { id: diskConflictWarningId(observation.documentId), kind: 'conflict' as const, message: 'File changed on disk' }
        runtime.execute({
          kind: 'replace-warnings',
          warnings: [...runtime.getProjection().warnings.filter(current => current.id !== warning.id), warning]
        })
      }
      for (const listener of diskChangeListeners.get(runtime) ?? []) listener(observation)
    })
    this.stopDocumentIoSync = this.runtime.subscribe(() => this.syncDocumentIo())
    this.syncDocumentIo()
  }

  private syncDocumentIo(): void {
    const runtime = this.runtime
    const documentIo = this.persistence.documentIo
    if (!runtime || !documentIo) return
    const snapshots = runtime.getDocumentSnapshots()
    for (const [documentId, ownerFence] of this.persistence.boundDocumentFences) {
      if (!snapshots.some(snapshot => snapshot.documentId === documentId)) {
        this.persistence.boundDocumentFences.delete(documentId)
        documentIo.unbind(documentId, ownerFence)
      }
    }

    for (const snapshot of snapshots) this.syncDocumentIoSnapshot(snapshot)
  }

  setSourceHistoryHandler(handler: ((report: EditorReport, action?: 'undo' | 'redo') => EditorReport) | undefined): void {
    this.sourceHistoryHandler = handler
  }

  async sharedSourceHistory(action: 'undo' | 'redo'): Promise<boolean> {
    const captured = this.getScope()
    if (!captured || captured.mode !== 'source' || !this.sourceHistoryHandler || !this.runtime?.usesSharedHistory(captured.viewId)) return false
    const scope = await this.flushScopeForAction(captured)
    if (!scope) return true
    const report = this.sourceHistoryHandler({}, action)
    if (scope.report(report).status === 'applied') this.sourceReport = { scope, report }
    await scope.flush()
    return true
  }

  private syncDocumentIoSnapshot(snapshot: EditorBindingSnapshot): void {
    const runtime = this.runtime!
    const documentIo = this.persistence.documentIo!
    const document = snapshot.document
    if (!document.fileKey) return
    const existing = documentIo.getBinding(document.ownerFence)
    if (existing) {
      documentIo.sync({
        kind: 'sync',
        requestId: `sync:${document.documentId}:${document.documentRevision}`,
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        ownerFence: document.ownerFence,
        dirty: document.dirty
      })
      return
    }
    if (this.persistence.pendingDocumentIoBinds.has(document.documentId)) return
    this.persistence.pendingDocumentIoBinds.add(document.documentId)
    const previousOwnerFence = document.ownerFence
    let retryCurrentRevision = false
    documentIo
      .bind({
        kind: 'bind',
        requestId: `bind:${document.documentId}:${document.documentRevision}`,
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        pathname: document.fileKey,
        dirty: document.dirty
      })
      .then(async(ack) => {
        if (ack.status !== 'bound' || this.persistence.members.size === 0) return
        const result = await runtime.execute({
          kind: 'apply-document-io-bind',
          documentId: document.documentId,
          documentRevision: document.documentRevision,
          previousOwnerFence,
          ownerFence: ack.ownerFence,
          observedDiskRevision: ack.observedDiskRevision ?? null
        })
        if (result.status === 'applied') {
          this.persistence.boundDocumentFences.set(document.documentId, ack.ownerFence)
          // The bind command may itself have moved focus/ownership while this
          // async acknowledgement was pending. Reconcile after recording the
          // fence so an old mounted composition releases it immediately.
          this.syncDocumentIo()
        } else {
          await documentIo.unbind(document.documentId, ack.ownerFence)
          retryCurrentRevision = runtime.getDocumentSnapshots().some(current =>
            current.documentId === document.documentId && current.documentRevision !== document.documentRevision
          )
        }
      })
      .finally(() => {
        this.persistence.pendingDocumentIoBinds.delete(document.documentId)
        // A revision may have advanced during bind; retry against that exact
        // current revision instead of leaving a document with no save fence.
        if (retryCurrentRevision && this.persistence.members.size > 0) this.syncDocumentIo()
      })
  }

  /** Read a document's file without making the read authoritative. */
  readDocumentFromDisk(documentId: string, options: DocumentIoReadOptions): Promise<DocumentIoReadResult> {
    const documentIo = this.persistence.documentIo
    return documentIo
      ? documentIo.read(documentId, options)
      : Promise.resolve({ status: 'rejected', requestId: `read:${documentId}`, documentId, reason: 'document I/O is unavailable' })
  }

  /**
   * Load a read into the document, then adopt it in main. The order matters:
   * adopting first and failing to load would let a later save overwrite the
   * external change the editor never showed.
   */
  async reloadDocumentFromDisk(read: DiskReadResult, trailingNewline: TrailingNewlinePolicy): Promise<WorkspaceResult> {
    const runtime = this.runtime
    if (!runtime) return { status: 'rejected', reason: 'workspace is not mounted' }
    const { document } = read
    const result = await runtime.execute({
      kind: 'reload-document',
      documentId: read.documentId,
      markdown: document.markdown,
      encoding: document.encoding,
      lineEnding: document.lineEnding,
      adjustLineEndingOnSave: document.adjustLineEndingOnSave,
      trailingNewline
    })
    if (result.status !== 'applied') return result
    await this.adoptDiskRead(read)
    const warningId = diskConflictWarningId(read.documentId)
    const warnings = runtime.getProjection().warnings
    if (warnings.some(warning => warning.id === warningId)) {
      await runtime.execute({ kind: 'replace-warnings', warnings: warnings.filter(warning => warning.id !== warningId) })
    }
    return result
  }

  markDocumentMissing(documentId: string): Promise<WorkspaceResult> {
    return this.execute({ kind: 'mark-document-missing', documentId })
  }

  /** Mark a read's on-disk version as observed without touching content. */
  async adoptDiskRead(read: DiskReadResult): Promise<WorkspaceResult> {
    const runtime = this.runtime
    const documentIo = this.persistence.documentIo
    if (!runtime || !documentIo) return { status: 'rejected', reason: 'workspace is not mounted' }
    const ack = await documentIo.acceptRead(read.documentId, read.ownerFence, read.readToken)
    if (ack.status !== 'bound') return { status: 'rejected', reason: ack.status === 'rejected' ? ack.reason ?? 'read was not adopted' : 'read was not adopted' }
    const current = runtime.getDocumentSnapshots().find(snapshot => snapshot.documentId === read.documentId)
    if (!current) return { status: 'rejected', reason: 'missing document' }
    return runtime.execute({
      kind: 'apply-document-io-bind',
      documentId: read.documentId,
      documentRevision: current.documentRevision,
      previousOwnerFence: ack.ownerFence,
      ownerFence: ack.ownerFence,
      observedDiskRevision: ack.observedDiskRevision ?? null
    })
  }

  getFocusedDocumentId(): string | undefined {
    const projection = this.runtime?.getProjection()
    const pane = projection?.panes.find(
      (candidate) => candidate.paneId === projection.focusedPaneId
    )
    return pane?.tabs.find((tab) => tab.viewId === pane.activeViewId)?.documentId
  }

  subscribeProjection(listener: () => void): () => void {
    return this.runtime?.subscribe(() => listener()) ?? (() => undefined)
  }

  async activateLegacyTab(tab: IFileState): Promise<void> {
    if (!this.runtime || !this.binding) return
    const projection = this.runtime.getProjection()
    const existing = projection.panes
      .find((pane) => pane.paneId === this.paneId)
      ?.tabs.find((candidate) => candidate.documentId === tab.id)
    if (existing) {
      await this.runtime.execute({
        kind: 'activate-view',
        paneId: this.paneId,
        viewId: existing.viewId
      })
    } else {
      await this.runtime.execute({
        kind: 'open-document',
        document: {
          documentId: tab.id,
          markdown: tab.markdown,
          title: tab.filename,
          ...(tab.pathname ? { fileKey: tab.pathname } : {})
        }
      })
    }
  }

  getController(): WorkspaceController | undefined {
    return this.runtime
  }

  /** Pane-local tab closure; dirty-save decisions never read ambient currentFile. */
  async closeLegacyTab(documentId: string): Promise<WorkspaceResult> {
    const runtime = this.runtime
    const pane = runtime?.getProjection().panes.find((candidate) =>
      candidate.paneId === this.paneId && candidate.tabs.some((tab) => tab.documentId === documentId)
    )
    const view = pane?.tabs.find((candidate) => candidate.documentId === documentId)
    if (!runtime || !pane || !view) return { status: 'rejected', reason: 'missing pane view' }
    const fileKey = this.documentForView(view.viewId)?.fileKey
    const finishClose = (result: WorkspaceResult): WorkspaceResult => {
      if (result.status === 'applied' && fileKey && !runtime.getFacadeSnapshot().documents.some(document => document.documentId === documentId)) {
        window.electron.ipcRenderer.send('mt::window-tab-closed', fileKey)
      }
      return result
    }
    const saveView = async(): Promise<WorkspaceResult | undefined> => {
      const document = this.documentForView(view.viewId)
      return document?.fileKey
        ? this.execute({ kind: 'save', paneId: this.paneId, viewId: view.viewId })
        : this.chooseSaveTarget(view.viewId).then((pathname) =>
          pathname
            ? this.execute({
              kind: 'save-as',
              paneId: this.paneId,
              viewId: view.viewId,
              fileKey: pathname,
              title: pathname.split(/[\\/]/).at(-1) ?? pathname
            })
            : undefined
        )
    }
    if (this.persistence.crashDraftLineage.has(documentId) && !runtime.hasOtherView(view.viewId)) {
      // A recovered draft remains decision-owned until its durable disposition
      // succeeds. Ask before Muya's close flush can normalize whitespace to the
      // clean baseline and silently bypass the decision.
      const decision = await this.confirmClose(view.viewId)
      if (decision === 'cancel') return { status: 'rejected', reason: 'close cancelled' }
      if (decision === 'save') {
        const save = await saveView()
        if (!save || save.status !== 'applied') {
          return save ?? { status: 'rejected', reason: 'close cancelled' }
        }
      } else {
        const scope = this.getScope()
        if (scope && (scope.viewId === view.viewId || scope.documentId === documentId)) {
          const flushed = await scope.flush()
          if (flushed.status !== 'applied') return flushed
        }
        await this.syncCrashDraft()
        if (!(await this.resolveCrashDraft(documentId, 'discard'))) {
          return { status: 'failed', reason: 'recovered draft disposition was not durable' }
        }
      }
      const recoveredClose = await this.execute({ kind: 'close-view', viewId: view.viewId })
      return finishClose(recoveredClose.status === 'needs-decision'
        ? await runtime.execute({ kind: 'commit-authorized', capability: recoveredClose.capability })
        : recoveredClose)
    }
    const close = await this.execute({ kind: 'close-view', viewId: view.viewId })
    if (close.status !== 'needs-decision') return finishClose(close)
    const decision = await this.confirmClose(view.viewId)
    if (decision === 'cancel') return { status: 'rejected', reason: 'close cancelled' }
    if (decision === 'discard') {
      await this.syncCrashDraft()
      if (!(await this.resolveCrashDraft(documentId, 'discard'))) {
        return { status: 'failed', reason: 'crash-draft disposition was not durable' }
      }
      return finishClose(await runtime.execute({ kind: 'commit-authorized', capability: close.capability }))
    }
    const save = await saveView()
    if (!save || save.status !== 'applied') return save ?? { status: 'rejected', reason: 'close cancelled' }
    const committed = await runtime.execute({ kind: 'commit-authorized', capability: close.capability })
    if (committed.status !== 'rejected') return finishClose(committed)
    // Save As rotates the DocumentIO fence, intentionally invalidating the
    // original close capability. The durable write is clean, so a fresh close
    // capability may be committed without another user decision.
    const retry = await runtime.execute({ kind: 'close-view', viewId: view.viewId })
    const retryResult = retry.status === 'needs-decision'
      ? await runtime.execute({ kind: 'commit-authorized', capability: retry.capability })
      : retry
    return finishClose(retryResult)
  }

  /**
   * A last-tab command is a window-exit request, not an empty-workspace
   * transition. The native close path keeps dirty confirmation and CrashDraft
   * durability checks in one place.
   */
  async closeTab(documentId: string): Promise<WorkspaceResult> {
    const runtime = this.runtime
    if (runtime?.getFacadeSnapshot().documents.length === 1) {
      window.electron.ipcRenderer.send('mt::cmd-close-window')
      return { status: 'applied', workspaceRevision: runtime.getProjection().workspaceRevision }
    }
    return this.closeLegacyTab(documentId)
  }

  async closeMatchingTabs(match: (documentId: string, dirty: boolean) => boolean): Promise<void> {
    const tabs = this.runtime
      ?.getProjection()
      .panes.find((candidate) => candidate.paneId === this.paneId)
      ?.tabs
      .filter((tab) => match(tab.documentId, tab.dirty)) ?? []
    for (const tab of tabs) await this.closeLegacyTab(tab.documentId)
  }

  /**
   * Window close is a final controller transaction: every dirty decision must
   * cross its DocumentIO and CrashDraft durable boundaries before main may
   * destroy the BrowserWindow.  A cancellation or failed durable boundary
   * deliberately leaves the window open.
   */
  async closeForWindowExit(): Promise<boolean> {
    const runtime = this.runtime
    if (!runtime) return false
    const documentIds = runtime.getFacadeSnapshot().documents.map((document) => document.documentId)
    for (const documentId of documentIds) {
      const pane = runtime.getProjection().panes.find(candidate => candidate.tabs.some(tab => tab.documentId === documentId))
      const composition = [...this.persistence.members].find(member => member.paneId === pane?.paneId)
      if (!composition) return false
      const result = await composition.closeLegacyTab(documentId)
      if (result.status !== 'applied') return false
    }
    await this.persistence.crashDraftTail
    const clean = await this.crashDraft.request({ kind: 'mark-clean' })
    // Another window's unresolved draft must keep the process dirty without
    // preventing this window from closing after its own documents are closed.
    return clean.durable || clean.reason === 'unresolved crash drafts remain'
  }

  async cycleTabs(direction: boolean): Promise<WorkspaceResult> {
    const pane = this.runtime?.getProjection().panes.find((candidate) => candidate.paneId === this.paneId)
    if (!pane || pane.tabs.length < 2) return { status: 'rejected', reason: 'missing adjacent pane tab' }
    const index = pane.tabs.findIndex((tab) => tab.viewId === pane.activeViewId)
    if (index < 0) return { status: 'rejected', reason: 'missing active pane tab' }
    const target = pane.tabs[(index + (direction ? 1 : -1) + pane.tabs.length) % pane.tabs.length]
    return target
      ? this.execute({ kind: 'activate-view', paneId: this.paneId, viewId: target.viewId })
      : { status: 'rejected', reason: 'missing adjacent pane tab' }
  }

  async chooseSaveTarget(viewId?: string): Promise<string | undefined> {
    const document = this.documentForView(viewId)
    if (!document) return undefined
    const selection = await this.persistence.documentIo?.chooseSaveTarget({
      documentId: document.documentId,
      title: document.title,
      ...(document.fileKey ? { suggestedPath: document.fileKey } : {})
    })
    return selection?.status === 'selected' ? selection.pathname : undefined
  }

  /** Save the focused document through its typed DocumentIO path. */
  async save(): Promise<WorkspaceResult> {
    const document = this.documentForView()
    if (!document) return { status: 'rejected', reason: 'missing focused document' }
    if (document.fileKey) return this.execute({ kind: 'save', paneId: this.paneId, viewId: document.viewId })
    const pending = this.persistence.pendingSaves.get(document.documentId)
    if (pending) return pending
    const save = (async(): Promise<WorkspaceResult> => {
      const pathname = await this.chooseSaveTarget(document.viewId)
      return pathname
        ? this.execute({
          kind: 'save-as',
          paneId: this.paneId,
          viewId: document.viewId,
          fileKey: pathname,
          title: pathname.split(/[\\/]/).at(-1) ?? pathname
        })
        : { status: 'rejected', reason: 'save cancelled' }
    })()
    this.persistence.pendingSaves.set(document.documentId, save)
    const clear = (): void => {
      if (this.persistence.pendingSaves.get(document.documentId) === save) this.persistence.pendingSaves.delete(document.documentId)
    }
    save.then(clear, clear)
    return save
  }

  async confirmClose(viewId: string): Promise<'save' | 'discard' | 'cancel'> {
    const document = this.documentForView(viewId)
    if (!document) return 'cancel'
    return this.persistence.documentIo?.confirmClose({
      documentId: document.documentId,
      title: document.title
    }) ?? 'cancel'
  }

  private documentForView(viewId?: string) {
    const facade = this.runtime?.getFacadeSnapshot()
    if (!facade) return undefined
    if (viewId) return facade.documents.find((document) => document.viewId === viewId)
    const pane = facade.projection.panes.find((candidate) => candidate.paneId === facade.projection.focusedPaneId)
    return facade.documents.find((document) => document.viewId === pane?.activeViewId)
  }

  /**
   * Production command edge: the controller produces the only DocumentIO
   * request, and the T04b adapter returns the only acknowledgement.  Legacy
   * consumers receive just the final typed controller result.
   */
  async execute(command: WorkspaceCommand): Promise<WorkspaceResult> {
    if (!this.runtime) return { status: 'rejected', reason: 'workspace is not mounted' }
    if ((command.kind === 'save' || command.kind === 'save-as' || command.kind === 'rename') && !this.binding?.getLease()) {
      return { status: 'rejected', reason: 'pane editor binding is no longer mounted' }
    }
    const result = await this.runtime.execute(command)
    if (result.status !== 'applied' || !result.documentIoRequest) return result
    const request = result.documentIoRequest
    if (request.kind === 'bind' || request.kind === 'sync' || request.kind === 'unbind') {
      return { status: 'failed', reason: 'controller emitted a non-save document I/O request' }
    }
    const ack = await this.persistence.documentIo?.save(request)
    if (!ack) return { status: 'failed', reason: 'document I/O adapter is not mounted' }
    const applied = await this.runtime.execute({ kind: 'apply-save-ack', ack })
    if (applied.status === 'applied' && ack.status === 'durable-success') {
      this.persistence.boundDocumentFences.set(ack.documentId, ack.ownerFence)
      const recovered = this.persistence.crashDraftLineage.has(ack.documentId)
      const resolved = await this.resolveCrashDraft(ack.documentId)
      if (recovered && !resolved) {
        return { status: 'failed', reason: 'recovered draft disposition was not durable' }
      }
    }
    return applied
  }

  setCrashDraftLineage(localDocumentId: string, durableDocumentId: string): void {
    this.persistence.crashDraftLineage.set(localDocumentId, durableDocumentId)
  }

  async checkpointCrashDraft(): Promise<void> {
    await this.syncCrashDraft()
  }

  /** One emergency checkpoint per live document revision, shared by its views. */
  private async syncCrashDraft(): Promise<void> {
    const work = async(): Promise<void> => {
      for (const snapshot of this.runtime?.getDocumentSnapshots() ?? []) {
        if (!snapshot.document.dirty) continue
        // A saved draft is recoverable only against bytes DocumentIO actually
        // observed. Do not manufacture a baseline from the current disk later.
        if (snapshot.document.fileKey && snapshot.document.observedDiskRevision === undefined) continue
        const current = this.persistence.crashReceipts.get(snapshot.documentId)
        if (current?.revision === snapshot.documentRevision) continue
        const response = await this.crashDraft.request({
          kind: 'checkpoint',
          checkpoint: {
            documentId: this.persistence.crashDraftLineage.get(snapshot.documentId) ?? snapshot.documentId,
            ...(snapshot.document.fileKey
              ? {
                fileKey: snapshot.document.fileKey,
                observedDiskRevision: snapshot.document.observedDiskRevision
              }
              : {}),
            documentRevision: snapshot.documentRevision,
            markdown: snapshot.document.markdown,
            view: { cursor: snapshot.view.cursor, selection: snapshot.view.selection }
          }
        })
        if (response.durable && response.receipt) {
          this.persistence.crashReceipts.set(snapshot.documentId, { revision: snapshot.documentRevision, receipt: response.receipt })
        }
      }
    }
    const next = this.persistence.crashDraftTail.then(work, work)
    this.persistence.crashDraftTail = next.catch(() => undefined)
    return next
  }

  private async resolveCrashDraft(documentId: string, action: 'saved' | 'discard' = 'saved'): Promise<boolean> {
    await this.persistence.crashDraftTail
    const receipt = this.persistence.crashReceipts.get(documentId)?.receipt
    if (!receipt) return false
    if (this.persistence.crashDraftDispositions.get(documentId) !== receipt) {
      const response = await this.crashDraft.request({ kind: action, receipt })
      if (!response.durable) return false
      this.persistence.crashDraftDispositions.set(documentId, receipt)
    }
    const clean = await this.crashDraft.request({ kind: 'mark-clean' })
    // This document's durable disposition is sufficient for a tab close while
    // another document still owns a crash draft. Actual marker I/O failures
    // remain retryable and must keep a recovered document present.
    if (!clean.durable && clean.reason !== 'unresolved crash drafts remain') return false
    this.persistence.crashDraftDispositions.delete(documentId)
    this.persistence.crashReceipts.delete(documentId)
    this.persistence.crashDraftLineage.delete(documentId)
    return true
  }
}

export const createPaneEditorComposition = (
  options: PaneEditorCompositionOptions
): PaneEditorComposition => new PaneEditorComposition(options)
