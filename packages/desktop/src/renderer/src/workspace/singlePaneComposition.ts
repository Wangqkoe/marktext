import type {
  EditorBindingSnapshot,
  EditorReport,
  PaneEditorBinding,
  WorkspaceDocumentInput,
  WorkspaceResult
} from '@shared/workspace'
import type { IFileState } from '@shared/types/files'
import { createWorkspaceRuntime } from './controller'
import {
  PaneEditorLeaseReporter,
  RendererPaneEditorAdapter,
  type PaneEditorEventScope,
  type PaneEditorSurface
} from './paneEditorAdapter'

export interface LegacyPaneSeed {
  readonly id: string
  readonly markdown: string
  readonly title: string
  readonly fileKey?: string
}

/**
 * The temporary V1 single-pane assembly. It is the only compatibility edge
 * allowed to translate the legacy tab shell into WorkspaceController commands.
 * T03 replaces this composition with its two-pane assembly without changing
 * editor callbacks or the adapter/lease contract.
 */
class SinglePaneComposition {
  private reporter = new PaneEditorLeaseReporter('left')
  private surface: PaneEditorSurface | undefined
  private binding: PaneEditorBinding | undefined
  private runtime: ReturnType<typeof createWorkspaceRuntime> | undefined
  private sourceReport: { scope: PaneEditorEventScope; report: EditorReport } | undefined
  private sourceHandoffHandler: ((report: EditorReport) => void) | undefined
  private initialized = false

  async mount(surface: PaneEditorSurface, seed: LegacyPaneSeed): Promise<void> {
    this.surface = surface
    if (this.initialized) return
    this.initialized = true
    const input: WorkspaceDocumentInput = {
      documentId: seed.id,
      markdown: seed.markdown,
      title: seed.title,
      ...(seed.fileKey ? { fileKey: seed.fileKey } : {})
    }
    this.runtime = createWorkspaceRuntime([input])
    const adapter = new RendererPaneEditorAdapter(surface, this.reporter)
    this.binding = await this.runtime.bindPaneEditor('left', adapter)
    this.reporter.attach(this.binding)
  }

  unmount(surface: PaneEditorSurface): void {
    if (this.surface === surface) this.surface = undefined
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
    return this.initialized && this.surface !== undefined
  }

  async activateLegacyTab(tab: IFileState): Promise<void> {
    if (!this.runtime || !this.binding) return
    const projection = this.runtime.getProjection()
    const existing = projection.panes[0]?.tabs.find((candidate) => candidate.documentId === tab.id)
    if (existing) {
      await this.runtime.execute({ kind: 'activate-view', paneId: 'left', viewId: existing.viewId })
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

const singlePaneComposition = new SinglePaneComposition()

export const singlePaneWorkspace = (): SinglePaneComposition => singlePaneComposition
