# T12 Windows trial readiness evidence — 2026-08-27

## Scope and disposition

This is **automated build readiness evidence only** for the coordination task.
It does not claim a Windows trial, final acceptance, external-release proof, or
release approval. T11's composed Electron evidence remains recorded at
[`t11-cross-feature-e2e-2026-08-26.md`](t11-cross-feature-e2e-2026-08-26.md).

The required manual rows below are `Untested`; therefore this ticket is not
complete and the coordinator must not request Acceptance from this evidence.

## Provenance

| Field | Recorded value |
| --- | --- |
| UTC run window | install retry completed 2026-08-27; build 2026-08-27T03:00:41.7819313Z–2026-08-27T03:06:01.0298194Z |
| Source commit / branch | `e5d1a85ab96cffa58c77696006ad8a2a2753f347` / `codex/t12-windows-trial-readiness` |
| OS | Windows 11 Pro, 10.0.26200, 64-bit |
| Toolchain | Node `v24.18.0`; pnpm `10.33.4`; Electron `42.1.0`; electron-builder `26.15.3` |
| Install command | `pnpm install --frozen-lockfile` — **Passed on retry** (20.7s) |
| Build command | `pnpm build:win:x64` — **Passed** (exit 0) |

The first install attempt reached postinstall but failed when Windows reported
`EBUSY` removing `native-keymap/build`. No source or lockfile was changed. A
second identical frozen-lockfile command succeeded, including Electron native
module rebuild and locale minimization; the successful build was then run from
that installation.

Build output included Vite dynamic-import notices and electron-builder duplicate
dependency/platform-optional-dependency notices only; it exited zero and created
the x64 artifacts below.

## Artifacts

| Artifact | Bytes | Modified UTC | SHA-256 |
| --- | ---: | --- | --- |
| `dist/marktext-win-x64-0.20.0-rc.1.zip` | 172,762,409 | 2026-08-27T03:05:25.1602676Z | `6A2A4522514B642060CD81A42383B83E8B1E84E73300431C4EBBAD80DC487503` |
| `dist/marktext-win-x64-0.20.0-rc.1-setup.exe` | 125,325,839 | 2026-08-27T03:05:54.7115072Z | `5A105177B5FEF6FB69D4FEF14179AD776AF094088CE39B7A1A478811D0196409` |
| `dist/marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | 131,481 | 2026-08-27T03:06:00.8802324Z | `09649AD93551932934C86FB2183A80D6B898C101F6B8E1BFE64608962D369EFA` |

`Get-AuthenticodeSignature` reports the NSIS installer
`dist/marktext-win-x64-0.20.0-rc.1-setup.exe` as `NotSigned`; its SHA-256 remains
`5A105177B5FEF6FB69D4FEF14179AD776AF094088CE39B7A1A478811D0196409`.
This does not block local A14 automated build readiness, but the installer is
for controlled local trials only. Release signing and distribution approval are
`Untested` and unapproved; this evidence cannot authorize publication.

## Read-only environment observation

Windows reported one primary screen, `2560×1440`, 32-bit color, `144 Hz`, with
a `2560×1392` work area. The process also exposes a Remote Desktop display
adapter and Remote Desktop keyboard/mouse, plus an Oray virtual display driver.
The user DPI value was not available (`Win8DpiScaling=0`, `LogPixels` absent).
High-contrast, Sticky Keys, Toggle Keys, and keyboard-response registry values
were readable, but no screen reader, assistive-input path, or reduced-motion
interaction was exercised. These observations are context only—not usability or
physical-input evidence.

`git diff --check` exited 0 after the build. A process scan found no residual
Node/Electron process whose command line referenced this worktree.

## Final-window exit corrective evidence — 2026-08-27

The user manually tested a fresh-profile Windows x64 package built from baseline
`499de31d7687c86614c47578ac05f99aa5e5405b`. The clean New Tab's Alt+F4 path
**Failed**: the window returned to New Tab and the same main process later
showed an extra `Untitled-1` window. The isolated profile had written
`clean-shutdown.json` and had no unresolved CrashDraft, so this was not a
dirty-exit or recovery result.

The earlier `last-tab-window-close.spec.ts` result was a false positive: its
four assertions waited only for the original Playwright `Page` to close. It did
not prove that Electron's main child exited or that no subsequent
`BrowserWindow` was created. The regression now records the spawned child
before closing, requires it to exit within 5 seconds, and rejects every
replacement window. It retains the tab button, tab command, title-bar, and
native `BrowserWindow.close()` (Alt+F4) close entries. Because the unpackaged
Playwright runner does not itself deliver Windows `activate` after its final
window closes, the native-close regression also narrowly replays that documented
main-process event at `window-all-closed`; baseline reproducibly failed with
`Replacement BrowserWindow appeared before main-process exit: <closed>`.

| Evidence | Status | Command / observed result |
| --- | --- | --- |
| Baseline fresh-profile Windows x64 package: clean New Tab Alt+F4 | Failed | User report against `499de31d`: returned to New Tab, then created `Untitled-1`; no unresolved CrashDraft. This blocks the baseline manual exit claim. |
| Legacy automated last-tab test | Failed as acceptance evidence | Old `4/4` Page-close-only assertions could not observe main-process lifetime or a replacement window. |
| Corrected Electron regression after the minimal fix | Passed | `pnpm -C packages/desktop exec -- playwright test test/e2e/last-tab-window-close.spec.ts --workers=1` — `5 passed` (tab button, command, title-bar control, native Alt+F4 seam, and controlled Windows-activation replay); every case proved child-process exit and no replacement window. |
| Repaired packaged Windows manual Alt+F4/title-bar/tab-close trial | Untested | A user must retest a package built from the repaired commit. Automated proof does not replace this row. |

## Short manual Windows trial checklist

Record tester, UTC time, installed artifact/hash, display count/resolution/scale,
physical versus remote input, and a defect reference for every `Failed` item.

| Required trial | Status | Minimum observation to record |
| --- | --- | --- |
| Default-off startup and explicit associated/CLI target startup | Untested | Normal restart gives one clean New Tab; explicit launch opens only its targets; no inert restore setting; legacy `editorBufferStore` remains untouched. |
| Normal and dirty exit (repaired candidate) | Untested | Baseline clean New Tab Alt+F4 is recorded Failed above. Retest the repaired package: clean exit restores no old tabs/split; dirty save/discard/cancel prompt behavior is unchanged. The final tab's tab button/tab-close command, Alt+F4, and Windows title-bar X must close the window rather than leave a New Tab; Cancel keeps the window/document open and Save/Discard close only after the existing durable path succeeds. |
| CrashDraft recovery and power-loss path | Untested | After dirty saved and untitled edits, force a controlled crash/power loss; verify recovery under both normal and explicit target launch, corrupt-latest warning/fallback where fault tooling permits, and changed-disk recovered copy. |
| MoveRecovery | Untested | Interrupt an authorized Move and verify safe recovery; explicit targets must not suppress it. |
| Physical external release, Move/Open, last tab, dirty/untitled/history | Untested | On supported Windows single-primary physical input, prove only trusted outside left-up detaches; test re-entry, Escape, source clean New Tab, history, and conflict behavior. |
| Unsupported/mixed-DPI fallback and menu Move | Untested | On multi-display or mixed-DPI configuration, prove detach is disabled and the menu Move action remains usable. |
| Split/display/scale/motion/keyboard/theme/reduced motion | Untested | Check 720px fallback, divider constraints, display-scale behavior, 180ms/0ms motion, keyboard routing and light/dark themes. |
| Details source/preview, accessibility, and reader/PDF export | Untested | From details preview, enter source then use Escape or Preview to return to preview; after a theme change, verify state and peer-pane ownership. With `disableHtml`, verify escaped source and no native disclosure, then re-enable it and verify preview returns. Confirm Markdown round-trip before/after preserves original `details`/`open` semantics; also check mouse/focus/Enter/Space, screen-reader semantics, and exported HTML/PDF has standard markup with no editor styling. |

## Gate result and coordinator handoff

### Split-workspace teardown follow-up — 2026-08-27

The focused split cleanup repair was checked against the integration baseline:
the whole `split-workspace.spec.ts` suite passed 4/4 and
`last-tab-window-close.spec.ts` passed 5/5. This is Electron/Playwright fixture
evidence only; it does not replace the required packaged Windows dirty-exit
manual trial.

| Gate | Status | Evidence / next action |
| --- | --- | --- |
| A14 automated clean Windows-build readiness | Passed | Frozen install retry and `build:win:x64` passed at the provenance commit; artifacts and hashes above. |
| A14 manual Windows trial | Untested | All required manual rows remain outstanding; remote/virtual-display context cannot substitute for physical external-release proof. |
| T12 / final acceptance | Untested | Coordinator must arrange the trial, classify defects, run final independent reviews, and request user Acceptance only after all required manual gates pass and critical defects are zero. |

## Packaging diagnostic rerun — 2026-08-27

At `f8179476e449fd40d975300455594593fd065d3f` on Windows 11 Pro
10.0.26200 x64 (Node `v24.18.0`, pnpm `10.33.4`, Electron `42.1.0`,
electron-builder `26.15.3`), `pnpm install --frozen-lockfile`,
`pnpm typecheck`, and `pnpm -C packages/desktop exec vitest run
test/unit/specs/native-gesture.spec.ts` passed (the native suite was 11/11).

Two short direct `electron-builder --win --x64 --dir` probes appeared to stop
after `searching for node modules`, but debug output had already enumerated the
pnpm graph and native modules. The full staged app has 22,041 files; an isolated
temporary `@electron/asar` probe completed its archive in 206 seconds. A full builder run
then produced all targets. The final bounded `pnpm build:win:x64` completed with
`__BUILD_EXIT__=0` after 223 seconds. Therefore no source, lockfile, builder,
or asar configuration change was justified: the prior stop window cut off a
normally silent asar/ZIP/NSIS interval.

One immediate post-smoke rerun returned `EBUSY` while electron-builder opened
`dist/win-unpacked/marktext.exe`; the subsequent process probe found no
worktree-owned MarkText process, and the final retry passed. The available
evidence cannot distinguish a transient file handle from endpoint protection,
so this is a non-blocking environment record rather than a configuration cause.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `dist/marktext-win-x64-0.20.0-rc.1.zip` | 173,336,116 | `313606DF837C6B922C9198B9F971766EFA64C3311473DB455D81F7CB6C0D80E4` |
| `dist/marktext-win-x64-0.20.0-rc.1-setup.exe` | 125,800,750 | `0351460520A2A9CB8833C790CAB9BBBD1ED022A3AAD1399D9FFDE6C4EF66AFAA` |
| `dist/marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | 131,391 | `3E80A45ACF56744B5410083DF577E8BBEE941DDA2F4BBD28756C2FCEE89D9BCE` |
| unpacked `uiohook-napi/bin/win32-x64-146/uiohook-napi.node` | 173,056 | `99106A650B256E174941FA446A489F25C903C7BA24E20959322EEC5B0E4A2727` |

`tar -tf` verified that the ZIP contains the unpacked x64 Electron-42 uiohook
binary, and an isolated-profile unpacked-app smoke remained alive for 12 seconds
after launch. This package check does not replace the required physical Windows
external-release/assistive trial or any T12 manual row: all manual rows and
final acceptance remain **Untested**.
