# 定义启动常规恢复与紧急恢复边界

Type: `grilling`
Status: `resolved`
Claimed by: coordination task
Blocked by: none

## Question

How do ordinary startup, an explicit file launch, future opt-in workspace restore,
and crash/power-loss or cross-window Move recovery coexist without treating a
normal workspace snapshot as durable recovery truth?

## Answer

The canonical startup terms are:

- **StartupIntent** is the launch request: either no explicit target or one/more
  explicit file targets from association, CLI, or equivalent explicit opening.
- **DefaultStartupPolicy** is current V1 behavior. No explicit target creates one
  clean New Tab. An explicit target seeds/opens only that target set. It does not
  load ordinary tabs, split, focused pane, active tab, scroll, or mode.
- **NormalWorkspaceRestore** is a future optional adapter behind the setting
  “Restore previous workspace on startup”, default off. Once implemented, it may
  participate only when the setting is on and StartupIntent has no explicit target.
  The setting is not exposed until that adapter works.
- **EmergencyRecovery** is the combined scan input for two independent sources;
  it is always enabled and is not suppressed by the setting or explicit intent.
  **CrashDraftRecovery** preserves a dirty saved Document or untitled Document and
  only the minimum View state needed to avoid loss during an abnormal end. It is
  not a normal-close workspace snapshot and never restores clean tabs, split,
  focus, active tab, scroll, or mode. **MoveRecovery** is the separate cross-window
  Move WAL/capsule source owned by TabTransfer.

Startup order is: (1) unconditionally scan/advance both CrashDraftRecovery and
MoveRecovery; (2) honor StartupIntent—explicit targets open only their requested
files; (3) otherwise use NormalWorkspaceRestore only when a future enabled adapter
is available; (4) with no available normal restore, create the clean New Tab.
Emergency content restores through a safe window/recovery flow while explicit
targets still open as requested; this decision deliberately does not require them
to share a window.

Dirty normal-exit save/discard/cancel confirmation does not change. A clean-shutdown
marker (or equivalent finalization boundary) distinguishes CrashDraftRecovery from
normal exit: only after a completed save/discard decision may its corresponding
draft be cleared/closed. Emergency recovery is not a normal snapshot: normal
snapshot/store is a deferred adapter, CrashDraftRecovery has its own emergency
store, and MoveRecovery has its WAL/capsule truth. Removing normal restore must
not delete either emergency source. The public WorkspaceController runs from
runtime state and must not require normal session load, codec, or persistence.

Legacy normal-session/`editorBufferStore` data is ignored by current no-restore
startup but is neither deleted nor overwritten. This must be tested after a
no-restore launch and recorded in integration and Windows-trial evidence.

## CrashDraftRecovery durability contract

Each CrashDraft is bound to stable Document identity. A saved Document additionally
binds canonical FileKey, the observed DiskRevision at checkpoint, and a monotonic
documentRevision. Its versioned envelope contains Markdown bytes, only necessary
minimum View state, and a content digest/checksum.

Updating a draft is durably atomic: retain the last valid record until the newer
revision has completed temp-write, fsync, atomic replace, and directory fsync (or a
repository-verified equivalent). Only a durable ACK advances the checkpoint
revision. Scan validates schema and digest, picks the highest complete monotonic
revision, and falls back to the last valid revision with a warning when a newer
write was interrupted or corrupt; it must not discard the entire draft.

Restoring a draft never automatically overwrites disk. If a saved Document's
current DiskRevision differs from its checkpoint baseline, recover a conflicted
copy and require user resolution. After normal save, clear a draft only when the
disk write is durable and its identity/revision ACK still matches; discard clears
only after explicit decision, while cancel clears nothing. The global clean-shutdown
marker may become durable only after every Document is resolved and its per-document
tombstone is durable.

Fault injection must cover every gap around temp write, fsync, replace, directory
fsync, tombstone, and clean marker, plus stale ACK, disk-revision conflict, and
corrupt-latest fallback. T01 models monotonic/atomic/fallback behavior in memory;
T04 provides FileKey/DiskRevision; T06 provides the independent production
CrashDraft store and lifecycle without touching legacy normal-session storage.

Current V1 implements DefaultStartupPolicy plus typed/in-memory emergency boundaries
in T01; T05 implements only MoveRecovery; T06 implements CrashDraftRecovery
production store/lifecycle, clean-shutdown determination and both-source startup
scan. It does not implement V1→V2 normal migration, automatic `editorBufferStore`
loading, a restore setting/UI, or a normal workspace `load()`. Old, unimplemented
exploratory material remains only as local reference
`codex/workspace-restore-option@7636e01a`; any future NormalWorkspaceRestore may
selectively migrate a current compatible session/codec from the then-current
integration branch, never merge that old Controller whole.

## Comments

- This decision supersedes the normal-session portions of
  [设计 WorkspaceController 深模块 interface](11-design-workspace-controller-interface.md)
  for the current implementation handoff. Its runtime, lease, command and
  EmergencyRecovery boundaries remain applicable.
