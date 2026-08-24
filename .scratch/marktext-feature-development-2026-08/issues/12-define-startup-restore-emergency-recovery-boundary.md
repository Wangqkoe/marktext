# 定义启动常规恢复与紧急恢复边界

Type: `grilling`
Status: `resolved`
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
- **EmergencyRecovery** scans and advances crash/power-loss and cross-window Move
  WAL/journals. It is always enabled and is not suppressed by the setting or by an
  explicit StartupIntent.

Startup order is: (1) unconditionally scan/advance EmergencyRecovery; (2) honor
StartupIntent—explicit targets open only their requested files; (3) otherwise use
NormalWorkspaceRestore only when a future enabled adapter is available; (4) with
no available normal restore, create the clean New Tab. Emergency content restores
through a safe window/recovery flow while explicit targets still open as requested;
this decision deliberately does not require them to share a window.

Dirty normal-exit save/discard confirmation does not change. Emergency recovery is
not a normal snapshot: normal snapshot/store is a deferred adapter, whereas the
emergency journal/store is the T05/T06 source of truth. Removing normal restore
must not delete crash or Move data. The public WorkspaceController runs from
runtime state and must not require normal session load, codec, or persistence.

Current V1 implements only DefaultStartupPolicy and the required EmergencyRecovery
boundary/integration. It does not implement V1→V2 normal session migration,
automatic `editorBufferStore` loading, a restore setting/UI, or a normal
WorkspacePersistence `load()`. Old, unimplemented exploratory material remains
only as local reference `codex/workspace-restore-option@7636e01a`; any future
NormalWorkspaceRestore may selectively migrate a current compatible session/codec
from the then-current integration branch, never merge that old Controller whole.

## Comments

- This decision supersedes the normal-session portions of
  [设计 WorkspaceController 深模块 interface](11-design-workspace-controller-interface.md)
  for the current implementation handoff. Its runtime, lease, command and
  EmergencyRecovery boundaries remain applicable.
