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

A disposable Playwright driver loaded the real desktop default light variables (`--editorColor04: #f7f7f7`) and the desktop Dark theme. Screenshots were inspected at original resolution: the selected header/body text remained readable in both themes, while the green/blue perimeter and rectangular selection behavior remained intact. The driver was removed after the check; screenshots were kept only in the system temporary directory and are not repository artifacts.

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
