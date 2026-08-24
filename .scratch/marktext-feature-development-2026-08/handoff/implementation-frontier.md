# Implementation frontier

This is the execution order for the tickets; normative behavior remains in the
[V1 Spec](v1-spec.md), and pass/fail evidence remains in the
[acceptance matrix](acceptance-matrix.md).

| Wave | Tickets that may run together | Integration frontier / gate |
| --- | --- | --- |
| 1 | [T01](tickets/01-workspace-runtime-no-restore.md), [T09](tickets/09-muya-details-engine-and-roundtrip.md) | runtime DefaultStartupPolicy/EmergencyRecovery boundary and details semantics pass; no normal codec/session adapter is claimed |
| 2 | [T02](tickets/02-pane-editor-lease-legacy-migration.md), [T04](tickets/04-file-observation-diskrevision-cas.md) | T02 delivers production PaneEditorAdapter; T04 delivers production file/save adapter work; neither adds ordinary restart restore |
| 3 | [T03](tickets/03-split-workspace-and-tab-drag-ui.md), [T05](tickets/05-tab-transfer-wal-recovery-core.md), [T10](tickets/10-desktop-details-theme-export-integration.md) | T02 has released `editor.vue` before T10 and `index.vue`/app assembly before T03; live pane state remains no-restore; all MoveRecovery WAL gaps and details semantics pass |
| 4 | [T06](tickets/06-electron-transfer-startup-emergency-recovery.md) | after T02/T03/T04/T05, Electron transfer/startup integration, CrashDraft lifecycle, both-source emergency scan, retained legacy normal data, and independent terra/high review pass |
| 5 | [T07](tickets/07-windows-native-external-release-adapter.md), [T08](tickets/08-menus-localization-and-command-routing.md) | supported external-release proof or disabled fallback; command surface passes |
| 6 | [T11](tickets/11-cross-feature-e2e-and-integration.md) | coordination-branch integration reruns proportional matrix checks and rejects feature fixes into new owner tickets |
| 7 | [T12](tickets/12-windows-trial-final-review-and-acceptance.md) | T12 gives clean-build/Windows-trial readiness evidence to the coordination task. The coordinator creates independent terra/high Standards + Spec reviews, routes defects, requests user Acceptance, and alone declares completion. |

The only shared foundational directories are new `src/shared/workspace/` and
renderer `src/renderer/src/workspace/`: T01 creates shared runtime/startup types and
controller ports/memory adapters, not a normal session codec; T02 changes only its assigned renderer production
PaneEditorAdapter glue
after T01 integrates. T03 owns `editorWithTabs/index.vue` and the optional narrow
`pages/app.vue` assembly seam only after T02 releases its editor binding; T10 then
owns `editor.vue` after T02. T06 may add its separate renderer endpoint adapter
only after T02/T03 are integrated. All other tickets have disjoint ownership as
declared in their files. Recompute this frontier after each integration.
