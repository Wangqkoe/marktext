# Implementation frontier

This is the execution order for the tickets; normative behavior remains in the
[V1 Spec](v1-spec.md), and pass/fail evidence remains in the
[acceptance matrix](acceptance-matrix.md).

## Final closeout — 2026-08-30

The implementation frontier was historically recorded as `Closed / Accepted`
for the 2026-08-30 stabilization checkpoint; that closeout is superseded by the
2026-08-31 evidence record below.
The independent final audit passed with 0 blockers and active P0/P1 was 0 at
that checkpoint. T12 was accepted then on the [historical T12 final acceptance
record](evidence/t12-final-acceptance-2026-08-30.md), which is superseded by the
2026-08-31 evidence. The then-final product head was
`57d2ae4d6435b157d3e82c5abc094167d5edb3c0`; later audited integration commits
are documentation only.

Deferred boundaries remain visible rather than reopened: STAB-005 and STAB-009
are P2; screen-reader, PDF visual, real power-loss, remote/assistive, and
mixed-DPI/multi-display physical evidence are unclaimed; unsupported external
drag remains disabled by V1 while menu Move remains available. Existing lint and
workflow-provenance wording records are P2. No product implementation ticket is
open in this round.

### Current evidence correction — 2026-08-31

The historical `57d2ae4d`/`f6dcf9db` closeout above is retained for provenance;
it is not the current package identity and does not blanket-accept the project.
The current integrated HEAD is `82dd4cf0d0d6d4b71c20d496bf31ac8726bcdb09`, while
the fresh package was built from production commit `e223b0e3dd554b11a730f675eee2834961412d17`.
Workspace unit (8 files / 123 tests), related E2E (64/64), typecheck, build and
scoped lint (0 errors / 63 warnings) pass; STAB-013/014/015 Standards and Spec
reviews pass. Final manual Acceptance remains pending for physical Windows
right-tab split drag and drag-out-of-window Move. See [final workspace evidence](evidence/final-workspace-evidence-2026-08-31.md).

## Stabilization frontier — 2026-08-27 (historical)

`fdda9330` is frozen as the stabilization baseline. T12, final Review/Acceptance,
and release judgement are blocked while the local [stabilization ledger](../../marktext-workspace-stabilization/README.md)
drives P0/P1 reproduction, repair, review, and manual replay. This does not alter
or erase the Passed automated evidence recorded below; no feature work is open.

| Wave | Tickets that may run together | Integration frontier / gate |
| --- | --- | --- |
| 1 | [T01](tickets/01-workspace-runtime-no-restore.md), [T09](tickets/09-muya-details-engine-and-roundtrip.md) | runtime DefaultStartupPolicy/EmergencyRecovery boundary and details semantics pass; no normal codec/session adapter is claimed |
| 2 | [T04](tickets/04-file-observation-diskrevision-cas.md), T02 R1 pane binding | T04 supplies the only FileObservationHub/CAS core; the non-integrated R1 result may bind panes but has no production DocumentIO claim |
| 3 | [T04b](tickets/04b-documentio-electron-adapter.md) | authenticated main coordinator and typed DocumentIO transport consume T04 core; no transfer, startup, CrashDraft or normal restore is added |
| 4 | T02 R2 production completion | only after T04b, migrate the readonly projection facade and critical Controller-owned save/options commands; no legacy I/O or dual save state |
| 5 | [T03](tickets/03-split-workspace-and-tab-drag-ui.md) ✅ integrated + [dual review passed](evidence/t03-integration-2026-08-25.md#independent-review-evidence); [T05](tickets/05-tab-transfer-wal-recovery-core.md) ✅ integrated/reviewed | T03 is integrated at `1aa17aac6da3ef23610067b7f264bb38a835da4e`; T05 is integrated/reviewed at `3d6790cf5397dfde9b8dafbd92c0f63d3cba0a6a` with [WAL/MoveRecovery evidence](evidence/t05-integration-2026-08-25.md); T05 scope stops before production Electron wiring |
| 6 | [T10](tickets/10-desktop-details-theme-export-integration.md) ✅ integrated/reviewed | T10 is integrated at `344dbff17a894751dc61ddbf750c711d3b855beb`; desktop details/theme/export automation is complete with dual review passed. Manual screen-reader/PDF portions remain pending; T05/T06/T07/T08/T11/T12 retain their actual dependencies |
| 7 | [T06](tickets/06-electron-transfer-startup-emergency-recovery.md) ✅ locally integrated + independently reviewed / Passed (automated scope) | T06 is locally integrated in merge `dde3f49a89877d68dc07171b62bb19eb87002217`, with candidate final HEAD `0343cb5f56f537584d60ea219268ea04c13292c5` and fixed review point `86cf7b8e962bf94791efeba29e9ba8ccbcefa02f`. Third-round independent terra/high Standards and Spec reviews both passed with 0 blockers; A07 Electron and A08 automation are Passed. Manual power-loss/Windows trial remains for T11/T12. |
| 8 | [T07](tickets/07-windows-native-external-release-adapter.md), [T08](tickets/08-menus-localization-and-command-routing.md) | supported external-release proof or disabled fallback; command surface passes |
| 9 | [T11](tickets/11-cross-feature-e2e-and-integration.md) ✅ unblocked to proceed | T06's automated prerequisite is satisfied; T11 still owns composed dual-surface/E2E evidence and temporary-fallback removal, and is not complete. Feature fixes return to a new owner ticket |
| 10 | [T12](tickets/12-windows-trial-final-review-and-acceptance.md) | T12 remains locked behind T11 and manual acceptance. It gives clean-build/Windows-trial readiness evidence to the coordination task; the coordinator creates independent terra/high Standards + Spec reviews, routes defects, requests user Acceptance, and alone declares completion. |

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

T09 is recorded as implemented and reviewed at its fix commit
`463c2c4ac58140fe0f50c7da9873fc9b956be193`; its details engine evidence is
carried into the T09/T10 report. T10's integration does not alter the T03 or
T05 evidence links or claim the V1 destination complete. T05 is integrated and
reviewed, but T06, T07, T08, T11, and T12 retain their real dependency/frontier
states and do not advance solely because T05 or T10 is integrated.

## T06 integration update — 2026-08-26

T06 is locally integrated and independently reviewed / Passed for the automated
scope at merge `dde3f49a89877d68dc07171b62bb19eb87002217`. The candidate final
HEAD is `0343cb5f56f537584d60ea219268ea04c13292c5`; the fixed review point is
`86cf7b8e962bf94791efeba29e9ba8ccbcefa02f`. The third-round independent
`gpt-5.6-terra` / `high` Standards and Spec reviews both passed with 0 blockers.

The verified gate includes build and typecheck, startup+transfer Electron E2E
single-worker 20/20, seven focused/direct unit files 101/101, and the three-file
new-line rerun 64/64. `git diff --check` passed, the worktree was clean, and no
Electron/Node processes remained. A07's Electron portion and A08 automation are
Passed. This does not claim manual power-loss or Windows trial evidence, A11/A12,
full-repository `pnpm lint`, or final T12 acceptance.

The transfer-fence/move-action assembly-surface range remains a non-blocking
record item; it does not open a repair cycle. Scoped ESLint still reports
checkpoint-preceding historical source-style errors; new lines have no hard-lint
errors. T11 may proceed now that its T06 prerequisite is met; T12 remains behind
T11 and manual acceptance.
