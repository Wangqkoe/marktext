# Reopen a transferred file in its source window

- Fix/source commit: `8027278bad98e2f3ad9c6b58f90de39bc0bd35cf`.
- Baseline: `911a6f236f292994c23d650206a270bc6c41e0ec`.
- Scope: after a successful **Move to new window**, close the destination and reopen the same saved file in the original window through **File > Open** or the **Files sidebar**.
- Status: focused development regression checks and actual replacement-package regression/smoke passed; new-fix human acceptance remains **Pending**. Linux/macOS are **Untested**.
- Distribution: [repair package manifest](transfer-source-reopen-windows-package.md).

## Cause and minimal fix

Transfer released the final source view without taking the ordinary tab-close edge. The source renderer no longer owned the document, but main-process `EditorWindow._openedFiles` still contained its path. Later open requests treated the path as already open and requested activation of a nonexistent source tab instead of reopening the document. This was a stale opened-path registry entry, not a failure to persist the Markdown file.

The six-line addition in `editorWithTabs/index.vue` reuses the existing `mt::window-tab-closed` notification after `releaseTransfer`. It sends the transferred `fileKey` only when release applied and the source facade no longer contains that document. Existing main-process bookkeeping removes the path through its normal close handler; no new registry, persistence layer or transfer protocol was introduced.

Safety boundaries:

- Failed release cannot notify main that the source file closed.
- A document still present in the source facade cannot be removed from opened-path bookkeeping.
- Untitled transfers have no file key and send no path-close notification.
- Saved/dirty successful transfers notify exactly once in the regression observation; target-creation failure notifies zero times, and a successful retry notifies once.

## Reproduction and focused validation

The original failure reproduced on the old packaged application as well as the development build. The regression waits for the durable transfer journal's observed `completed` phase before closing the destination, separating this defect from closing a target during an in-flight transfer. It then exercises the actual File > Open handler or clicks the actual Files sidebar row and verifies the restored source tab/body plus unchanged file bytes.

For the context-menu regression, only the native popup boundary is replaced: DOM `contextmenu`, the production menu item's click callback, transfer protocol and source open path remain active. File > Open substitutes the selected path at the native file-dialog boundary. These are Electron-protocol automated checks, not physical human mouse or OS-dialog acceptance.

The following source checks ran in the development worktree. The three Electron groups contain **27 distinct tests** (2 + 20 + 5), with **31 passing post-fix executions** because the two new cases were each repeated three times. Diagnostic probe repeats are separate and do not inflate this total.

### New two-entry regression: red to green

```powershell
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/workspace-transfer-reopen.spec.ts --workers=1 --output=test-results/transfer-reopen-red
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/workspace-transfer-reopen.spec.ts --workers=1 --repeat-each=3 --output=test-results/transfer-reopen-green
```

Before the product change: exit 1, **2 failed**, expected active tab `move.md` but received `New Tab` through both entries after observed transfer completion and target close. After the change: exit 0, **6 passed** in 28.1 s (two distinct cases repeated three times).

### Transfer, native open and native save: 20 passed

```powershell
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/workspace-transfer-electron.spec.ts test/e2e/workspace-native-file-open.spec.ts test/e2e/workspace-native-file-save.spec.ts --workers=1 --output=test-results/transfer-reopen-adjacency
```

Exit 0, **20 passed** in 1.2 min, including saved/dirty/untitled closure notifications, failed target creation and successful retry, target close/restart and recovery adjacency.

### Shared-view and integrated transfer smoke: 5 passed

```powershell
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/split-workspace.spec.ts test/e2e/workspace-transfer.spec.ts --grep 'Split Right shares|shared document refresh|shared views keep|mixed WYSIWYG|composes focused-pane' --workers=1 --output=test-results/transfer-reopen-shared
```

Exit 0, **5 passed** in 34.0 s: shared edits/undo, cursor/scroll, dirty close and remaining-draft Save As, mixed Source/WYSIWYG, and integrated pane/save/Move/history/open behavior.

### Unit adjacency: 8 files / 117 passed

```powershell
pnpm --dir packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts test/unit/specs/workspace-shared-view.spec.ts test/unit/specs/move-action-preflight.spec.ts test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts test/unit/specs/document-io-electron-adapter.spec.ts test/unit/specs/document-io-coordinator.spec.ts --maxWorkers=1
```

Exit 0, **8 files / 117 tests** passed in 33.11 s.

### Static checks and fresh development build

```powershell
pnpm --dir packages/desktop typecheck
pnpm exec eslint packages/desktop/src/renderer/src/components/editorWithTabs/index.vue packages/desktop/test/e2e/workspace-transfer-reopen.spec.ts packages/desktop/test/e2e/workspace-transfer-electron.spec.ts
pnpm exec eslint packages/desktop/test/e2e/workspace-transfer-reopen.spec.ts
git diff --check
git diff --cached --check
pnpm --dir packages/desktop build
```

All final commands exited 0. An initial new-test BaseWindow/webContents type mismatch was fixed by resolving the popup window through `BrowserWindow.fromId`; final typecheck and new-file lint passed. The existing transfer spec produced 14 pre-existing non-null-assertion warnings, with no errors. Module-type, Playwright color-environment, Git LF/CRLF and four CodeMirror import warnings are record-only.

The fresh development build took 2.98 s / 46 ms / 42.13 s for main/preload/renderer. Development renderer `packages/desktop/out/renderer/assets/index-BTLH-qMs.js` SHA-256: `7EF4EFA44BD237569C9DDD3122CD98940ED1979D7CF4E77D260E1D7F4AC36B34`. The separately built package has its own artifact hash in the package manifest.

### Original diagnostic closure

The repository-external diagnostic harness was rerun without compensating-notification or restart flags:

```powershell
node 'C:\Users\1407\AppData\Local\Temp\marktext-transfer-close-reopen-diagnostic-20260903\probe.cjs' --mode dev --context --wait-completed --repeat 3
node 'C:\Users\1407\AppData\Local\Temp\marktext-transfer-close-reopen-diagnostic-20260903\probe.cjs' --mode dev --context --wait-completed --entry sidebar --repeat 1
```

The implementation rerun passed **3/3** (2.631 s, 2.914 s, 2.897 s); the coordinator's independent sidebar rerun passed **1/1** (2.674 s). Each isolated app closed normally with exit 0. Local evidence files are `evidence-dev-context-move-1788499755073.ndjson` and `evidence-dev-context-move-1788499859628.ndjson` in the diagnostic directory; those machine-specific artifacts are not repository dependencies. Actual package-specific regression results are recorded in the [repair package manifest](transfer-source-reopen-windows-package.md).

## Review and historical boundaries

Coordinator source review found no confirmed remaining blocker in this narrow repair. The source change is limited to six lines; the other two changed files add two-entry regression and closure-notification safety assertions. This does not claim that full repository lint/unit/E2E suites passed.

The prior Windows human checks 1–8 for Move/Split remain historical evidence for their listed scope; they did not separately cover this Move-to-new-window/target-close/source-reopen sequence. The `b60e6b9a` package's GUI behavior smoke was Pending, and the later reproduced reopen defect makes it a superseded, affected build—not a GUI-passed repair package. Its original artifacts and manifest are preserved.

No installation, push or publication was performed. New-fix human acceptance is Pending and Linux/macOS remain Untested, regardless of automated Windows results.
