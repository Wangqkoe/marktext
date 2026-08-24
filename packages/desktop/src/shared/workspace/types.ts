/**
 * The serialisable contracts shared by the renderer workspace runtime and its
 * future startup/main-process assembly.  This module deliberately contains no
 * normal-session snapshot, codec, or load boundary.
 */

export type PaneId = 'left' | 'right'
export type EditorMode = 'wysiwyg' | 'source'
export type DocumentId = string
export type ViewId = string
export type FileKey = string
export type DiskRevision = string

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface CursorPosition {
  readonly line: number
  readonly column: number
}

export interface SelectionRange {
  readonly anchor: CursorPosition
  readonly head: CursorPosition
}

export interface ViewState {
  readonly cursor: CursorPosition
  readonly selection: SelectionRange | null
  readonly scrollTop: number
  readonly mode: EditorMode
}

/** JSON-only outline data for one active View. */
export interface WorkspaceTocItem {
  readonly id: string
  readonly title: string
  readonly level: number
}

/** JSON-only editor status; calculations remain owned by the editor adapter. */
export interface WorkspaceStatus {
  readonly wordCount?: number
  readonly characterCount?: number
  readonly lineCount?: number
  readonly caret?: CursorPosition
}

export interface WorkspaceWarning {
  readonly id: string
  readonly kind: 'conflict' | 'recovery'
  readonly message: string
}

export interface PortableHistory {
  readonly version: number
  readonly value: JsonValue
}

export interface WorkspaceDocumentInput {
  readonly documentId?: DocumentId
  readonly fileKey?: FileKey
  readonly observedDiskRevision?: DiskRevision
  readonly markdown?: string
  readonly portableHistory?: PortableHistory
  readonly title?: string
}

export interface StartupTarget {
  readonly fileKey: FileKey
  readonly title?: string
}

/** Explicit targets always win over ordinary (future) workspace restore. */
export type StartupIntent =
  | { readonly kind: 'no-target' }
  | { readonly kind: 'explicit-targets'; readonly targets: readonly StartupTarget[] }

export interface WorkspaceSeed {
  readonly kind: 'clean-new-tab' | 'explicit-targets'
  readonly targets: readonly StartupTarget[]
}

export interface CrashDraftCheckpoint {
  readonly documentId: DocumentId
  readonly fileKey?: FileKey
  readonly observedDiskRevision?: DiskRevision
  readonly documentRevision: number
  readonly markdown: string
  readonly view: Pick<ViewState, 'cursor' | 'selection'>
}

export interface CrashDraftEnvelope extends CrashDraftCheckpoint {
  readonly version: 1
  readonly digest: string
}

export interface CrashDraftRecoveryRecord {
  readonly kind: 'crash-draft'
  readonly draft: CrashDraftEnvelope
  readonly warning?: string
}

export interface MoveRecoveryRecord {
  readonly kind: 'move-recovery'
  readonly transferId: string
  readonly capsuleDigest: string
  readonly phase: string
}

export interface CrashDraftRecovery {
  scan(): Promise<readonly CrashDraftRecoveryRecord[]>
}

/** Move WAL/capsule recovery is intentionally not a workspace persistence API. */
export interface MoveRecovery {
  scan(): Promise<readonly MoveRecoveryRecord[]>
}

export interface EmergencyScan {
  readonly crashDrafts: readonly CrashDraftRecoveryRecord[]
  readonly moves: readonly MoveRecoveryRecord[]
}

export interface EmergencyRecovery {
  readonly crashDrafts: CrashDraftRecovery
  readonly moves: MoveRecovery
}

export type WorkspaceCommand =
  | { readonly kind: 'new-tab'; readonly paneId?: PaneId }
  | { readonly kind: 'open-document'; readonly document: WorkspaceDocumentInput }
  | { readonly kind: 'activate-view'; readonly paneId: PaneId; readonly viewId: ViewId }
  | { readonly kind: 'focus-pane'; readonly paneId: PaneId }
  | { readonly kind: 'split-pane'; readonly targetPaneId: PaneId }
  | { readonly kind: 'move-view'; readonly viewId: ViewId; readonly targetPaneId: PaneId }
  | { readonly kind: 'close-view'; readonly viewId: ViewId }
  | { readonly kind: 'commit-authorized'; readonly capability: WorkspaceCapability }

export interface WorkspaceCapability {
  readonly action: 'close-view'
}

export type WorkspaceResult =
  | { readonly status: 'applied'; readonly workspaceRevision: number }
  | { readonly status: 'needs-decision'; readonly capability: WorkspaceCapability }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string }

export interface WorkspaceProjectionTab {
  readonly viewId: ViewId
  readonly documentId: DocumentId
  readonly title: string
  readonly fileKey?: FileKey
  readonly dirty: boolean
  readonly mode: EditorMode
}

export interface WorkspaceProjectionPane {
  readonly paneId: PaneId
  readonly activeViewId: ViewId
  readonly tabs: readonly WorkspaceProjectionTab[]
  readonly toc: readonly WorkspaceTocItem[]
  readonly status: WorkspaceStatus
}

/** Metadata only: never Markdown, history, editor instances, callbacks, or leases. */
export interface WorkspaceProjection {
  readonly workspaceRevision: number
  readonly focusedPaneId: PaneId
  readonly splitRatio: number | null
  readonly panes: readonly WorkspaceProjectionPane[]
  /** The focused pane's active View. */
  readonly toc: readonly WorkspaceTocItem[]
  readonly status: WorkspaceStatus
  readonly warnings: readonly WorkspaceWarning[]
}

export interface EditorBindingSnapshot {
  readonly paneId: PaneId
  readonly viewId: ViewId
  readonly document: {
    readonly documentId: DocumentId
    readonly fileKey?: FileKey
    readonly observedDiskRevision?: DiskRevision
    readonly markdown: string
    readonly dirty: boolean
    readonly documentRevision: number
    readonly portableHistory: PortableHistory
  }
  readonly view: ViewState
  readonly toc: readonly WorkspaceTocItem[]
  readonly status: WorkspaceStatus
  readonly workspaceRevision: number
}

export interface EditorReport {
  readonly markdown?: string
  readonly portableHistory?: PortableHistory
  readonly cursor?: CursorPosition
  readonly selection?: SelectionRange | null
  readonly scrollTop?: number
  readonly toc?: readonly WorkspaceTocItem[]
  readonly status?: WorkspaceStatus
}

export interface PaneEditorAdapter {
  /** Atomically replaces the adapter's active pane/view representation. */
  refresh(snapshot: EditorBindingSnapshot): Promise<void>
  /** Returns the latest in-editor edits before the active View is replaced. */
  flush(): Promise<EditorReport>
}

/** Opaque at runtime: only a WorkspaceController-created value is accepted. */
export interface EditorLease {
  readonly paneId: PaneId
  readonly viewId: ViewId
  readonly mode: EditorMode
}

export interface PaneEditorBinding {
  /** Current lease; undefined only after an adapter failure until a later refresh succeeds. */
  readonly lease: EditorLease | undefined
  getLease(): EditorLease | undefined
  getSnapshot(lease: EditorLease): EditorBindingSnapshot | undefined
  report(lease: EditorLease, report: EditorReport): WorkspaceResult
  flush(lease: EditorLease): Promise<WorkspaceResult>
  handoffMode(lease: EditorLease, mode: EditorMode): Promise<WorkspaceResult>
  refresh(lease: EditorLease): Promise<WorkspaceResult>
}

/** The ordinary application-facing surface. Editor binding is assembly-only. */
export interface WorkspaceController {
  execute(command: WorkspaceCommand): Promise<WorkspaceResult>
  getProjection(): WorkspaceProjection
  subscribe(listener: (projection: WorkspaceProjection) => void): () => void
}
