# Desktop UI and Folder navigation acceptance evidence

- Evidence date: 2026-09-01
- Behavior/build source SHA: `6e2071e495677bf4c650b649d879ecec77bbeddc`
- Local branch: `codex/t07-desktop-navigation-acceptance`
- Frozen Spec: `docs/specs/desktop-ui-folder-navigation.md`
- Detailed scroll evidence: `docs/testing/desktop-scroll-profile.md`
- User final Acceptance: **Windows Passed; Linux Untested; macOS Untested**

## Included tickets

| Ticket                           | Integrated commits                                         |
| -------------------------------- | ---------------------------------------------------------- |
| T00 i18n                         | `21137f29`                                                 |
| T01 Concise/title display        | `b562e3f5`, `f78fa2e`                                      |
| T04 Files visual/TOC wrap        | `0ad15a7e`                                                 |
| T06 scroll reporting             | `7a2db715`, `f70dbf11`, `ab011f87`, `e9d1b44f`, `bc33bb69` |
| T02 Close Folder                 | `3799962a`, `59d7ee84`, `c2b1223c`, `b9f26ce4`             |
| T03 shared tab/Opened Files menu | `608e8dd4`, `a1029963`, `c56e8287`                         |
| T05 inline Files/Outline filter  | `a5283d70`, `4e374932`, `6e2071e4`                         |

## Environment

- Microsoft Windows 11 Pro 64-bit, version `10.0.26200`, build `26200`
- Dell OptiPlex 7080; reported display driver `OrayIddDriver Device`
- User display setting reported `AppliedDPI=96` (100%)
- Node.js `v24.18.0`; pnpm `10.33.4`; Electron `42.1.0`
- Playwright Electron tests: headless, one worker, normally `1280x720`
- Fresh install: `pnpm install --frozen-lockfile` passed from a worktree with no `node_modules` and no `packages/desktop/out`; 1852 packages linked and native rebuild completed

## Automated matrix

Statuses use only `Passed`, `Failed`, `Skipped`, `Unavailable`, and `Untested`.

| Area                                | Status | Command/result and decision                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docs formatting                     | Failed | Full four-file check failed because the frozen Spec and existing tickets are not formatted by Prettier 3.8.4. The T07-owned wayfinder and acceptance evidence were formatted and their isolated check passed. The frozen Spec was not modified merely to make the check green.                                                                                                                         |
| Full lint                           | Failed | `pnpm lint`: 115 errors and 221 warnings. All errors are in three files unchanged from the stage baseline: `.scratch/.../summarize-physical-trace.cjs`, `document-io-coordinator.spec.ts`, and `document-io-electron-adapter.spec.ts`. Isolated ESLint over all 73 changed code/test files passed with 0 errors and 79 warnings. Existing, non-blocking repository debt; no unrelated mass formatting. |
| Typecheck                           | Passed | `pnpm typecheck`                                                                                                                                                                                                                                                                                                                                                                                       |
| Full unit                           | Failed | `pnpm test:unit`: 74 files/992 tests passed, 1 skipped; 10 deterministic failures in unchanged `source-code-image-action.spec.ts` because its source-extraction harness does not inject Vue `computed`; first run also hit Windows `VirtualAlloc`/fork-spawn noise. Isolated stage suite passed: 14 files/125 tests.                                                                                   |
| Full E2E                            | Failed | `pnpm test:e2e` started 354 tests but existing `all-blocks-roundtrip`, anchor and audit-document-integrity failures repeatedly hung worker teardown. The coordinating task requested termination after the bounded window, so the full set did not finish. Focused stage and adjacent groups below supply the acceptance evidence.                                                                     |
| Stage E2E                           | Passed | Eight changed specs: 25/25 passed. Covers Close Folder lifecycle/generation/restart/dirty tabs, Concise/live menu/bidi, captured tab/Opened Files menus, scroll reporting/final state, Files spacing/divider, TOC wrap, and Files/Outline filtering/overlay recovery.                                                                                                                                  |
| i18n/titlebar/search/jump adjacency | Failed | 12/14 passed: i18n, menu sanity, Native light 100%/dark 125%, ripgrep, Source TOC and WYSIWYG TOC passed. Unchanged `layout-persistence.spec.ts` timed out across restart, and unchanged `scroll-up-arrow.spec.ts` remained at `scrollTop=0`; both reproduced alone. T06's profile documents the latter at its baseline.                                                                               |
| Startup/save/transfer adjacency     | Passed | `workspace-startup-policy`, `workspace-native-file-save`, `workspace-transfer`, and `workspace-transfer-electron`: 36/36 passed.                                                                                                                                                                                                                                                                       |
| Build                               | Passed | `pnpm build`; fresh `electron-vite` output: main 503 modules, preload 3 modules, renderer 5884 modules. Existing dynamic/static import warnings only.                                                                                                                                                                                                                                                  |
| Worktree status                     | Passed | Final `git status --short` was empty after removing ignored build/test output and committing this evidence.                                                                                                                                                                                                                                                                                            |

The target unit/E2E coverage also exercises i18n; titlebar visibility/display/live menu/Native/Concise; Close Folder lifecycle, generation, replacement, restart and dirty tabs; shared captured-pane menus and folder generations; file/folder/no-root filters and overlay recovery; scroll unchanged/frame/retry/final-state/lease rules; TOC and Source jumps; ripgrep; startup, save and transfer. The full unit run additionally covered the repository's rename, layout, watcher and workspace suites except for the isolated source-image harness failure above.

## Freshness evidence

`packages/desktop/out` did not exist before the build. E2E was run only after that build. The generated output was inspected before removal and was not committed.

| Output                                       | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `out/main/index.js`                          | `FF871B2B0122C6211ACCB179E51AC99050289CDC20E0BE509D604F2FA4FCF229` |
| `out/preload/index.js`                       | `7CFA9D8D2AB2A259234390F86C330F489B03BCE96186A95F59A4A1EF5534DF11` |
| `out/renderer/index.html`                    | `A2969AC9824FF6DA504C566C1CDAB7A5200DA91C507C871812624FD11B8D9652` |
| renderer behavior bundle `index-B1EEqShv.js` | `2B3434B6721480CE0DA353058D0618B07D79992726A0CA8E42315237818DACA4` |

Content checks found `mt::cmd-close-folder` in main and renderer, `window-close-folder-by-id` in main, `mt::menu::popup-application-submenu` in main and preload, and `scrollObservationEpoch`, `Open This Folder`, and `Concise` in the renderer behavior bundle. This ties the fresh output to the integrated behavior rather than to an older checkout.

## Windows repeatable and manual matrix

Automated Electron interaction remains reported as automated evidence. The user subsequently completed the Windows manual Acceptance and declared it Passed; rows that were unavailable to the headless execution task are therefore marked Passed by user Acceptance without rewriting the earlier automation evidence.

| Scenario                                                                             | Status   | Evidence/limit                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom and Concise, normal and 550px narrow                                          | Passed   | Automated real Electron window; 30px Concise bar, eight menus, live submenu state, safe center, controls, hover title and narrow extension retention.                                             |
| Native, light at 100% and dark at 125% preference zoom                               | Passed   | Automated painted-window regression; physical Windows display coverage was accepted by the user in the final manual pass.                                                                         |
| Maximized window                                                                     | Passed   | Covered by the user's final Windows manual Acceptance.                                                                                                                                            |
| `123.md`, `2026-08-30.md`, `1.2.3.md`, Chinese, English, Arabic/RTL and mixed titles | Passed   | Unit table covers every named sample; Custom/Concise Electron E2E covers a mixed date/LTR/Arabic filename at normal and 550px widths, and the user completed the final Windows visual Acceptance. |
| Folder root/File menus, Close Folder, root replacement and restart                   | Passed   | Automated Electron lifecycle/generation/menu tests.                                                                                                                                               |
| Tabs and Opened Files, captured pane, untitled and folder action                     | Passed   | Automated shared-menu tests plus workspace transfer regression.                                                                                                                                   |
| Files/Outline inline search and independent Find in Folder                           | Passed   | Automated prefix, empty/no-root, replacement, manual expansion, overlay reset, duplicate Outline key and ripgrep regressions.                                                                     |
| Files spacing/divider and TOC wrap                                                   | Passed   | Automated computed layout/hit-target and unlimited-wrap checks plus the user's final Windows manual Acceptance.                                                                                   |
| Wheel and long-document WYSIWYG reporting                                            | Passed   | Automated Playwright wheel and direct DOM scroll; no post-input continuation; final workspace state converged.                                                                                    |
| Native scrollbar thumb                                                               | Passed   | Headless automation could not perform a physical thumb drag; this physical Windows item is covered by the user's final manual Acceptance.                                                         |
| Physical touchpad                                                                    | Passed   | Headless automation had no physical input path; this physical Windows item is covered by the user's final manual Acceptance.                                                                      |
| Dense Files/Outline/Search, long Preferences, many tabs human smoke                  | Passed   | Static overflow inventory and targeted automation are supplemented by the user's final Windows manual Acceptance.                                                                                 |
| Custom theme                                                                         | Passed   | Covered by the user's final Windows manual Acceptance.                                                                                                                                            |
| Linux                                                                                | Untested | The user reported that Linux was not tested.                                                                                                                                                      |
| macOS, including absence of Concise                                                  | Untested | The user reported that macOS was not tested; platform guard remains covered only by unit logic.                                                                                                   |

## Known limitations and recorded items

1. Full repository lint is red on unchanged files. The stage's changed files have no lint errors.
2. Full unit is red on the unchanged source-image source-extraction harness; the stage unit suite is green.
3. Full E2E cannot be claimed green or complete. Existing document-integrity/round-trip failures and Electron teardown hangs prevented completion. `layout-persistence` and `scroll-up-arrow` also fail alone; direct stage lifecycle, scroll final-state and programmatic TOC/Source jump coverage is green.
4. The pnpm install reports that the package-level `uiohook-napi@1.5.5` build script is not approved; the repository postinstall nevertheless completed its explicit native-module rebuild.
5. No installer, unpacked distributable, `packages/desktop/out`, Playwright result, or other temporary artifact is committed. The handoff is the local source branch plus reproducible build steps.

None of the recorded failures supplies direct evidence of data loss, stale Folder root pollution, wrong-pane action, lost final scroll state, or a stage build/typecheck failure. They remain recorded items under the repository's blocking rules.

## User final Acceptance result and remaining steps

The user declared the Windows manual Acceptance Passed. The following Windows checklist records the accepted matrix; only the final Linux/macOS step remains Untested:

1. Check out the local acceptance commit on `codex/t07-desktop-navigation-acceptance`, run `pnpm install --frozen-lockfile`, then `pnpm build` and `pnpm start`. Confirm the source behavior SHA is `6e2071e495677bf4c650b649d879ecec77bbeddc`; a new build may have different content hashes.
2. Restart through Custom, Native and Concise. At 100% and physical 125% DPI, test normal, 550px and maximized windows. Read every named filename sample, hover long titles, operate all eight Concise menus, and verify checked/disabled/radio/accelerator/native keyboard behavior.
3. With saved, dirty and untitled tabs in both panes, compare tab and Opened Files menus. Exercise Move/Open/Split, Open/Close This Folder, root/subdirectory/file context menus and File menu enabled state.
4. Close a Folder root, immediately mutate the old directory, open another root, edit/save retained documents, then exit immediately and restart. Confirm no old nodes/root return and recent/picker paths remain.
5. Exercise every Files prefix/no-root/empty-term case and Outline ancestor/collapse restoration. Confirm Edit -> Find in Folder remains the independent ripgrep view.
6. Compare Files spacing/divider and TOC wrapping in light, dark and a custom theme at narrow and wide Sidebar widths.
7. On a physical device, scroll long WYSIWYG/Source documents, many tabs, dense Files/Outline/Search and long Preferences using wheel, touchpad and scrollbar thumb. Verify direct 1:1 input and TOC/search/cursor jump behavior.
8. Remaining Untested work: repeat the applicable non-Concise matrix on Linux and macOS; on macOS verify that Concise is absent.

Final platform status: Windows Passed; Linux Untested; macOS Untested.
