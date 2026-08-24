# 设计 WorkspaceController 深模块 interface

Type: `grilling`
Status: `resolved`
Claimed by: coordination task

## Question

Define the deep `WorkspaceController` module's external interface and seam. Hide the document registry, pane reducer, focus routing, editor adapters, event scoping, and session snapshot plus migration inside its implementation. Decide the small set of commands, results, errors, and invariants that callers must know. Introduce production adapters and an in-memory test adapter only where two adapters justify the seam. Make the interface the test surface, replacing rather than layering on the old shallow global-store and event tests.

## Comments

- This is a high-risk shared-editor and persistence seam. Resolve it with `codebase-design` and `domain-modeling`, then require an independent `gpt-5.6-terra` at `high` review before implementation handoff.
- Independent `gpt-5.6-terra` `high` review: **PASS**.

## Answer

The accepted contract is:

- Ordinary callers see only `execute(command)`, `getProjection()`, and `subscribe(listener)`. `bindPaneEditor` is assembly-layer-only.
- `WorkspaceCommand` is a closed typed union. Gestures carry explicit IDs; menus and shortcuts target `FocusedPane`. No command may read or write an ambient `currentFile`.
- `execute` waits until the business result is determined. Its only public outcomes are `applied`, `needs-decision`, `rejected`, and `failed`; it does not expose `accepted`, `settled`, or an effect receipt.
- A `needs-decision` capability token is bound to the command kind and the complete set of target `Document` identities and revisions. It is single-use. Any stale, missing, replayed, or kind-mismatched token rejects the whole operation atomically; no partial operation is allowed.
- Workspace changes commit atomically and advance the workspace revision. A `Document` revision is a target-entity precondition, not a requirement on every ordinary command.
- `WorkspaceProjection` is immutable (deep-frozen or defensively copied) and JSON-only. It includes pane/tab/focus/ratio, metadata, TOC/status, and conflict/recovery warnings; it excludes Markdown, history, Muya, DOM, callbacks, and leases.
- Every pane/view/mode binding creates an unforgeable `EditorLease`. Report/flush/selection/scroll/source↔WYSIWYG handoff operations validate the lease atomically. An old lease has no side effects, and no global bus or ambient `currentFile` may write state back.
- The Issue 04 domain invariants all apply: window-local path uniqueness; stable untitled identity; a `Document` cannot appear in both Panes; View moves rather than duplicates; at most two Panes; empty-pane collapse; a clean untitled page after all content is closed; and `FocusedPane` routing.
- `DocumentIO` writes carry `documentId` and `expectedDocumentRevision` and serialize operations for the same document/path. An ACK updates saved/conflict state only when identity, revision, and ownership still match; a late success must not incorrectly clear dirty state.
- Only three production+memory seams are established: `PaneEditorAdapter`, `WorkspacePersistence`, and `DocumentIO`. `TransferTransport` remains Issue 09.
- `WorkspaceSessionCodec` is the sole shared pure V1/V2 parse/validate/migrate/partial-salvage/recovery-summary implementation; main and renderer both use it, and main must not assume top-level tabs.
- `WorkspaceSessionV2` contains Document identity/path/Markdown/save-conflict metadata/portable versioned MarkText history; View cursor/selection/scroll/mode; Pane order/active/focus/ratio; and a recovery summary. It never stores Muya-native history, DOM, or callbacks. Legacy sessions migrate to one Pane. Local corruption preserves valid content and collapses safely when necessary. History failure preserves content and View, clears history, and emits a projection warning.
- Issue 09's local typed operations are `prepare`/`accept`/`commit`/`abort`. Snapshot and IPC receipts do not leak through the `execute` result. Actual transport, timeout, and watcher ownership remain Issue 09; Issue 09 is still open but no longer blocks this Issue 11 contract.
- End-to-end and contract test surfaces cover dual-pane independence and late events; atomic rejection of stale batch confirmation; save races; session migration/corruption/history salvage; same-path handling; move/collapse; and projection immutability/serializability. They replace the old shallow global-store/bus tests rather than layering on top of them.

The design uses one deep `WorkspaceController` module so the registry, pane reducer, focus routing, editor bindings, event scoping, and session codec remain local. Its small command/projection/lease interface is the module boundary; the three seams exist only where production and memory implementations justify substitution. Adapters isolate Electron/editor/file-system effects, while the controller owns invariants and atomicity. This gives high leverage at the command and projection boundary, keeps persistence and editor ownership local to their adapters, and makes the interface the durable contract and test surface.
