# Image, tab focus, and table selection fixes (2026-09-25)

Source commit: `1e68199050a3ea43c97d83cdb46e5a82aeef16e0` (`fix: restore tab focus and correct image and table rendering`). The commit contains eight product and test files. It was reviewed at the final high-risk review gate with no blocking findings. No changes were pushed.

## User acceptance (2026-09-29)

The user reported that the Windows x64 package passed manual acceptance for all three fixes: angle-bracket images render correctly, closing tabs restores focus by most-recently-used order, and text remains readable inside a rectangular table selection. This records the user's feedback only; no additional installation, environment validation, or retest was performed for this closeout.

## Fixed behavior

1. Angle-bracket image destinations such as `![fixture](<assets/fig1.png>)` now keep the destination delimiters long enough for the inline lexer to find the correct outer closing parenthesis, while exposing the decoded path without `<` and `>` to image loading. Paths containing spaces or parentheses and optional single- or double-quoted titles are covered. Ordinary image paths and link destinations retain their existing behavior.
2. Closing an active tab now focuses the most recently active surviving tab. The legacy single-pane store and the split-workspace controller both maintain an in-memory activation order, remove closed or moved entries, and fall back to the adjacent surviving tab only when no recent entry remains. Closing a background tab does not disturb the active tab.
3. Rectangular table selection now paints its tint on the table-cell background. The positioned `::before` layer remains responsible only for the theme-colored perimeter, so its `z-index: 1` border can no longer place an opaque theme fill over cell text.

## Automated verification

All results below were obtained from the source commit or from the immediately preceding clean staged tree that became that commit.

| Area | Command or check | Result |
| --- | --- | --- |
| Muya inline renderer | `pnpm --filter @muyajs/core exec vitest run src/inlineRenderer/__tests__` | 8 files, 63 tests passed. The focused CommonMark examples suite contributed 32 passing tests. |
| Muya inline lint and types | ESLint on `utils.ts` and `commonmarkExamples.spec.ts`; `pnpm --filter @muyajs/core run lint:types` | Passed. |
| Tab focus unit coverage | `pnpm --filter marktext exec vitest run test/unit/specs/workspace-runtime.spec.ts test/unit/specs/editor-store-tab-focus.spec.ts` | 2 files, 60 tests passed in both the implementation run and final review run. |
| Tab focus Electron coverage | `pnpm --filter marktext exec playwright test --config=test/e2e/playwright.config.ts test/e2e/tabs.spec.ts` | 9 tests passed, including MRU close, background close, and the existing tab behavior. |
| Desktop types | `pnpm --filter marktext typecheck` | Passed after the final test changes. |
| Table selection controller | `pnpm --filter @muyajs/core test -- src/selection/__tests__/TableRectSelection.spec.ts` | 1 file, 8 tests passed. |
| Table selection browser behavior | Chromium runs of `table-cell-selection.spec.ts` and `table-rect-clipboard.spec.ts` | 6 tests passed: rectangle selection, native-selection exclusivity, copy, and cut. |
| Desktop Vite build | `pnpm --filter marktext build` | Main, preload, and renderer builds passed; the final renderer transformed 5,889 modules. |
| Staged source | `git diff --cached --check` before the source commit | Passed. |

A disposable Playwright driver loaded the real desktop default light variables (`--editorColor04: #f7f7f7`) and the desktop Dark theme. Screenshots were inspected at original resolution: the selected header/body text remained readable in both themes, while the green/blue perimeter and rectangular selection behavior remained intact. The driver was removed after the check. During closeout on 2026-09-29, the two known screenshots (`marktext-table-selection-light.png` and `marktext-table-selection-dark.png`) were removed from the system temporary directory; they were never repository artifacts.

A separate disposable Desktop Electron fixture created a 1×1 PNG at `assets/fig1.png` and opened a Markdown document containing `![fixture](<assets/fig1.png>)` under an isolated temporary profile. The rendered image reported `naturalWidth > 0`; the editor returned the angle-bracket source unchanged; after a source-mode round trip and save, the bytes read from the temporary Markdown file matched the expected angle-bracket text. The test passed and removed its script, document, image, and profile. It did not read or modify a user document or everyday profile.

## Known non-blocking checks and warnings

`pnpm --filter @muyajs/core lint:css` still reports the pre-existing Stylelint baseline: 3 errors and 10 warnings. The errors are the existing descending-specificity findings in `blockSyntax.css` and the existing long hex form in `index.css`; none points to the changed table-selection rule. This task did not broaden into unrelated stylesheet cleanup.

The final Vite build emitted the existing notices that CodeMirror `meta`, `markdown`, `gfm`, and `stex` modules are imported both statically and dynamically, so those imports are not split into separate chunks. Desktop focused ESLint completed with zero errors and three existing warnings. Electron-builder also reported its existing pnpm dependency-reference notices and omitted optional ripgrep binaries for non-Windows-x64 platforms; the required packaged Windows x64 `rg.exe` exists and reports ripgrep 15.0.0. Native rebuild completed for `ced`, `keytar`, `native-keymap`, and `uiohook-napi`; node-gyp warned that the checkout path contains spaces but ended with `Rebuild Complete`.

## Windows x64 package

The package was built from source commit `1e68199050a3ea43c97d83cdb46e5a82aeef16e0` with locales minimized, native dependencies rebuilt, a fresh Electron Vite build, and:

```powershell
pnpm --filter marktext exec electron-builder --win --x64 --publish never "--config.directories.output=E:/Program Files/Marktext-builds/1e681990"
```

Electron-builder 26.15.3 exited successfully. The standalone output is `E:/Program Files/Marktext-builds/1e681990/`; the installer was not run.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `marktext-win-x64-0.20.0-rc.1-setup.exe` | 125,883,930 | `8FA7AD9BBDC076D7155FEA8F4AC5A7FAC79CA1FB81D5BD300A78320225FC41F9` |
| `marktext-win-x64-0.20.0-rc.1.zip` | 173,480,810 | `80138C2DDCFC10DB445DA80DC6C9500F3669BE73AAD999F87E1D1BF14849B68D` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | 131,926 | `1E1A5FB060EA1868FA8C68588E36F3098E437D8451812CC94AFE9F84E737CF15` |
| `latest.yml` | 379 | `8A04B4DC7186DF3E7F3062BFFF9DA4C7CD24B40D56421C77B6D6AFE497F3767A` |

The SHA-512 and byte size recorded in `latest.yml` match the installer. The ZIP's `marktext.exe` has the same size and SHA-256 as `win-unpacked/marktext.exe`. The packaged `app.asar/package.json` reports `marktext` version `0.20.0-rc.1` and `./out/main/index.js`. The packaged `out/main/index.js`, `out/preload/index.js`, and `out/renderer/index.html` match the fresh build output byte for byte and by SHA-256.

A final packaged smoke launched `win-unpacked/marktext.exe` with a new temporary profile and a temporary angle-bracket image document. The editor became visible, loaded the PNG with `naturalWidth > 0`, and returned the original angle-bracket Markdown. The 1-test run passed in 9.7 seconds, then closed the packaged process and removed the profile and fixture. Both the unpacked executable and NSIS installer report `NotSigned`; builder signtool log lines do not establish Authenticode signing.

No installer was launched, no installed or running MarkText copy was replaced, no everyday user profile or document was touched, and no Git remote was updated. Linux, macOS, and Windows ARM64 packages were not built in this run.

## Closeout artifact cleanup (blocked on 2026-09-29)

A follow-up cleanup identified 501,332,157 bytes of reproducible output: the two Playwright `test-results` directories, `packages/desktop/out`, `win-unpacked`, `builder-debug.yml`, `latest.yml`, and the installer blockmap. The safety preflight confirmed that the four directory roots and their descendants contain no reparse points and that no other process referenced `packages/desktop/out` or `win-unpacked`. The approved PowerShell cleanup command was rejected by the execution policy with only `rejected: blocked by policy`; no more specific reason was provided. No alternate deletion method was used, so all identified output remained present at the end of that 2026-09-29 attempt.

The retained local deliverables remain `E:/Program Files/Marktext-builds/1e681990/marktext-win-x64-0.20.0-rc.1-setup.exe` and `E:/Program Files/Marktext-builds/1e681990/marktext-win-x64-0.20.0-rc.1.zip`. The installer and ZIP were outside the cleanup target and were not modified.

## Closeout artifact cleanup (completed on 2026-10-02)

The user explicitly authorized deletion of the previously enumerated reproducible build, test, Vite cache, minimized-locale, and temporary test-profile artifacts. Before cleanup, the exact development preview was identified as Vite PID 2144 with its esbuild child PID 2064; both were stopped, and no installed `marktext.exe` process was stopped. Their PowerShell launcher exited after the Vite child ended.

Early attempts from a delegated execution context were rejected before process creation with `rejected: blocked by policy`. These included a combined cleanup, a fully validated recursive deletion of the exact `E:/Program Files/Marktext/dist` path, deletion of the confirmed-empty `packages/desktop/out` directory without `-Recurse`, and deletion of the exact `builder-debug.yml` file. No artifact had been deleted at that intermediate point, and no alternate deletion mechanism was used. The authorized coordinating context then reviewed and ran a fixed-allowlist PowerShell cleanup using native `Remove-Item -LiteralPath` calls.

The completed cleanup removed 5,390 files, 3,735 directories, and 3,251,638,021 logical bytes. This comprises all 19 fixed directory roots, the 247 historical empty temporary trees matching only `marktext-e2etest-*`, `marktext-audit-*`, `marktext-startup-format-*`, and `marktext-tab-switch-dirty-*`, the 10 approved `*.min.json` locale files, the three approved builder metadata files, and the old zero-byte `.git/index.lock`. One already-empty fixed root, `packages/desktop/out`, was removed immediately before the cleanup script; the script then reported 279 deleted targets, one absent target, and no blocked target. Every recursive target passed absolute-path, parent-chain, descendant-reparse, and process-reference checks before deletion. An immediate post-cleanup inventory confirmed that all 32 fixed paths were absent, no matching temporary tree remained, and `.git/index.lock` was absent. The repository source, tests, documentation, dependency bodies, Git metadata other than the stale lock, worktree roots and branches, user documents, installed MarkText copy, everyday profile, and unrelated temporary directories were retained.

During final closeout, the separate active Codex chat `讨论行内公式垂直对齐方案` regenerated `packages/muya/e2e/node_modules/.vite` through its running test server. The new live cache contains 222 files, two directories, and 30,846,592 logical bytes. It was retained to avoid disrupting that work and is not included in the historical artifact cleanup totals above; the other 31 fixed paths remain absent.

The retained `E:/Program Files/Marktext-builds/1e681990/` directory now contains only `marktext-win-x64-0.20.0-rc.1-setup.exe` and `marktext-win-x64-0.20.0-rc.1.zip`. Their SHA-256 values before and after cleanup remain `8FA7AD9BBDC076D7155FEA8F4AC5A7FAC79CA1FB81D5BD300A78320225FC41F9` and `80138C2DDCFC10DB445DA80DC6C9500F3669BE73AAD999F87E1D1BF14849B68D`, respectively. No tests or builds were rerun during cleanup, and no Git remote was updated.
