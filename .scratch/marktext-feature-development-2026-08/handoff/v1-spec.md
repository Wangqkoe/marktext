# Workspace Features V1 — implementation specification

Status: accepted handoff

This is the sole implementation specification for the Wayfinder destination. It
links to the resolved Issues that own decisions; the map remains an index, not a
second copy of this contract.

## Goal and non-goals

Deliver coordinated desktop workspace features without weakening document
ownership or recovery: lossless cross-window tabs, a left/right two-pane workspace,
styled raw-HTML `details`, and default-off normal startup with independent
emergency recovery. The accepted scope is owned by
[Issue 01](../issues/01-define-v1-product-boundaries.md) and
[Issue 12](../issues/12-define-startup-restore-emergency-recovery-boundary.md).

V1 excludes more than two panes, vertical/nested splits, a document displayed in
both panes, persistence of a user click on `details`, Markdown parsing inside raw
HTML, preferences redesign, release/publishing, normal workspace restore setting/
UI, normal session migration, automatic `editorBufferStore` load, and any fallback
that turns a window-boundary crossing, blur, or timeout into detach.

## Canonical domain terms and seam

The terms below are normative and come from [Issue 04](../issues/04-design-pane-scoped-workspace-model.md),
[Issue 09](../issues/09-design-tab-transfer-ipc-contract.md),
[Issue 11](../issues/11-design-workspace-controller-interface.md), and
[Issue 12](../issues/12-define-startup-restore-emergency-recovery-boundary.md).

| Term | Meaning |
| --- | --- |
| Document | Window-local editable buffer: canonical saved path or stable untitled identity, Markdown, save/conflict state, and portable history. |
| View / Tab / Pane | A View owns cursor/selection/scroll/mode; a Tab orders one View in a Pane; a Pane owns ordered tabs, its active tab, and one editor adapter. |
| WindowWorkspace | One or two panes, focused pane, and split ratio. A saved path is unique within it; a View moves but does not duplicate a Document. |
| WorkspaceController | Deep renderer-side owner of registry, reducer and focus routing. Its ordinary public surface is `execute`, `getProjection`, and `subscribe`; assembly alone may `bindPaneEditor`. |
| DocumentRecord | Controller-private document truth: Markdown, portable history, dirty/conflict state, canonical FileKey, and save/encoding/line-ending and related document metadata. |
| ViewRecord | Controller-private per-view truth: cursor, selection, scroll, mode, TOC, status/caret, and necessary view-local UI state. |
| WorkspaceProjection | Deep-frozen JSON-only display shell derived from the Controller. It contains defensive copies of permitted metadata, never Markdown, history, Muya blocks/DOM, callbacks, or leases. |
| EditorBindingSnapshot | The controlled Controller-to-editor-surface delivery object for Markdown, portable history, and the bound ViewRecord state. Every snapshot carries `documentId`, `viewId`, Controller-created opaque `EditorLease`/generation identity, `documentRevision`, and `workspaceRevision`; it is not a Pinia state backchannel. |
| StartupIntent | The launch request: no explicit target, or explicit associated/CLI/other file targets. It is not normal workspace state. |
| DefaultStartupPolicy | Current V1 policy: no explicit target creates one clean New Tab; explicit targets seed/open only themselves. |
| NormalWorkspaceRestore | Future optional adapter controlled by a default-off setting, and eligible only with no explicit StartupIntent. It is unavailable in current V1. |
| EmergencyRecovery | Always-on unified scan of CrashDraftRecovery and MoveRecovery. It is independent of NormalWorkspaceRestore and never suppressed by explicit targets. |
| CrashDraftRecovery | Emergency checkpoint/store for a dirty saved or untitled Document plus minimal View state on crash/power loss. It never represents a clean normal workspace. |
| MoveRecovery | TabTransfer's durable cross-window Move WAL/capsule source. It does not cover documents that never entered Move. |
| EditorLease | Unforgeable pane/view/mode binding. All report/flush/handoff operations validate it atomically; a stale lease is inert. |
| DiskRevision / FileKey | Canonical file key plus SHA-256 of persisted bytes. mtime/size are hints only. |
| TabTransfer / capsule | Deep main-process Move transaction. A capsule is durable serialized portable state, addressed by digest; it never carries DOM, Muya instances, callbacks, or leases. |

`WorkspaceCommand` is a closed typed union; every menu/shortcut targets
`FocusedPane` and no operation reads or writes ambient `currentFile`. The
WorkspaceController/DocumentRecord exclusively own Markdown, portable history,
dirty/conflict state, canonical FileKey, and save/encoding/line-ending/document
metadata. ViewRecord exclusively owns cursor, selection, scroll, mode, TOC,
status/caret and required view-local UI state. `WorkspaceProjection` is a
deep-frozen, JSON-only shell/display mirror with defensive copies; it excludes
Markdown, history, Muya blocks/DOM, callbacks and leases. `EditorBindingSnapshot`
is the only controlled Controller-to-concrete-editor delivery surface for the
otherwise non-projectable Markdown/history and bound View state.

Each `EditorBindingSnapshot` binds `documentId`, `viewId`, the opaque
Controller-created `EditorLease` (or equivalent unforgeable generation identity),
`documentRevision`, and `workspaceRevision`. The adapter and concrete editor
surface MUST validate that complete identity atomically against the Controller's
current pane/view/binding before they submit a report, stage a refresh, activate a
refresh, or apply its contents. A rebind, pane switch, or mode handoff revokes the
old generation before exposing its successor. Late snapshots are rejected during
both refresh staging and activation: an old A snapshot MUST NOT activate or alter
the editor, Pinia facade, or Controller after B is current, and B's lease and
snapshot remain valid. This validation remains at the controlled delivery edge;
`WorkspaceProjection` continues to expose neither Markdown nor history (nor a
lease or other editor-binding capability).

Pinia/editor store is temporarily a projection-derived readonly compatibility
facade. Controller subscription is its only data source: a Pinia mutation cannot
write back to or change Controller truth, and no component may use it as a second
runtime owner. Legacy direct `IFileState` mutations must be replaced at their
consumer boundary. Save, rename, encoding, line-ending, close and command routes
go through `WorkspaceCommand` → controller port → typed result; they do not mutate
projection/Pinia data. T04 supplies DocumentIO/CAS through a separate port and
ACK command/result seam; an ACK applies only while its document identity,
document revision, FileKey/DiskRevision and ownership fence remain current.
Every pane composition receives the same controller instance. A global bus is
allowed only as a destructible legacy-fallback edge; T03's formal two-pane mount
MUST NOT use it. Public results are `applied`,
`needs-decision`, `rejected`, and `failed`—there is no fifth public result.
After `commit-authorized`, `TabTransfer` may be internally recovering and the
projection may show a recovery warning, but `execute` remains pending until
recovery, activation, focus and checkpoint finish, then returns `applied`.
Capability tokens bind command kind,
targets and revisions, are single-use, and atomically reject stale/replayed or
kind-mismatched operations.

T01 establishes typed runtime/emergency ports and deterministic memory substitutes;
T04 supplies `FileKey`/`DiskRevision`; T05 owns MoveRecovery; and T06 owns the
independent production CrashDraft store, lifecycle, and both-source Electron scan.
T02 is a retained, failed-review intermediate lease migration and is never a
standalone integration candidate. T02b inherits its commits and binds the
production `PaneEditorAdapter`, controller composition, one-way projection mirror
and compatibility facade as one diff from fixed integration baseline `7ae5e2f4`
(which already integrates independently reviewed T04 and releases its typed CAS
seam). CrashDraft identity, revision, durable-write,
fallback, conflict, tombstone, and clean-marker rules are normative in
[Issue 12](../issues/12-define-startup-restore-emergency-recovery-boundary.md#crashdraftrecovery-durability-contract)
and are accepted through A02/A08/A13/A14. A future NormalWorkspaceRestore may add
a normal snapshot/store and codec behind its setting, but is not part of this V1.

## Startup and recovery boundary

The startup order is mandatory. First, always scan and advance CrashDraftRecovery
and MoveRecovery. Next honor StartupIntent: explicit files open only the requested
target set and suppress NormalWorkspaceRestore, never either emergency source. With
no explicit target, current V1 uses DefaultStartupPolicy and creates one clean New
Tab; a future enabled NormalWorkspaceRestore may replace that default only after
its adapter exists. Emergency contents go through a safe recovery window/flow while
explicit files still open according to intent; it is deliberately unspecified
whether they appear in the same window.

MUST preserve ordinary dirty-exit save/discard/cancel semantics and the Issue 12
durability contract. NEVER treat an ordinary snapshot as emergency truth, silently
load normal state while default-off, auto-overwrite disk from a CrashDraft, delete
either emergency source when removing normal restore, suppress emergency recovery
for explicit files, or expose an inert restore setting. Legacy normal-session/
`editorBufferStore` data is ignored but not deleted or overwritten. The local reference
`codex/workspace-restore-option@7636e01a` is not a merge source; any later adapter
selectively migrates current compatible material from the then-current integration
branch.

## Two-pane workspace behavior

Split has at most left and right panes. A broad 31% edge band previews the chosen
side as a live 50/50 divide; release commits it. Width below 720px disables split
but not reorder. Each pane has a 320px minimum; its divider is draggable, clamps
there, and double-click resets to 50/50. Standard transition is 180ms and reduced
motion is 0ms. `Split Right` is the only flat context-menu command; left split is
the drag band. These geometry and interaction decisions are owned by
[Issue 05](../issues/05-prototype-split-layout-and-motion.md) and the accepted
destination evidence in [Issue 03](../issues/03-prototype-tab-drag-destinations.md).

Splitting a single pane moves its active tab to the requested side and leaves the
remainder opposite. A second split is rejected. Moving a tab between panes moves
its View. Empty panes auto-collapse; closing all content makes one clean untitled
page. `FocusedPane` routes title, TOC, status/caret/word count, mode, commands,
menus, shortcuts, find and formatting; autosave, observation and recovery run for
every Document. Switching a tab flushes/refreshes only its pane. This V1 preserves
workspace state only for the live runtime; ordinary restart does not restore pane
count, tab membership, focus, active tab, split ratio, scroll, or mode.
CrashDraftRecovery is governed by its independent crash-draft store and safe
recovery flow; MoveRecovery alone is governed by the Move WAL/journal. The complete
runtime invariant source is [Issue 04](../issues/04-design-pane-scoped-workspace-model.md),
as bounded by [Issue 12](../issues/12-define-startup-restore-emergency-recovery-boundary.md).

## Cross-window behavior and durable safety

Move supports saved, dirty and untitled tabs and is a lossless ownership transfer:
content, dirty/save/conflict state, cursor/selection/scroll, mode, and portable
history transfer; IME composition and other transient DOM state first end safely
and are not transferred. The source deletes only after target ownership ACK. On a
pre-authorization failure, source stays intact. If it was the last tab, successful
Move leaves source with a clean untitled tab, then focuses target. Context-menu
Move uses existing new-window geometry plus source offset; valid drag detach places
near release and clamps to active display work area. Sources:
[Issue 02](../issues/02-define-cross-window-transfer-contract.md) and
[Issue 09](../issues/09-design-tab-transfer-ipc-contract.md).

Open is saved-path only. A dirty source requires an explanation/decision; target
opens the last disk version as a separate window-local Document with initial
history. Both windows may edit. A save makes a clean peer reload and a dirty peer
conflicted; normal save then blocks until reload/discard, Save As, or a second,
explicit, single-use overwrite confirmation. There is no silent last-save-wins.

The durable Move states are exactly `requested → source-prepared → target-staged
→ commit-authorized → source-released → target-activated → completed`. Each
irreversible action is `fsync intent → idempotent command → query/ACK → fsync
observed`. Abort is legal only before `commit-authorized`; after that recovery can
only roll forward. Preparation flushes the EditorLease and establishes a revision
fence, blocking edit/save/close/retransfer; a second sealed ACK must match before
authorization. Pre-authorization boot/stage timeout is 15s with 5s ACK
retry/cadence. Post-authorization timeout is recovery, never source rollback.

The MoveRecovery journal is transfer truth for Move only. It records owner migration
and a recovery window flow before restoring it; no source/old target normal session
may revive moved content. CrashDraftRecovery separately protects dirty saved and
untitled documents that never entered Move. Neither is a normal workspace snapshot,
and both remain active under DefaultStartupPolicy or explicit StartupIntent.
`completed` requires source release, target activation and session checkpoint plus
journal fsync. Capsule SHA-256 covers exact stored bytes, tombstones/GC after
abort/completion are bounded, and deletion failure cannot make a capsule the only
copy. History encoding failure rejects before authorization; post-authorization
corruption retains content/View, clears history and warns. These constraints are
owned by [Issue 09](../issues/09-design-tab-transfer-ipc-contract.md).

`FileObservationHub` has at most one OS watcher per canonical FileKey and leases
subscriber generations. Authorization atomically persists owner/generation,
revokes the source lease and grants target successor; old-generation events are
invalid, and hidden staging has no watcher. Same-file writes serialize in main and
CAS their expected DiskRevision before write, then hash landed bytes. Own-save
suppression is writer-only (`writeId + FileKey + hash`); Open peers still observe.
Late DocumentIO ACKs may update state only when document identity, revision and
ownership remain current. Sources: [Issue 09](../issues/09-design-tab-transfer-ipc-contract.md)
and [Issue 11](../issues/11-design-workspace-controller-interface.md).

The implementation must make the watcher-generation handoff observable in its
memory and Electron tests: source generation is revoked in the authorization
critical section, target successor is durable before activation, and a delayed old
generation event cannot update either owner.

## Endpoint, gesture, and platform rules

`RequestId` comes from WorkspaceController and `TransferId` from main. Same source
and fingerprint replay returns the same result; a changed fingerprint rejects.
Participants are idempotent by TransferId/phase. Commit capability binds transfer,
role, both WindowSessionIds, endpoint epoch, capsule digest and document revision;
payload window ID is untrusted. Reload/navigation/destroy invalidates the endpoint,
and old endpoints must reject. This is at-least-once delivery with business-once
effects, not transport exactly-once. [Issue 09](../issues/09-design-tab-transfer-ipc-contract.md)
owns this contract.

External detach starts only with trusted tab left-down. An event-level native
observer emits move/up/Escape to a narrow main adapter; only the same gesture
session's outside left-up commits. Re-entry clears then later exit rearms; Escape
cancels. Remote and assistive input are valid when they meet that event-level
contract—prototype `injected` filtering is not product policy. Windows 11
single-primary (2560×1440, 96 DPI) physical evidence is accepted. Windows
multi-display/mixed-DPI, macOS and Linux are unavailable, so V1 disables external
detach there and retains Move menu action. Do not substitute any alternate trigger.
Evidence and fallback are owned by [Issue 10](../issues/10-prove-native-external-release-gesture.md).

## Raw HTML `details` behavior

V1 styles the existing sanitized raw-HTML preview, rather than adding a Markdown
widget. It uses Minimal inline row: `▶` closed / `▼` open, whole native `summary`
hit target, native mouse/Enter/Space, hover/focus-visible, 170ms normal / 0ms
reduced motion, and semantic light/dark tokens. An external `</>` button (visible
on hover or focus-visible) enters raw source editing; Escape or Preview rebuilds
preview. Click state is temporary and never rewrites Markdown; source `open`
sets rebuilt preview initial state. `disableHtml` shows escaped source, with no
native disclosure. Editor-only styling never exports: HTML/PDF retain standard
`details`/`open` markup. Sources: [Issue 07](../issues/07-prototype-details-disclosure.md)
and [Issue 06](../issues/06-research-current-html-details-behavior.md).

The prototype proved static native interactions, but Electron/Muya delegation,
screen readers, DOMPurify details attributes, actual theme tokens, export and CSS
specificity remain product acceptance work. Existing source evidence establishes
Muya's HTML block preview/source boundary, sanitization and round-trip path; it
does not turn a browser inference into accepted runtime evidence.

## Risk, rollback and implementation gates

Do not copy prototypes into production. Build/test pure deep modules and memory
adapters first; only then attach Electron, renderer UI or native hooks. Pane
persistence, shared editor state, projection/controller ownership, filesystem/CAS,
WAL/recovery, IPC/endpoint and native gesture changes are high risk: implementation and independent Standards +
Spec review must use `gpt-5.6-terra` / `high`. Other implementation uses
`gpt-5.6-terra` / `medium`. Every integration happens on the coordination branch,
re-runs proportional checks, and updates the frontier.

The T02b cutover is incremental but has explicit rollback boundaries: first make
the Controller authoritative and export projection/snapshots, then replace each
direct Pinia/IFileState consumer with the readonly facade or command/port result,
then mount both panes with the shared controller, and finally delete each bounded
legacy bridge once its consumers have moved. Revert a completed boundary by
restoring that consumer to the prior adapter edge, never by retaining a long-lived
dual-write/dual-truth state. Preserve data-safe save/close behavior and T04's
DocumentIO ACK fence throughout; do not use global bus routing in the formal
two-pane mount.

Before `commit-authorized`, an operation may abort and remove its staged target;
after it, rollback means journal-driven forward recovery only. Never ship a data
migration that cannot retain legacy emergency data or partial salvage. Feature flags
or capability gates must default unsafe external detach off; reverting UI exposure
must not delete sessions, capsules or journals. A release requires automated
matrix evidence, Windows manual trial, zero unresolved critical defects, final
independent review, and user acceptance. See the executable evidence plan in
[acceptance matrix](acceptance-matrix.md).
