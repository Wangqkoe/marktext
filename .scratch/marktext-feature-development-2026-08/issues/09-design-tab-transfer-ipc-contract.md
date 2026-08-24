# 设计 TabTransfer IPC 与文件所有权契约

Type: `grilling`
Status: `resolved`
Claimed by: coordination task

## Question

Define the serializable Document/View snapshot and the source renderer → main → target renderer two-phase transaction and ACK contract. Specify timeout, idempotency, and rollback behavior; file-watcher handoff; session-restore mapping; the stale/conflict guard; and a testable seam for this high-risk cross-process ownership boundary.

## Comments

- This is high-risk work. Resolve it with `codebase-design` and `domain-modeling`, then require an independent `gpt-5.6-terra` at `high` review before implementation handoff.
- Independent `gpt-5.6-terra` `high` review: **PASS**.

## Answer

The accepted contract is the following.

### Boundary and seams

`TabTransfer` is a deep main-process module. Its internal entry points are `run(intent)` and `recover`; ordinary UI callers invoke the operation only through `WorkspaceController.execute`. The module owns the transfer state machine, capsule, WAL, capabilities, idempotency, session ownership, and watcher handoff. Its external interface exposes intent/result and recovery projection only; it does not expose renderer snapshots, IPC receipts, leases, DOM objects, or callback state.

The seam is `TransferTransport`, with an Electron production adapter and a deterministic in-memory adapter. The production adapter owns IPC/window endpoint delivery and the memory adapter supplies deterministic ACK, duplicate, reorder, timeout, kill/restart, and recovery tests. `TabTransfer` reuses the Issue 11 `WorkspacePersistence`, `DocumentIO`, and related internal seams. This is a deep module because the invariant-heavy transaction and recovery policy must remain in one owner; the narrow interface gives high leverage at the command/recovery boundary, while adapters isolate Electron and filesystem effects. Locality is preserved by keeping transport, persistence, watcher ownership, and endpoint epochs behind the module rather than spreading protocol state across renderers.

### Move capsule and ownership

Move is a lossless ownership transfer for saved, dirty, and untitled tabs. Main creates a durable capsule and atomically persists its schema/version and digest. The digest is the streaming SHA-256 of the exact stored bytes; IPC carries only a capsule reference and digest, never the payload. There is no fixed product-size limit and no truncation.

The capsule contains portable document identity (saved canonical path or stable untitled identity), source lineage, Markdown, dirty/save/conflict/options state, `DiskRevision`, portable versioned MarkText history, and View mode, cursor, selection, and scroll. The target allocates new window-local `DocumentId`, `ViewId`, and `TabId`. Window geometry is separate `TargetWindowSpec`. The capsule must not contain Muya objects, DOM/cache state, callbacks, or leases. History that cannot be encoded pre-authorization rejects the transfer; corruption detected after authorization preserves content and View, clears history, and emits a warning.

### WAL and transaction

The exact durable states are:

`requested → source-prepared → target-staged → commit-authorized → source-released → target-activated → completed`.

Every irreversible effect follows `fsync *-intent(opId) → idempotent command → query/ACK → fsync *-observed`; intent and observed records are separate. Abort is legal only before `commit-authorized`. After authorization the operation can only roll forward through `recover`, never roll back or return ownership to the source.

Source preparation asks the `EditorLease` to flush, establishes a document-revision transfer fence, and rejects edit, save, close, and retransfer attempts. Before authorization, main obtains a second sealed ACK for the same revision; a mismatch or invalid fence aborts. After durable hidden target staging ACK, main fsyncs `commit-authorized` and requests source deletion. If this was the source's last tab, the source receives a clean untitled tab. The target becomes active and focused, checkpoints its session, and only then does `WorkspaceController.execute` return `applied`.

Boot/stage timeouts before authorization are 15 seconds. Participant ACKs use a 5-second timeout/retry cadence. A post-authorization timeout enters `recovering`; it does not invalidate the transfer or send ownership back to source.

### Sessions, recovery, and capsule lifecycle

`WindowSessionId` is stable. `BrowserWindow` and `webContents` are used only for the currently authenticated route; the journal is the sole owner of transfer truth. Before creating a recovery window, main fsyncs `recoveryWindowSessionId` and the owner migration. Source and old-target session restore must query the journal and must not revive a document already moved. An automatic recovery window preserves title, dirty state, and untitled identity and displays a warning.

After durable abort or completed checkpoints, a capsule enters bounded tombstone/GC. `completed` requires source released, target activated and session-checkpointed, and journal fsync. A deletion failure does not keep the transfer active: the target session is already the copy of record, and a capsule cannot be retained indefinitely or treated as the only copy.

### File observation and disk revisions

`FileObservationHub` permits at most one OS watcher per canonical `FileKey`, with multiple subscriber generation leases. At `commit-authorized`, the same main critical section persists owner/generation, revokes the source logical lease, and grants the target successor generation. Events from an old generation are invalid. Hidden target staging has no watcher; an ordinary Open adds an independent subscriber.

`DiskRevision` is canonical `FileKey` plus the SHA-256 of persisted bytes. mtime and size are diagnostic/filtering hints only. Saves for the same `FileKey` are serialized in main, use CAS on the expected `DiskRevision` before writing, and hash the actual bytes after they land. Own-save suppression is writer-only and keyed by `writeId + FileKey + hash`; an Open peer must receive the observation. A clean peer reloads, a dirty peer enters conflict, and ordinary save is blocked. Reload/discard, Save As, and a single-use second overwrite confirmation are allowed. An overwrite capability binds document revision, `FileKey`, observed `DiskRevision`, and purpose; Save As needs it only when overwriting an existing target.

### Move versus Open

Move supports saved, dirty, and untitled tabs, preserves the complete state, and never degrades to Open on failure. Open supports only a saved path; a dirty source first requires a decision. The target is created from the last disk version as an independent window-local Document with initial history, and the dual windows retain the conflict guard.

### Idempotency, authentication, and gestures

`WorkspaceController` supplies `RequestId`; main generates `TransferId`. A replay with the same source and fingerprint returns the same result; a different fingerprint is rejected. Participants are idempotent by `TransferId + phase`. The single-use commit capability binds transfer, role, source and target `WindowSessionId`, endpoint epoch, capsule digest, and document revision. A payload `windowId` is untrusted. Reload, navigation, or destroy invalidates the endpoint. At-least-once delivery plus idempotency provides business-once behavior; the protocol does not claim message exactly-once.

The current valid source `webContents` and trusted tab left-down create a random gesture session. Only an outside left-up from that same session commits. Re-entry clears the candidate, a later exit rearms it, and Escape cancels. Injected flags are not used for filtering, and crossing, blur, or timeout cannot substitute for release. Remote or assistive input is accepted when it satisfies the same event-level contract. Issue 10's unverified platforms and multi-display/mixed-DPI configurations disable external drag detach; the Move menu remains available.

### Results and acceptance

Results are `needs-decision`, `rejected`, or `failed` (or `applied` on success). Rejected covers stale or missing View, in-progress work, untitled Open, unsupported detach, history that cannot be losslessly encoded, and capability errors. Failed is limited to pre-authorization target NACK/timeout, capsule/session I/O failure, or source endpoint failure while source remains complete. After authorization the result is `recovering` until finally applied.

The mandatory acceptance matrix covers every phase with kill/restart and intent/ACK gaps; duplicates, reorder, and replay; source-fence races; owner-property invariants; saved/dirty/untitled/last-tab/history cases; capsule and history corruption separately; session owner and recovery-window behavior; Move/Open watcher generations; same-`FileKey` CAS/save races, late ACKs, conflicts, and overwrite tokens; endpoint epoch/reload; Electron menu/focus/restart; Windows single-primary physical smoke; remote/assistive acceptance; old-endpoint rejection; and unsupported-platform fallback.
