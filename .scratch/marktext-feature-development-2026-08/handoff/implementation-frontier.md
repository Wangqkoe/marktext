# Implementation frontier

This is the execution order for the tickets; normative behavior remains in the
[V1 Spec](v1-spec.md), and pass/fail evidence remains in the
[acceptance matrix](acceptance-matrix.md).

| Wave | Tickets that may run together | Integration frontier / gate |
| --- | --- | --- |
| 1 | [T01](tickets/01-workspace-runtime-no-restore.md), [T09](tickets/09-muya-details-engine-and-roundtrip.md) | runtime DefaultStartupPolicy/EmergencyRecovery boundary and details semantics pass; no normal codec/session adapter is claimed |
| 2 | [T02b](tickets/02b-workspace-projection-controller-ownership.md) | T02 is a retained failed-review intermediate and cannot integrate alone. T04 is integrated and independently reviewed at `7ae5e2f4`, so its FileObservationHub/FileKey/DiskRevision/CAS port is consumable while T04 remains the sole watcher/hash/save-I/O owner. T02b is the corrective implementation gate: it establishes Controller-exclusive Document/View truth, generation-validated EditorBindingSnapshot delivery, and a one-way readonly Pinia projection facade, then requires independent terra/high review and integration before dependent runtime-state work proceeds. Neither adds ordinary restart restore. |
| 3 | [T03](tickets/03-split-workspace-and-tab-drag-ui.md), [T10](tickets/10-desktop-details-theme-export-integration.md) | T03 must wait for T02b independent terra/high review and integration, then mounts both panes using the same injected Controller and no global bus. T10 may consume the released editor seam only after T02b; live pane state remains no-restore. |
| 4 | [T05](tickets/05-tab-transfer-wal-recovery-core.md) | T05 work that consumes real Document/View state is blocked on T02b plus T04's FileKey/DiskRevision seam; all MoveRecovery WAL gaps pass. |
| 5 | [T06](tickets/06-electron-transfer-startup-emergency-recovery.md), [T07](tickets/07-windows-native-external-release-adapter.md), [T08](tickets/08-menus-localization-and-command-routing.md) | T06/T08 real runtime-state work remains blocked on T02b (and T04/T05 as applicable); T08 routes every surface via FocusedPane commands/results. T07 remains independently gated by its supported-release proof or disabled fallback. |
| 6 | [T11](tickets/11-cross-feature-e2e-and-integration.md) | after T02b/T03/T04/T05/T06/T08, coordination-branch integration reruns proportional matrix checks and rejects feature fixes into new owner tickets |
| 7 | [T12](tickets/12-windows-trial-final-review-and-acceptance.md) | T12 gives clean-build/Windows-trial readiness evidence to the coordination task. The coordinator creates independent terra/high Standards + Spec reviews, routes defects, requests user Acceptance, and alone declares completion. |

The only shared foundational directories are new `src/shared/workspace/` and
renderer `src/renderer/src/workspace/`: T01 creates shared runtime/startup types and
controller ports/memory adapters, not a normal session codec. T02b owns the
necessary shared workspace type/index extensions, renderer controller/composition/
adapter/mirror, editor store, and required tabs/index/app/commands/search/sidebar/
rename consumers plus their unit/E2E coverage. T04 retains sole ownership of
FileKey/DiskRevision and DocumentIO/CAS implementation; T02b consumes its port/ACK
contract only. T03 owns `editorWithTabs/index.vue` and the optional narrow
`pages/app.vue` assembly seam only after T02b releases its editor binding; T10 then
owns `editor.vue` after T02b. T06 may add its separate renderer endpoint adapter
only after T02b/T03 are integrated. All other tickets have disjoint ownership as
declared in their files. Recompute this frontier after each integration.
