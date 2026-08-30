import type {
  EditorBindingSnapshot,
  EditorReport,
  PaneEditorBinding,
  PaneId,
  WorkspaceDocumentInput,
  WorkspaceResult,
  WorkspaceCommand,
  DocumentIoObservation,
  DocumentIoPort
} from '@shared/workspace'
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
  private readonly paneId: PaneId
  private mountGeneration = 0
  private readonly documentIoPort: DocumentIoPort | undefined
  private documentIo: RendererDocumentIoAdapter | undefined
  private stopDocumentIoSync: (() => void) | undefined
  private readonly pendingDocumentIoBinds = new Set<string>()
  private readonly boundDocumentFences = new Map<string, string>()
  private readonly pendingSaves = new Map<string, Promise<WorkspaceResult>>()
  private modeTransition: Promise<WorkspaceResult> | undefined
  private readonly crashDraft = createElectronCrashDraftPort()
  private readonly crashReceipts = new Map<string, { readonly revision: number; readonly receipt: string }>()
  /** A recovery's local controller ID writes and clears its pre-crash durable identity. */
  private readonly crashDraftLineage = new Map<string, string>()
  private stopCrashDraftSync: (() => void) | undefined
  private crashDraftTail: Promise<void> = Promise.resolve()

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
    this.pendingDocumentIoBinds.clear()
    this.boundDocumentFences.clear()
    this.documentIo?.dispose()
    this.stopCrashDraftSync?.()
    this.stopCrashDraftSync = undefined
    // A clean marker is only accepted by main after every durable draft has a
    // durable disposition; failed/dirty cases remain recoverable by design.
    this.crashDraftTail.then(() => this.crashDraft.request({ kind: 'mark-clean' })).catch(() => undefined)
    this.documentIo = undefined
    this.surface = undefined
  }

  /**
   * Move's final target checkpoint joins the pane's existing emergency-draft
   * queue.  It never races a dirty editor's ordinary checkpoint with a second
   * write for the same document revision.
   */
  async hasDurableCrashDraft(documentId: string, documentRevision: number): Promise<boolean> {
    await this.syncCrashDraft()
    await this.crashDraftTail
    return this.crashReceipts.get(documentId)?.revision === documentRevision
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
    const result = scope.report(report)
    if (result.status === 'applied') {
      this.sourceReport = { scope, report }
    } else if (
      result.status === 'rejected' &&
      result.reason === 'workspace mutation is in progress' &&
      scope === this.reporter.getActiveScope() &&
      scope.mode === 'source'
    ) {
      this.sourceReport = { scope, report }
      this.flushSourceReport(scope)
    }
    return result
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
    if (!this.runtime || !this.binding || this.documentIo) return
    const hasProductionPort = typeof window !== 'undefined' && !!window.electron?.ipcRenderer?.invoke
    const port = this.documentIoPort ?? (hasProductionPort ? createElectronDocumentIoPort() : undefined)
    if (!port) return
    this.documentIo = new RendererDocumentIoAdapter(port, (observation) =>
      this.routeDocumentIoObservation(observation)
    )
    this.stopDocumentIoSync = this.runtime.subscribe(() => this.syncDocumentIo())
    this.syncDocumentIo()
  }

  private syncDocumentIo(): void {
    const runtime = this.runtime
    const binding = this.binding
    const documentIo = this.documentIo
    const lease = binding?.getLease()
    const snapshot = lease ? binding?.getSnapshot(lease) : undefined
    if (!runtime || !binding || !documentIo) return

    // A composition owns the DocumentIO binding only while its mounted surface
    // presents that document. A View move/collapse must revoke the old surface
    // before the successor composition acquires its own observer/save fence.
    const activeDocumentId = snapshot?.documentId
    for (const [documentId, ownerFence] of this.boundDocumentFences) {
      if (documentId !== activeDocumentId) {
        this.boundDocumentFences.delete(documentId)
        documentIo.unbind(documentId, ownerFence)
      }
    }

    if (!snapshot) return

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
    if (this.pendingDocumentIoBinds.has(document.documentId)) return
    this.pendingDocumentIoBinds.add(document.documentId)
    const previousOwnerFence = document.ownerFence
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
        if (ack.status !== 'bound' || !this.isMounted()) return
        const result = await runtime.execute({
          kind: 'apply-document-io-bind',
          documentId: document.documentId,
          documentRevision: document.documentRevision,
          previousOwnerFence,
          ownerFence: ack.ownerFence,
          observedDiskRevision: ack.observedDiskRevision ?? null
        })
        if (result.status === 'applied') {
          this.boundDocumentFences.set(document.documentId, ack.ownerFence)
          // The bind command may itself have moved focus/ownership while this
          // async acknowledgement was pending. Reconcile after recording the
          // fence so an old mounted composition releases it immediately.
          this.syncDocumentIo()
        }
      })
      .finally(() => this.pendingDocumentIoBinds.delete(document.documentId))
  }

  private routeDocumentIoObservation(observation: DocumentIoObservation): void {
    if (!this.runtime || !this.binding) return
    if (observation.kind === 'conflict') {
      this.runtime.execute({
        kind: 'replace-warnings',
        warnings: [{ id: `document-io:${observation.documentId}`, kind: 'conflict', message: 'File changed on disk' }]
      })
    }
    const lease = this.binding.getLease()
    const snapshot = lease ? this.binding.getSnapshot(lease) : undefined
    if (snapshot?.documentId === observation.documentId && lease) {
      this.binding.refresh(lease)
    }
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
      candidate.tabs.some((tab) => tab.documentId === documentId)
    )
    const view = pane?.tabs.find((candidate) => candidate.documentId === documentId)
    if (!runtime || !pane || !view) return { status: 'rejected', reason: 'missing pane view' }
    const fileKey = this.documentForView(view.viewId)?.fileKey
    const finishClose = (result: WorkspaceResult): WorkspaceResult => {
      if (result.status === 'applied' && fileKey) {
        window.electron.ipcRenderer.send('mt::window-tab-closed', fileKey)
      }
      return result
    }
    const close = await this.execute({ kind: 'close-view', viewId: view.viewId })
    if (close.status !== 'needs-decision') return finishClose(close)
    const decision = await this.confirmClose(view.viewId)
    if (decision === 'cancel') return { status: 'rejected', reason: 'close cancelled' }
    if (decision === 'discard') {
      await this.syncCrashDraft()
      await this.resolveCrashDraft(documentId, 'discard')
      return finishClose(await runtime.execute({ kind: 'commit-authorized', capability: close.capability }))
    }
    const document = this.documentForView(view.viewId)
    const save = document?.fileKey
      ? await this.execute({ kind: 'save', paneId: this.paneId, viewId: view.viewId })
      : await this.chooseSaveTarget(view.viewId).then((pathname) =>
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
      const result = await this.closeLegacyTab(documentId)
      if (result.status !== 'applied') return false
    }
    await this.crashDraftTail
    return (await this.crashDraft.request({ kind: 'mark-clean' })).durable
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
    const selection = await this.documentIo?.chooseSaveTarget({
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
    const pending = this.pendingSaves.get(document.documentId)
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
    this.pendingSaves.set(document.documentId, save)
    const clear = (): void => {
      if (this.pendingSaves.get(document.documentId) === save) this.pendingSaves.delete(document.documentId)
    }
    save.then(clear, clear)
    return save
  }

  async confirmClose(viewId: string): Promise<'save' | 'discard' | 'cancel'> {
    const document = this.documentForView(viewId)
    if (!document) return 'cancel'
    return this.documentIo?.confirmClose({
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
    const result = await this.runtime.execute(command)
    if (result.status !== 'applied' || !result.documentIoRequest) return result
    const request = result.documentIoRequest
    if (request.kind === 'bind' || request.kind === 'sync' || request.kind === 'unbind') {
      return { status: 'failed', reason: 'controller emitted a non-save document I/O request' }
    }
    const ack = await this.documentIo?.save(request)
    if (!ack) return { status: 'failed', reason: 'document I/O adapter is not mounted' }
    const applied = await this.runtime.execute({ kind: 'apply-save-ack', ack })
    if (applied.status === 'applied' && ack.status === 'durable-success') {
      this.boundDocumentFences.set(ack.documentId, ack.ownerFence)
      await this.resolveCrashDraft(ack.documentId)
    }
    return applied
  }

  setCrashDraftLineage(localDocumentId: string, durableDocumentId: string): void {
    this.crashDraftLineage.set(localDocumentId, durableDocumentId)
  }

  async checkpointCrashDraft(): Promise<void> {
    await this.syncCrashDraft()
  }

  /** Emergency state derives from the controller's live bound snapshot only. */
  private async syncCrashDraft(): Promise<void> {
    const work = async(): Promise<void> => {
      const lease = this.binding?.getLease()
      const snapshot = lease ? this.binding?.getSnapshot(lease) : undefined
      if (!snapshot?.document.dirty) return
      // A saved draft is recoverable only against bytes DocumentIO actually
      // observed. Do not manufacture a baseline from the current disk later.
      if (snapshot.document.fileKey && snapshot.document.observedDiskRevision === undefined) return
      const current = this.crashReceipts.get(snapshot.documentId)
      if (current?.revision === snapshot.documentRevision) return
      const response = await this.crashDraft.request({
        kind: 'checkpoint',
        checkpoint: {
          documentId: this.crashDraftLineage.get(snapshot.documentId) ?? snapshot.documentId,
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
        this.crashReceipts.set(snapshot.documentId, { revision: snapshot.documentRevision, receipt: response.receipt })
      }
    }
    const next = this.crashDraftTail.then(work, work)
    this.crashDraftTail = next.catch(() => undefined)
    return next
  }

  private async resolveCrashDraft(documentId: string, action: 'saved' | 'discard' = 'saved'): Promise<void> {
    await this.crashDraftTail
    const receipt = this.crashReceipts.get(documentId)?.receipt
    if (!receipt) return
    const response = await this.crashDraft.request({ kind: action, receipt })
    if (!response.durable) return
    this.crashReceipts.delete(documentId)
    await this.crashDraft.request({ kind: 'mark-clean' })
  }
}

export const createPaneEditorComposition = (
  options: PaneEditorCompositionOptions
): PaneEditorComposition => new PaneEditorComposition(options)
