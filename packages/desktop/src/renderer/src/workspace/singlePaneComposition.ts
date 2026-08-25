import type {
  EditorBindingSnapshot,
  EditorReport,
  PaneEditorBinding,
  PaneId,
  WorkspaceDocumentInput,
  WorkspaceResult
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

  constructor(options: PaneEditorCompositionOptions) {
    this.paneId = options.paneId
    this.reporter = new PaneEditorLeaseReporter(options.paneId)
    this.runtime = options.controller
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
}

export const createPaneEditorComposition = (
  options: PaneEditorCompositionOptions
): PaneEditorComposition => new PaneEditorComposition(options)

// The old one-editor shell has no injection point. Keep its explicitly named,
// bounded fallback here; T03 uses `createPaneEditorComposition` instead.
const legacySinglePaneFallback = createPaneEditorComposition({ paneId: 'left' })

export const legacyPaneFallback = (): PaneEditorComposition => legacySinglePaneFallback
