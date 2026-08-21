# Ticket 07 shell acceptance results

Date: 2026-08-21

## Automated acceptance

- `pnpm exec playwright test shell-acceptance.spec.ts`: 5 passed.
  - Sidebar navigation, search, and settings expose visible keyboard focus.
  - The status-bar word counter is keyboard operable and visibly focused.
  - Editor tabs can be selected, created, and closed from the keyboard with visible focus.
  - All 33 bundled themes meet the shell semantic contrast checks without per-theme shell branches.
  - Electron zoom at 125% keeps the status controls aligned and operable and restores the previous zoom afterward.
- `pnpm exec playwright test layout-persistence.spec.ts`: 1 passed.
  - Restart persistence covers tabs, source-mode startup preference, sidebar state, and matching menu checkmarks.
- `pnpm test:unit`: 767 passed, 1 skipped.
- `pnpm typecheck`: passed.

## Full E2E run

`pnpm test:e2e` completed with 231 passed, 4 skipped, and 11 failed. All ticket 07 shell-acceptance tests passed in that run. Four failures recovered when the affected specifications were rerun with one worker, indicating suite-load/concurrency sensitivity. Seven failures remained and are outside the shell ticket's scope:

- Four Windows line-ending assertions in `all-blocks-roundtrip.spec.ts` (CRLF versus LF).
- One legacy window-title expectation in `launch.spec.ts`.
- One collapsed-folder test that assumes the project sidebar is initially visible.
- One Chromium double-click selection assertion that includes a trailing space.

The ticket explicitly limits fixes to shell regressions, so these unrelated test-maintenance issues were not changed.

## Manual and platform matrix

- Windows automated acceptance: passed.
- Windows interactive visual inspection: attempted with an isolated development profile. The automation bridge returned an all-black capture and no accessibility tree after the required handle refresh, so the visual result is recorded as blocked rather than passed.
- macOS and Linux: unavailable in this Windows workspace.
- Native non-100% OS display scale: unavailable in the current session. Electron 125% application zoom is covered by automated acceptance.

No GitHub push was performed.
