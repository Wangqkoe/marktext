# T06 — Electron transfer, startup, and emergency recovery integration

Wave: 6 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T02
production completion, T03, T04, T04b, T05

## Result

Attach the proven controller/transfer modules to Electron authenticated endpoints,
window creation, StartupIntent, DefaultStartupPolicy, and emergency recovery. T06
reuses T04b's DocumentIO bridge; it implements the production CrashDraftRecovery
checkpoint/store and lifecycle for ordinary dirty saved and untitled documents,
clean-shutdown determination, and the startup scan/advance of both
CrashDraftRecovery and MoveRecovery. It does not
implement NormalWorkspaceRestore, a restore setting/UI, normal session codec/
migration, native external-release capture, menus, or details UI.

Inputs: [V1 Spec](../v1-spec.md), [启动常规恢复与紧急恢复边界](../../issues/12-define-startup-restore-emergency-recovery-boundary.md),
[Issue 02](../../issues/02-define-cross-window-transfer-contract.md), and
[Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md).

## Ownership and boundary

Own existing `packages/desktop/src/main/windows/editor.ts`, `main/app/windowManager.ts`,
`main/app/index.ts`, and `main/editorBufferStore/index.ts` only to prevent automatic
normal restore without deleting or overwriting legacy data; also own `main/ipc/index.ts`,
`main/ipc/window.ts` only for transfer/startup routing. T04b owns DocumentIO
coordinator registrations, preload exposure, shared IPC declarations, global
declarations and renderer DocumentIO adapter; T06 must not duplicate or modify
those DocumentIO sections. After T04b integrates, T06 adds any transfer/startup
route at the recorded separate insertion point. Create production CrashDraftRecovery
files beneath existing `src/main/`, narrow renderer endpoint/assembly glue under
`renderer/src/workspace/`, and exact Electron tests
`test/e2e/{workspace-transfer-electron,workspace-startup-policy}.spec.ts` plus
`test/unit/specs/crash-draft-recovery.spec.ts`.

T06 runs after T04b and T02 production completion, adds only a narrow endpoint
assembly file, and does not overwrite their controller/pane bindings. Renderer
glue sees only commands/projection/endpoint messages, never Move WAL/capsules, CrashDraft store,
or watcher leases. T05 remains the sole MoveRecovery owner. Never introduce a
shared/ambiguous normal-or-emergency persistence `load()`: future normal restore
storage, CrashDraft store, and Move WAL/capsules are distinct boundaries.

## Implementation boundary

First scan/advance both emergency sources. CrashDraft checkpoints only dirty saved
and untitled Document content plus minimum View state required to recover loss; a
clean shutdown marker/equivalent boundary prevents clean tabs/split/focus/active/
scroll/mode restoration. Normal dirty exit still presents save/discard/cancel and
only completed save/discard clears/closes the corresponding draft. MoveRecovery
then follows its journal owner flow. Next parse StartupIntent: no target creates
exactly one clean New Tab; explicit associated/CLI targets open only those targets
and suppress normal restore, never emergency. Emergency recovery uses a safe
recovery window/flow while explicit targets still open; no same-window requirement.

For CrashDraftRecovery, implement the durable contract in
[Issue 12](../../issues/12-define-startup-restore-emergency-recovery-boundary.md#crashdraftrecovery-durability-contract): each versioned envelope binds stable
Document identity and, for saved documents, canonical FileKey, observed
DiskRevision, monotonic documentRevision, Markdown bytes/minimum View, and a
digest. Retain the last valid record until temp-write, fsync, atomic replace and
directory fsync (or verified equivalent) complete; only then ACK the checkpoint
revision. Scan validates schema/digest, selects the highest complete monotonic
revision and warns while falling back from an interrupted/corrupt latest record.
Never overwrite disk automatically: a changed current DiskRevision yields a
conflicted recovered copy for user decision. Clear only after durable matching save
ACK or explicit durable discard tombstone; cancel clears nothing. Make the global
clean marker durable only after every document decision and per-document tombstone
are durable. Inject faults across temp write/fsync/replace/directory-fsync/
tombstone/marker gaps, stale ACK, disk-revision conflict, and corrupt-latest
fallback. This production CrashDraft store is independent of legacy normal storage
and uses T04's FileKey/DiskRevision boundary.

Do not expose a restore preference or invoke normal `editorBufferStore`/normal
snapshot load, codec, migration, or saved workspace restoration. Legacy normal
snapshot data is ignored but retained byte-for-byte/no overwrite after a no-restore
launch; test that explicitly.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts`,
`pnpm -C packages/desktop exec vitest run test/unit/specs/crash-draft-recovery.spec.ts`,
`pnpm -C packages/desktop exec playwright test test/e2e/workspace-transfer-electron.spec.ts test/e2e/workspace-startup-policy.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check. Startup tests force-kill/
simulate power loss after dirty saved and untitled edits and assert default-off
CrashDraft recovery; test explicit targets plus concurrent recovery, clean exit
does not restore old tabs/split, dirty save/discard/cancel lifecycle, no restore UI,
and legacy normal data retained after launch. CrashDraft tests fault-inject every
durability gap, reject stale checkpoint ACKs, fall back with a warning from corrupt
latest state, and recover a changed saved file as a conflicted copy. Also simulate
endpoint reload, forged window ID, late ACK, post-authorization restart and target
creation failure.

Manual Move/Open covers saved/dirty/untitled/last tab, target focus, recovery
warning and real two-window observation reload/conflict. Commit only listed
files/tests. Independent terra/high Standards + Spec review is mandatory before
user-facing exposure.
