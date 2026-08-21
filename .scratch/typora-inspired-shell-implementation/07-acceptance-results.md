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
- Windows interactive visual inspection: attempted with an isolated development profile. The automation bridge returned an all-black capture and no accessibility tree after the required handle refresh, so the visual result is recorded as blocked rather than passed.
- macOS and Linux: unavailable in this Windows workspace.
- Native non-100% OS display scale: unavailable in the current session. Electron 125% application zoom is covered by automated acceptance.

No GitHub push was performed.
