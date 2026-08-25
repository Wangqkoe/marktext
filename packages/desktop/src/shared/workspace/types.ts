/**
 * The serialisable contracts shared by the renderer workspace runtime and its
 * future startup/main-process assembly.  This module deliberately contains no
 * normal-session snapshot, codec, or load boundary.
 */

import type { DocumentIoRequest, DocumentSaveAck } from './documentIo'

export type PaneId = 'left' | 'right'
export type EditorMode = 'wysiwyg' | 'source'
export type DocumentId = string
export type ViewId = string
export type FileKey = string
export type DiskRevision = string
export type DocumentLineEnding = 'lf' | 'crlf'
export type TrailingNewlinePolicy = 'trim' | 'ensure-one' | 'preserve' | 'disabled'

/** JSON-only file representation metadata; never import legacy IFileState here. */
export interface DocumentEncoding {
  readonly encoding: string
  readonly isBom: boolean
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

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
  readonly conflict?: boolean
  readonly encoding?: DocumentEncoding
  readonly lineEnding?: DocumentLineEnding
  readonly adjustLineEndingOnSave?: boolean
  readonly trailingNewline?: TrailingNewlinePolicy
}

export interface StartupTarget {
  readonly fileKey: FileKey
  readonly title?: string
}

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

/** Explicit targets always win over ordinary (future) workspace restore. */
export type StartupIntent =
  | { readonly kind: 'no-target' }
  | { readonly kind: 'explicit-targets'; readonly targets: NonEmptyReadonlyArray<StartupTarget> }

export type WorkspaceSeed =
  | { readonly kind: 'clean-new-tab'; readonly targets: readonly [] }
  | { readonly kind: 'explicit-targets'; readonly targets: NonEmptyReadonlyArray<StartupTarget> }

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
  | { readonly kind: 'new-tab'; readonly paneId?: PaneId; readonly markdown?: string }
  | { readonly kind: 'open-document'; readonly document: WorkspaceDocumentInput }
  | { readonly kind: 'activate-view'; readonly paneId: PaneId; readonly viewId: ViewId }
  | { readonly kind: 'focus-pane'; readonly paneId: PaneId }
  | { readonly kind: 'split-pane'; readonly targetPaneId: PaneId }
  | { readonly kind: 'move-view'; readonly viewId: ViewId; readonly targetPaneId: PaneId }
  | { readonly kind: 'close-view'; readonly viewId: ViewId }
  | { readonly kind: 'close-focused-view'; readonly paneId?: PaneId }
  | { readonly kind: 'save'; readonly paneId?: PaneId }
  | {
    readonly kind: 'save-as'
    readonly paneId?: PaneId
    readonly fileKey: FileKey
    readonly title?: string
  }
  | {
    readonly kind: 'rename'
    readonly paneId?: PaneId
    readonly fileKey: FileKey
    readonly title?: string
  }
  | { readonly kind: 'set-encoding'; readonly paneId?: PaneId; readonly encoding: DocumentEncoding }
  | {
    readonly kind: 'set-line-ending'
    readonly paneId?: PaneId
    readonly lineEnding: DocumentLineEnding
  }
  | {
    readonly kind: 'set-adjust-line-ending-on-save'
    readonly paneId?: PaneId
    readonly adjustLineEndingOnSave: boolean
  }
  | {
    readonly kind: 'set-trailing-newline'
    readonly paneId?: PaneId
    readonly trailingNewline: TrailingNewlinePolicy
  }
  | { readonly kind: 'commit-authorized'; readonly capability: WorkspaceCapability }
  /** Assembly-only adoption of a T04b authenticated binding fence. */
  | {
    readonly kind: 'apply-document-io-bind'
    readonly documentId: DocumentId
    readonly documentRevision: number
    readonly previousOwnerFence: string
    readonly ownerFence: string
  }
  | { readonly kind: 'apply-save-ack'; readonly ack: DocumentSaveAck }
  /** Assembly-only JSON warning update for conflict/recovery presentation. */
  | { readonly kind: 'replace-warnings'; readonly warnings: readonly WorkspaceWarning[] }

export interface WorkspaceCapability {
  readonly action: 'close-view'
}

export type WorkspaceResult =
  | {
    readonly status: 'applied'
    readonly workspaceRevision: number
      /** Present only for a controller-issued T04 DocumentIO request. */
    readonly documentIoRequest?: DocumentIoRequest
  }
  | { readonly status: 'needs-decision'; readonly capability: WorkspaceCapability }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string }

export interface WorkspaceProjectionTab {
  readonly viewId: ViewId
  readonly documentId: DocumentId
  readonly title: string
  readonly fileKey?: FileKey
  readonly dirty: boolean
  readonly conflict: boolean
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

/**
 * Renderer-local, controller-derived compatibility data.  Unlike the public
 * shell projection it includes editor content, but it is never sent across an
 * IPC boundary and never contains a lease, owner fence, or disk revision.
 */
export interface WorkspaceFacadeDocument {
  readonly viewId: ViewId
  readonly documentId: DocumentId
  readonly fileKey?: FileKey
  readonly title: string
  readonly markdown: string
  readonly portableHistory: PortableHistory
  readonly dirty: boolean
  readonly conflict: boolean
  readonly encoding: DocumentEncoding
  readonly lineEnding: DocumentLineEnding
  readonly adjustLineEndingOnSave: boolean
  readonly trailingNewline: TrailingNewlinePolicy
  readonly cursor: CursorPosition
  readonly selection: SelectionRange | null
  readonly scrollTop: number
  readonly mode: EditorMode
  readonly toc: readonly WorkspaceTocItem[]
  readonly status: WorkspaceStatus
}

export interface WorkspaceFacadeSnapshot {
  readonly projection: WorkspaceProjection
  readonly documents: readonly WorkspaceFacadeDocument[]
}

export interface EditorBindingSnapshot {
  /**
   * Complete, controller-issued binding identity.  This is deliberately a
   * delivery capability rather than projection data: it may only cross the
   * controller-to-surface boundary.
   */
  readonly paneId: PaneId
  readonly documentId: DocumentId
  readonly viewId: ViewId
  readonly lease: EditorLease
  readonly documentRevision: number
  readonly workspaceRevision: number
  readonly document: {
    readonly documentId: DocumentId
    readonly fileKey?: FileKey
    readonly observedDiskRevision?: DiskRevision
    readonly ownerFence: string
    readonly markdown: string
    readonly dirty: boolean
    readonly conflict: boolean
    readonly documentRevision: number
    readonly portableHistory: PortableHistory
    readonly title: string
    readonly encoding: DocumentEncoding
    readonly lineEnding: DocumentLineEnding
    readonly adjustLineEndingOnSave: boolean
    readonly trailingNewline: TrailingNewlinePolicy
  }
  readonly view: ViewState
  readonly toc: readonly WorkspaceTocItem[]
  readonly status: WorkspaceStatus
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
  /** Optional assembly lifecycle hook; the controller invokes it on release. */
  dispose?(): void
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
  /** Controlled delivery-edge check; never expose this through a projection. */
  isSnapshotCurrent(snapshot: EditorBindingSnapshot): boolean
  report(lease: EditorLease, report: EditorReport): WorkspaceResult
  flush(lease: EditorLease): Promise<WorkspaceResult>
  handoffMode(lease: EditorLease, mode: EditorMode): Promise<WorkspaceResult>
  refresh(lease: EditorLease): Promise<WorkspaceResult>
  /** Assembly lifecycle only; revokes the reporter generation synchronously. */
  dispose(): void
}

/** The ordinary application-facing surface. Editor binding is assembly-only. */
export interface WorkspaceController {
  execute(command: WorkspaceCommand): Promise<WorkspaceResult>
  getProjection(): WorkspaceProjection
  getFacadeSnapshot(): WorkspaceFacadeSnapshot
  subscribe(listener: (projection: WorkspaceProjection) => void): () => void
  /** Assembly lifecycle only; releases all bindings and makes future commands inert. */
  dispose(): void
}
