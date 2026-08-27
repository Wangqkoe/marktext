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
the signed x64 artifacts below.

## Artifacts

| Artifact | Bytes | Modified UTC | SHA-256 |
| --- | ---: | --- | --- |
| `dist/marktext-win-x64-0.20.0-rc.1.zip` | 172,762,409 | 2026-08-27T03:05:25.1602676Z | `6A2A4522514B642060CD81A42383B83E8B1E84E73300431C4EBBAD80DC487503` |
| `dist/marktext-win-x64-0.20.0-rc.1-setup.exe` | 125,325,839 | 2026-08-27T03:05:54.7115072Z | `5A105177B5FEF6FB69D4FEF14179AD776AF094088CE39B7A1A478811D0196409` |
| `dist/marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | 131,481 | 2026-08-27T03:06:00.8802324Z | `09649AD93551932934C86FB2183A80D6B898C101F6B8E1BFE64608962D369EFA` |

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

## Short manual Windows trial checklist

Record tester, UTC time, installed artifact/hash, display count/resolution/scale,
physical versus remote input, and a defect reference for every `Failed` item.

| Required trial | Status | Minimum observation to record |
| --- | --- | --- |
| Default-off startup and explicit associated/CLI target startup | Untested | Normal restart gives one clean New Tab; explicit launch opens only its targets; no inert restore setting; legacy `editorBufferStore` remains untouched. |
| Normal and dirty exit | Untested | Clean exit restores no old tabs/split; dirty save/discard/cancel prompt behavior is unchanged. |
| CrashDraft recovery and power-loss path | Untested | After dirty saved and untitled edits, force a controlled crash/power loss; verify recovery under both normal and explicit target launch, corrupt-latest warning/fallback where fault tooling permits, and changed-disk recovered copy. |
| MoveRecovery | Untested | Interrupt an authorized Move and verify safe recovery; explicit targets must not suppress it. |
| Physical external release, Move/Open, last tab, dirty/untitled/history | Untested | On supported Windows single-primary physical input, prove only trusted outside left-up detaches; test re-entry, Escape, source clean New Tab, history, and conflict behavior. |
| Unsupported/mixed-DPI fallback and menu Move | Untested | On multi-display or mixed-DPI configuration, prove detach is disabled and the menu Move action remains usable. |
| Split/display/scale/motion/keyboard/theme/reduced motion | Untested | Check 720px fallback, divider constraints, display-scale behavior, 180ms/0ms motion, keyboard routing and light/dark themes. |
| Details accessibility and reader/PDF export | Untested | Mouse/focus/Enter/Space and screen-reader semantics; inspect exported HTML/PDF for standard `details`/`open` markup and no editor styling. |

## Gate result and coordinator handoff

| Gate | Status | Evidence / next action |
| --- | --- | --- |
| A14 automated clean Windows-build readiness | Passed | Frozen install retry and `build:win:x64` passed at the provenance commit; artifacts and hashes above. |
| A14 manual Windows trial | Untested | All required manual rows remain outstanding; remote/virtual-display context cannot substitute for physical external-release proof. |
| T12 / final acceptance | Untested | Coordinator must arrange the trial, classify defects, run final independent reviews, and request user Acceptance only after all required manual gates pass and critical defects are zero. |
