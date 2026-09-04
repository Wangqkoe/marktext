# Move tabs and Split Right acceptance evidence

Status: **Implementation complete; focused automated validation passed.** Windows human acceptance: **User-confirmed Passed, 2026-09-03**, for the eight checks below; Linux/macOS are **Untested**.

Specification: [Move tabs and Split Right](../specs/move-tabs-and-split-right.md).

- Baseline: `a4184af194ef351dd6f9239b8fb782a6646b0303`.
- Final source/test commit: `dd5e1dadb4d550095c8718c2f758685be38fd36f`.
- Documentation/locale implementation: `b9dc34b373875f6b761579d7289b0dab692c0eaa`.
- Evidence records focused checks, not a claim that full-repository lint/unit/E2E suites are green.

## Verified automated scope

- [x] Shared tab/Opened Files menu contract, captured targets, Move terminology, explicit Split Right, disabled right-pane Split Right, right-view reuse and the two-pane limit.
- [x] New-tab/normal file-open routes use the left pane; explicit existing-view activation can focus the right pane.
- [x] Pane-edge pointer drag remains movement; moves coalesce safely when the target already shows the same document. This is automated pointer input, not human physical native-drag acceptance.
- [x] One document owns Markdown, dirty state, history, save lifecycle and identity across views. Shared editing/undo, stale-report fences, independent cursor/scroll and mixed WYSIWYG/Source views are covered.
- [x] Save/Save As and final-view dirty-close decisions preserve content and ownership; closing one shared view retains the remaining document and its DocumentIO fence. Existing save/transfer/recovery adjacency checks pass.
- [x] Shared-document Move to New Window is disabled/rejected until the other view closes; normal single-view cross-window moves remain supported.
- [x] Emergency crash-draft/transfer recovery remains covered and normal restart retains the existing clean-start policy. No normal session restore was added.
- [x] Ten locales parse, match the complete English key set, have nonempty Move/Split labels, omit `commands.workspace.splitRight`, and contain no `splitLeft` key.

## Commands and results

Commands ran from the repository root on Windows. Unit groups A and B are disjoint: **12 files / 154 tests**. The separate i18n check adds **24 tests**. Electron groups C and D comprise **40 unique tests**, not 41; overlapping executions and repeat smoke are not counted twice.

### A. Workspace and menu units — 7 files / 99 passed

```powershell
pnpm --dir packages/desktop exec vitest run test/unit/specs/workspace-shared-view.spec.ts test/unit/specs/workspace-runtime.spec.ts test/unit/specs/scroll-report-frequency.spec.ts test/unit/specs/menu-workspace.spec.ts test/unit/specs/move-action-preflight.spec.ts test/unit/specs/workspace-command-routing.spec.ts test/unit/specs/workspace-projection-mirror.spec.ts --maxWorkers=1
```

### B. Save and recovery units — 5 files / 55 passed

```powershell
pnpm --dir packages/desktop exec vitest run test/unit/specs/crash-draft-recovery.spec.ts test/unit/specs/document-io-electron-adapter.spec.ts test/unit/specs/document-io-coordinator.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts --maxWorkers=1
```

The coordinator independently reran the final committed shared-view suite: **1 file / 11 passed**, a repeat subset of the 154 tests above.

```powershell
pnpm --dir packages/desktop exec vitest run test/unit/specs/workspace-shared-view.spec.ts --maxWorkers=1
```

The earlier locale-owned validation ran `pnpm --filter marktext exec vitest run test/unit/specs/i18n.spec.ts`: **1 file / 24 passed**, associated with documentation/locale commit `b9dc34b373875f6b761579d7289b0dab692c0eaa`, not a later source rerun. A read-only Node assertion checked JSON parsing, complete key parity, required nonempty labels and prohibited legacy keys across all ten locales. Targeted locale ESLint passed; its package module-type warning is record-only.

### C. Main Electron group — 28 passed

```powershell
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/split-workspace.spec.ts test/e2e/opened-files-menu.spec.ts test/e2e/workspace-native-file-open.spec.ts test/e2e/workspace-native-save.spec.ts test/e2e/workspace-transfer.spec.ts test/e2e/details-disclosure.spec.ts --workers=1
```

`workspace-native-save.spec.ts` was an unmatched filename typo: **no tests matched that filename**. It does not establish save coverage. The actual `workspace-native-file-save.spec.ts` ran in group D.

### D. Cursor/scroll, actual native save and Electron transfer — 13 passed

```powershell
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/split-workspace.spec.ts test/e2e/workspace-native-file-save.spec.ts test/e2e/workspace-transfer-electron.spec.ts --grep 'shared document refresh|saves|Save|save|moves a saved|moves a dirty|moves a untitled|native menu callback' --workers=1 --output=test-results/adjacency
```

The shared dirty-close/Save As case overlaps group C. Group D adds the cursor/scroll case, five native-save cases and six transfer cases: **12 additional unique tests**.

### Final fresh-build smoke — 6 passed

```powershell
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/split-workspace.spec.ts --grep 'Split Right shares|mixed WYSIWYG|shared document refresh' --repeat-each=2 --workers=1 --output=test-results/final-shared-smoke
```

These are two executions each of three already-counted cases, against the final fresh build. They do not increase the 40 unique Electron total.

### Build, lint and formatting

- `pnpm --dir packages/desktop typecheck`: passed.
- `pnpm --dir packages/desktop build`: passed, exit 0; main 2.53 s, preload 46 ms, renderer 28.94 s. The final repeat smoke used this build.
- Renderer artifact: `packages/desktop/out/renderer/assets/index-l8dChJHB.js`; coordinator verified SHA-256 `3DE9A7E2CE0B43D515E83ECAC13FADBFC9E559A7F54CAF52462473ED340D0B49`.
- Targeted source ESLint: all 20 changed source/test files checked, exit 0, zero errors and 27 non-null-assertion warnings (record-only), plus the existing package module-type warning.
- The new specification/evidence, glossary, current Wayfinder and ten locale JSON files passed owned-file Prettier. Historical frozen documents received only supersession annotations, not wholesale formatting or result rewrites.
- `git diff a4184af1..dd5e1dad --check`: passed in coordinator verification.

The final targeted source-lint command was:

```powershell
$splitCodeFiles = @(git diff --name-only a4184af1..dd5e1dad -- packages/desktop/src packages/desktop/test)
node node_modules/eslint/bin/eslint.js @splitCodeFiles
```

An earlier wrapper invocation joined the file array into a single unmatched pattern and checked no files; only the corrected direct command above is counted as lint evidence.

## Windows human acceptance — 2026-09-03

The user explicitly confirmed “1–8 全通过” for the following eight checks against HEAD `a15c5ef01793be45e61c334fafd2bf3cd3959efb`, with source/test commit `dd5e1dadb4d550095c8718c2f758685be38fd36f`. The session used an isolated temporary profile and test files A/B/C with `autoSave=false`, without changing everyday configuration. The existing renderer build was reused; its SHA-256 was independently rechecked during this round and matched `3DE9A7E2CE0B43D515E83ECAC13FADBFC9E559A7F54CAF52462473ED340D0B49`.

1. **Passed:** B's Move to Right / Move to Left and physical mouse dragging between panes move the tab without copying it.
2. **Passed:** Explicit left-pane Split Right on A retains both views; repeating it creates neither extra tabs nor a third pane.
3. **Passed:** Tab and Opened Files context menus agree; there is no Split Left, and right-pane Split Right is disabled.
4. **Passed:** Editing, undo and redo synchronize in both directions without lost characters or older content reappearing.
5. **Passed:** Right-pane Ctrl+E switches its Source mode independently; both panes scroll independently.
6. **Passed:** With the right pane focused, Ctrl+N and opening C from the directory still open on the left.
7. **Passed:** Save / Save As to `A-saved.md` synchronizes both titles and saved state; closing and reopening preserves the correct content.
8. **Passed:** Closing one dirty shared view causes no prompt or content loss; closing the final view prompts, and Cancel preserves it.

This confirmation covers only items 1–8. In particular, Move to New Window restrictions were not separately confirmed by the user; their existing automated coverage above remains the evidence. This documentation-only closeout ran no new automated tests, build or installer packaging and did not clean up acceptance windows or temporary files.

## Review closure and boundaries

The option-change stale-revision defect and captured native-close/reopen blank-document race were fixed and independently reproduced as resolved. Additional peer asynchronous-stage overwrite, close, dispose and failure probes passed. The final narrowed review reported no remaining confirmed direct blocker.

The coordinator independently inspected the mixed-mode screenshot and confirmed both modes visible with the same text. The screenshot is an ignored local artifact, not durable required evidence or human acceptance.

- Windows human physical drag and manual acceptance: **User-confirmed Passed, 2026-09-03**, limited to the eight recorded checks; this is separate from automated Electron pointer evidence.
- Linux/macOS: **Untested**; no cross-platform pass is inferred from Windows.
- The earlier implementation/manual-acceptance closeouts did not rebuild an installer. A subsequent fresh Windows x64 build from `b60e6b9a` produced verified NSIS/ZIP deliverables; see the [package manifest](move-tabs-and-split-right-windows-package.md). Packaged startup was observed, but the packaged GUI behavior smoke remains Pending because desktop access was unavailable. Nothing was installed or pushed.
- An earlier accidental broad unit run was stopped. The pre-existing `source-code-image-action` computed-injection failure is documented in prior acceptance; neither that interrupted run nor historical navigation passes are presented as this feature's passing evidence.
