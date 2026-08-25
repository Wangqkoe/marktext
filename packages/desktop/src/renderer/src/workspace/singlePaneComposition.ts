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
  private sourceHandoffHandler: ((report: EditorReport) => void) | undefined
  private readonly paneId: PaneId
  private mountGeneration = 0
  private readonly documentIoPort: DocumentIoPort | undefined
  private documentIo: RendererDocumentIoAdapter | undefined
  private stopDocumentIoSync: (() => void) | undefined
  private readonly pendingDocumentIoBinds = new Set<string>()
  private readonly boundDocumentFences = new Map<string, string>()
  private modeTransition: Promise<WorkspaceResult> | undefined

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
    void this.documentIo?.dispose()
    this.documentIo = undefined
    this.surface = undefined
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

  getScope(): PaneEditorEventScope | undefined {
    return this.reporter.getActiveScope()
  }

  /**
   * Source mode is a child surface of the Muya host. Keep its last report at
   * this composition boundary so the controller's handoff flush cannot read
   * the hidden WYSIWYG document and overwrite a source edit.
   */
  reportSource(scope: PaneEditorEventScope, report: EditorReport): WorkspaceResult {
    const result = scope.report(report)
    if (result.status === 'applied') this.sourceReport = { scope, report }
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
    return pending &&
      snapshot.view.mode === 'source' &&
      pending.scope === this.reporter.getActiveScope() &&
      pending.scope.viewId === snapshot.viewId
      ? pending.report
      : undefined
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

  async scopeForMode(mode: EditorMode): Promise<PaneEditorEventScope | undefined> {
    await this.modeTransition
    const scope = this.getScope()
    return scope?.mode === mode ? scope : undefined
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

    const liveIds = new Set(runtime.getProjection().panes.flatMap((pane) => pane.tabs.map((tab) => tab.documentId)))
    for (const [documentId, ownerFence] of this.boundDocumentFences) {
      if (!liveIds.has(documentId)) {
        this.boundDocumentFences.delete(documentId)
        void documentIo.unbind(documentId, ownerFence)
      }
    }

    if (!snapshot || !snapshot.document.fileKey) return

    const document = snapshot.document
    const existing = documentIo.getBinding(document.ownerFence)
    if (existing) {
      void documentIo.sync({
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
    void documentIo
      .bind({
        kind: 'bind',
        requestId: `bind:${document.documentId}:${document.documentRevision}`,
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        pathname: document.fileKey!,
        dirty: document.dirty
      })
      .then(async(ack) => {
        if (ack.status !== 'bound' || !this.isMounted()) return
        const result = await runtime.execute({
          kind: 'apply-document-io-bind',
          documentId: document.documentId,
          documentRevision: document.documentRevision,
          previousOwnerFence,
          ownerFence: ack.ownerFence
        })
        if (result.status === 'applied') this.boundDocumentFences.set(document.documentId, ack.ownerFence)
      })
      .finally(() => this.pendingDocumentIoBinds.delete(document.documentId))
  }

  private routeDocumentIoObservation(observation: DocumentIoObservation): void {
    if (!this.runtime || !this.binding) return
    if (observation.kind === 'conflict') {
      void this.runtime.execute({
        kind: 'replace-warnings',
        warnings: [{ id: `document-io:${observation.documentId}`, kind: 'conflict', message: 'File changed on disk' }]
      })
    }
    const lease = this.binding.getLease()
    const snapshot = lease ? this.binding.getSnapshot(lease) : undefined
    if (snapshot?.documentId === observation.documentId && lease) {
      void this.binding.refresh(lease)
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
    const existing = projection.panes[0]?.tabs.find((candidate) => candidate.documentId === tab.id)
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
    }
    return applied
  }
}

export const createPaneEditorComposition = (
  options: PaneEditorCompositionOptions
): PaneEditorComposition => new PaneEditorComposition(options)

// The old one-editor shell has no injection point. Keep its explicitly named,
// bounded fallback here; T03 uses `createPaneEditorComposition` instead.
const legacySinglePaneFallback = createPaneEditorComposition({ paneId: 'left' })

export const legacyPaneFallback = (): PaneEditorComposition => legacySinglePaneFallback
