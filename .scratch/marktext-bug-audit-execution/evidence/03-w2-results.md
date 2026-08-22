# Ticket 03 W2 audit results

Date: 2026-08-22 (America/Los_Angeles)

Baseline commit: `f4e3c52a372c44712e8e1d3c093e8a074a4d8ce1` (includes the accepted `26b09ea6` / `6e4b113c` watcher work). Environment: Windows 11 Pro 10.0.26200 x64; Node v24.18.0; pnpm 10.33.4; MarkText `0.20.0-rc.1`; local Electron Playwright with the E1 1280x720, 100%, light, custom-title baseline. Dependencies were installed from the frozen lockfile and the desktop production output was built before Electron execution because this worktree initially lacked `packages/desktop/out/main/index.js`.

## W2 acceptance evidence

The focused audit command below passed all three W2 checks in 13.8 seconds:

```powershell
pnpm --filter marktext exec playwright test test/e2e/audit-tabs-restart.spec.ts
```

- **Two-tab isolation:** An isolated F1 profile created two unsaved tabs with distinct markers. Tab A retained its own markdown, dirty state, deep scroll position and caret while tab B retained its own content and source-mode undo/redo history. B undo returned to clean state; redo returned to dirty. Returning to A did not expose B's marker and restored its scroll/caret state.
- **Unsaved close/restart protection:** The designated shared `shared-restart-persistence` profile contained two dirty F1 buffers. Its durable `editorStates/*_editor_buffer_store.json` recorded both unsaved markers and `isSaved: false` before close. Relaunching that same profile restored both buffers, kept source mode and hidden tab bar rendered, and agreed with the corresponding application-menu checks.
- **Save As and reopen:** A separate isolated F1 profile stubbed only the native picker to a controlled temporary destination, then exercised the real renderer-to-main Save As pipeline. Disk contents matched the active document after normalizing Windows CRLF for the editor's LF serialization contract; reopening the produced file in a second isolated profile returned the same Markdown.

No original user document or tracked fixture was opened for writing. All inputs and saved outputs were generated below disposable audit temporary directories.

## Supporting prior art

The following related command ran 27 tests. Twenty-six passed, including all Ticket 03 W2 tests, tabs, per-tab caret/scroll/history, layout persistence, source undo/saved-state and the F1–F4 fixture guard.

```powershell
pnpm exec playwright test test/e2e/audit-tabs-restart.spec.ts test/e2e/tabs.spec.ts test/e2e/tab-switch-cursor.spec.ts test/e2e/layout-persistence.spec.ts test/e2e/issue-781-source-undo.spec.ts test/e2e/parity-source-undo-saved.spec.ts test/e2e/audit-fixtures.spec.ts
```

The one failure is the already-recorded Ticket 01 LF-only negative mutation in `audit-fixtures.spec.ts`; a targeted `--repeat-each=2 --workers=1` run repeated it 2/2, confirming the documented checkout-dependent harness behavior. It is classified in the accompanying duplicate/baseline record and is not a MarkText product failure. Desktop type checking passed:

```powershell
pnpm --filter marktext typecheck
```

The initially attempted focused run was an environment failure before application startup because this new worktree had no built desktop output. After `pnpm --filter marktext build`, the same W2 command passed. That setup failure is not a product candidate.

## W2 conclusion

No new product candidate was observed in the Ticket 03 scope. The deferred find-navigation P2 was not exercised or reopened. No P0/P1 evidence or fifth confirmed product defect appeared, so no early-stop condition was triggered. Ticket 04 is now unblocked by Ticket 03 acceptance facts only; it has not been started by this ticket.
