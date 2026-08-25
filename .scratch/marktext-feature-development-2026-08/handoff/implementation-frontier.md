# Implementation frontier

This is the execution order for the tickets; normative behavior remains in the
[V1 Spec](v1-spec.md), and pass/fail evidence remains in the
[acceptance matrix](acceptance-matrix.md).

| Wave | Tickets that may run together | Integration frontier / gate |
| --- | --- | --- |
| 1 | [T01](tickets/01-workspace-runtime-no-restore.md), [T09](tickets/09-muya-details-engine-and-roundtrip.md) | runtime DefaultStartupPolicy/EmergencyRecovery boundary and details semantics pass; no normal codec/session adapter is claimed |
| 2 | [T04](tickets/04-file-observation-diskrevision-cas.md), T02 R1 pane binding | T04 supplies the only FileObservationHub/CAS core; the non-integrated R1 result may bind panes but has no production DocumentIO claim |
| 3 | [T04b](tickets/04b-documentio-electron-adapter.md) | authenticated main coordinator and typed DocumentIO transport consume T04 core; no transfer, startup, CrashDraft or normal restore is added |
| 4 | T02 R2 production completion | only after T04b, migrate the readonly projection facade and critical Controller-owned save/options commands; no legacy I/O or dual save state |
| 5 | [T03](tickets/03-split-workspace-and-tab-drag-ui.md) ✅ integrated + dual review passed; [T05](tickets/05-tab-transfer-wal-recovery-core.md) remains active | T03 is integrated at `1aa17aac6da3ef23610067b7f264bb38a835da4e` with A03 evidence; T05 retains its own MoveRecovery/WAL gate and is not claimed complete |
| 6 | [T10](tickets/10-desktop-details-theme-export-integration.md) unblocked/ready | T03's direct dependent is released to start: T10 may perform its later `editor.vue` details/theme/export work; it does not reopen T03's pane ownership; details semantics remain to be proven |
| 7 | [T06](tickets/06-electron-transfer-startup-emergency-recovery.md) | after T02 production completion/T03/T04/T04b/T05, reuse DocumentIO bridge for Electron transfer/startup integration, CrashDraft lifecycle, both-source emergency scan, retained legacy normal data, and independent terra/high review |
| 8 | [T07](tickets/07-windows-native-external-release-adapter.md), [T08](tickets/08-menus-localization-and-command-routing.md) | supported external-release proof or disabled fallback; command surface passes |
| 9 | [T11](tickets/11-cross-feature-e2e-and-integration.md) | R3 dual-surface/E2E evidence and temporary-fallback removal follow coordination-branch integration; feature fixes return to a new owner ticket |
| 10 | [T12](tickets/12-windows-trial-final-review-and-acceptance.md) | T12 gives clean-build/Windows-trial readiness evidence to the coordination task. The coordinator creates independent terra/high Standards + Spec reviews, routes defects, requests user Acceptance, and alone declares completion. |

The only shared foundational directories are new `src/shared/workspace/` and
renderer `src/renderer/src/workspace/`: T01 creates shared runtime/startup types and
controller ports/memory adapters, not a normal session codec; T02 changes only its assigned renderer production
PaneEditorAdapter glue after T01 integrates. T04b owns the DocumentIO coordinator,
DocumentIO-specific IPC/preload declarations and renderer adapter after T04
integrates. T02 R2 consumes that already-integrated seam; it does not change it.
T03 owns `editorWithTabs/index.vue`, the optional narrow `pages/app.vue` assembly
seam, and only the narrow pane-local seams in `editor.vue`/`sourceCode.vue`
described by its ticket after T02b releases the Controller projection/facade.
T10's later `editor.vue` details/theme/export work starts only after T03 is
integrated and reviewed. T06 runs after T04b/T02 and may add transfer/startup
routes only at T04b's recorded separate insertion point; it reuses rather than
redefines the DocumentIO bridge. All other tickets have disjoint ownership as
declared in their files. Recompute this frontier after each integration. R1 at
`b5ddc413` remains a non-integrated intermediate result; its R2 branch is not a
frontier substitute until T04b is accepted.
