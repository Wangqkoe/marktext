# Typora-inspired MarkText shell implementation

Label: `wayfinder:implementation-map`
Status: `resolved`

## Destination

Implement and verify the approved Typora-inspired MarkText application shell without copying Typora code or assets, changing the Markdown document theme, redesigning Preferences, retaining the activity rail, or pushing commits to GitHub.

## Resolution

All seven implementation tickets are resolved:

- [Expand canonical shell layout state](issues/01-expand-canonical-shell-layout-state.md)
- [Replace the activity rail with a full sidebar](issues/02-replace-activity-rail-with-full-sidebar.md)
- [Contract the legacy sidebar layout interface](issues/03-contract-legacy-sidebar-layout-interface.md)
- [Build the grid shell and status foundation](issues/04-build-grid-shell-and-status-foundation.md)
- [Add source mode and word count to the status bar](issues/05-add-source-mode-and-word-count-status.md)
- [Show accurate caret position](issues/06-show-accurate-caret-position.md)
- [Complete shell acceptance](issues/07-complete-shell-acceptance.md)

The implementation spans commits `0690f5da` through `16f098ea`, followed by local documentation closure. Review remediation is included in the same local history.

## Verification

- Full Electron E2E: 245 passed, 4 skipped, 0 failed.
- Unit tests: 767 passed, 1 skipped.
- Type checking: passed.
- Lint: passed with 131 pre-existing warnings and no errors.
- Unpacked production build: passed.
- Windows custom title bar, light/dark, 640×480 and 125% application zoom: passed.
- Windows native title-bar renderer startup and compositor paint: passed in light/100% and Material Dark/125% profiles.
- Detailed evidence and unavailable-platform qualifications are recorded in [the Ticket 07 acceptance results](07-acceptance-results.md).

## Recorded limitations

- macOS and Linux smoke tests were not run because those platforms are unavailable in this workspace.
- Native non-100% OS display scaling was not run; 125% Electron application zoom passed.
- Windows Graphics Capture could not capture the native-framed Electron window, so the native renderer was verified through Electron DOM and compositor assertions instead.

## Boundary for subsequent work

Unrelated product defects belong to the separate [MarkText bug audit map](../marktext-bug-audit/map.md). Reopening this shell map requires evidence that a defect violates a resolved shell acceptance criterion.
