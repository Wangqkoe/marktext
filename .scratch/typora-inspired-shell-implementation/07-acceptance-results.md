# Ticket 07 shell acceptance results

Date: 2026-08-21

## Automated acceptance

- `pnpm exec playwright test shell-acceptance.spec.ts`: 6 passed.
  - F6/Shift+F6 cycles shell regions; sidebar navigation, search, and settings expose visible keyboard focus.
  - The status-bar word counter is keyboard operable and visibly focused.
  - Editor tabs use roving focus and can be selected, created, and closed from the keyboard; the visually hidden New Tab action becomes visible on keyboard focus.
  - Active, inactive-hover, close-hover, New Tab hover, unsaved and focus tab states consume the shared shell semantic theme values.
  - All 33 bundled themes meet the shell semantic contrast checks without per-theme shell branches.
  - Electron zoom at 125% keeps the status controls aligned and operable and restores the previous zoom afterward.
- `pnpm exec playwright test layout-persistence.spec.ts`: 1 passed.
  - Restart persistence covers tabs, source-mode startup preference, sidebar state, and matching menu checkmarks.
- `pnpm test:unit`: 767 passed, 1 skipped.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with 131 pre-existing warnings and no errors after removing Playwright's generated `.last-run.json` artifact.
- `pnpm build:unpack`: passed.

## Full E2E run

The final `pnpm test:e2e` run completed with 243 passed, 4 skipped, and 0 failed. All Ticket 07 shell-acceptance and layout-persistence tests passed.

The seven failures reported by the first full run were reproduced unchanged at the Ticket 07 base commit `932b89ba`, then repaired so they no longer block release acceptance:

- The round-trip suite now distinguishes MarkText's canonical internal LF representation from the original on-disk line ending and still proves byte-stable saves.
- The launch expectation follows the current filename-only title contract (`Untitled-1`).
- The collapsed-folder regression creates and opens its own temporary project instead of depending on persisted sidebar state.
- The selection regression now accepts Chromium's double-click boundary whitespace and verifies that Find preserves the committed selection exactly.

## Independent review remediation

The independent Ticket 07 review of `932b89ba...d983a1f6` found three release blockers. Each is covered by a red-to-green Electron test:

- New Tab keyboard focus previously left the action at `opacity: 0`; the cascade order is corrected and the test asserts computed opacity as well as the focus ring.
- Editor-tab hover, active, unsaved and focus states previously consumed legacy theme variables; the tab stylesheet now uses shell semantic aliases and a sentinel-color test exercises the real rendered states.
- The full E2E suite is now green as recorded above.

## Manual and platform matrix

- Windows automated acceptance: passed.
- Windows custom-title-bar light mode: passed interactive inspection in an isolated development profile. The compact title row, 255px docked sidebar, hidden-sidebar zero-width state, status controls and editor workspace matched the approved shell structure without a phantom rail or blank sidebar header.
- Windows custom-title-bar dark mode: passed interactive inspection with Material Dark. The title controls, sidebar tabs/search/settings, dividers, editor and status controls remained distinguishable and aligned.
- Windows 640×480 smoke: passed interactive inspection with a 331px widened, docked Outline sidebar. The editor remained usable, the sidebar did not transform into an overlay or activity rail, and the status controls remained present.
- Windows 125% application zoom: passed interactive inspection in a fresh isolated profile. The dark custom title bar, sidebar, editor and bottom controls remained aligned and operable; the visible word count was `W 117`.
- Windows source/status smoke: passed interactive inspection. The bottom source-mode control entered the CodeMirror view and the status bar reported `Source`, `Ln 25, Col 1` and `W 117`; the sidebar control retained the same footprint and alignment.
- Windows sidebar state smoke: the running editor state recorded `sidebarView: "toc"`, `sidebarVisible: true` and `sidebarWidth: 331` after interaction. Restart persistence remains covered by the passing Electron acceptance test above because launching a file through a new command-line process intentionally creates a different editor-state record.
- Windows native-title-bar startup smoke: **failed** in two fresh isolated Material Dark profiles at both 100% and 125% zoom. With `titleBarStyle: "native"`, the source build opened an opaque black client area titled `MarkText`, exposed no renderer accessibility tree and did not load the requested Markdown file. The equivalent custom-title-bar profiles loaded normally. Native light/dark layout inspection could not proceed past this reproducible release blocker, which must be diagnosed before Ticket 07 can close.
- The normal installed MarkText profiles and windows were not modified; all interactive runs used temporary `--user-data-dir` profiles.
- macOS and Linux: unavailable in this Windows workspace.
- Native non-100% OS display scale: unavailable in the current session. Electron 125% application zoom is covered by automated and interactive acceptance.

No GitHub push was performed.
