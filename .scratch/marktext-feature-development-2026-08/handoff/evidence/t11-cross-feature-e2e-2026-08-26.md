# T11 cross-feature Electron evidence — 2026-08-26

## Scope and environment

This evidence was run on local branch `codex/marktext-t11-cross-feature-e2e`,
created from coordination HEAD `5fc8f5763044cc175304ebe3b52cdda28f1526da`
and fast-forwarded to the repaired local integration HEAD
`66749ef1bd4da946094bd4351f0f02378ca7308c` before the final rerun.
Windows Electron/Playwright runs used one worker. The first attempted Electron
run was unavailable because this new worktree had no dependencies or desktop
`out/` build; `pnpm install --frozen-lockfile` and `pnpm -C packages/desktop
build` were then run locally before the results below.

The two T11 specs are **real Electron** tests. They use the existing T06 test
move-action seam and main-to-renderer IPC only to invoke the assembled product
command edges; they do not use deterministic adapters. The inherited T03,
T04b, T06, and T10 focused unit/deterministic evidence remains linked from the
acceptance matrix and is not duplicated here.

## Existing coverage versus composed gaps

| Existing owner/evidence | Already covered | T11 composed result |
| --- | --- | --- |
| T03 `split-workspace.spec.ts` (4/4) | two pane mount, focused command routing, collapse | Extended in `workspace-transfer.spec.ts` through dirty untitled Move and last-tab Move; focused undo before transfer passed. |
| T04b coordinator tests (17/17 inherited) | authenticated typed DocumentIO coordinator/adapter | The split saved pane accepted `mt::editor-ask-file-save` and the on-disk file contained `SAVED_THROUGH_TYPED_TRANSPORT`. |
| T06 `workspace-transfer-electron.spec.ts` / startup evidence | individual saved/dirty/untitled Move, recovery/startup | Final rerun: startup policy 14/14 and existing transfer regression 7/7; new T11 last-tab Move history/reopen composition passed. |
| T10 `details-disclosure.spec.ts` (7/7) | single-surface details source/preview/theme/export | T11's split details composition passed. The separately recorded export-suite `afterAll` close hang has no assertion failure and predates T11; see record T11-R01. |

## Executions

| Command | Environment | Result |
| --- | --- | --- |
| `pnpm -C packages/desktop build` | Windows / electron-vite | **Passed**; dynamic-import warnings only. |
| `pnpm -C packages/desktop exec playwright test test/e2e/workspace-transfer.spec.ts test/e2e/workspace-details-composition.spec.ts test/e2e/workspace-startup-policy.spec.ts test/e2e/workspace-transfer-electron.spec.ts --workers=1` | Windows Electron / Playwright | **Passed — 23/23, 1.8m**: `workspace-transfer` 1/1, `workspace-details-composition` 1/1, startup policy 14/14, existing transfer regression 7/7. The T11 specs prove Escape returns details source to preview and a theme change retains it while the peer pane stays owned; plus focused routing, T04b typed save, dirty untitled and dirty saved last-tab Move, target Undo/Redo, source clean New Tab, and reopen/Open composition. Startup coverage includes default-off, explicit-file priority, CrashDraft saved/untitled recovery, disk-conflict recovered copy, dirty exit decisions, and retained legacy normal data. Existing T06 evidence remains the source for MoveRecovery partial-salvage and corrupt-latest fault injection. |
| `pnpm -C packages/desktop test:unit` | Windows Node / Vitest | **Existing record — 64 files: 911 passed, 10 failed, 1 skipped**. All failures are `test/unit/specs/source-code-image-action.spec.ts`, whose dynamic loader reports `ReferenceError: computed is not defined`; outside T11-owned paths and not rerun or repaired here. |
| `pnpm -C packages/desktop typecheck` | Windows / vue-tsc | **Passed**. |
| `pnpm lint` | Windows / ESLint | **Existing baseline record — 392 repository problems**. Existing production and historical-test errors dominate. No current T11 test hard lint remains. |
| `pnpm -C packages/desktop exec eslint test/e2e/workspace-transfer.spec.ts test/e2e/workspace-details-composition.spec.ts` | Windows / ESLint | **Passed** (only the repository-level `MODULE_TYPELESS_PACKAGE_JSON` warning). |
| `git diff --check` | Git | **Passed**. |

## Resolved composed defects

The integration fixes at `66749ef1bd4da946094bd4351f0f02378ca7308c` resolved
both original T11 reproductions:

- The real split-pane details test now passes after Escape and theme change;
  preview remains visible and the peer pane content remains unchanged.
- The dirty saved last-tab Move test now passes portable Undo/Redo in the target
  and Open/reopen after transfer; the source retains one clean New Tab.

## Non-blocking existing record

### T11-R01 — existing details Electron suite can hang while closing after export

- **Severity:** non-blocking record; owner: **T10/details Electron test or
  export-close lifecycle**. Coordination confirmed the same teardown hang at
  the T09 candidate fixed point, so it is neither a T11-owned regression nor a
  missing details/theme or Move/history acceptance assertion.
- **Direct reproduction:** `pnpm -C packages/desktop exec playwright test
  test/e2e/details-disclosure.spec.ts --workers=1`.
- **Observed:** every functional assertion passes (8/8), then the existing
  `test.afterAll` at `details-disclosure.spec.ts:81` exceeds 30 seconds at
  `await app.close()` after the export case. Playwright reports `7 passed + 1
  teardown error` and `Worker teardown timeout of 30000ms exceeded`.
- **Boundary:** T11 did not alter that T10-owned test or production export/close
  code. No Electron/Node process referencing this worktree remained after the
  runner exited.

## Disposition

The two T11-owned real-Electron composition tests and their required T06/Move
prerequisites pass at integration HEAD
`66749ef1bd4da946094bd4351f0f02378ca7308c`. T11 automated composition
acceptance is complete; T11-R01 remains recorded rather than repaired here.
No claim is made for manual power loss, Windows trial, PDF/screen-reader checks,
coordination-branch integration, final review, or T12 acceptance.
