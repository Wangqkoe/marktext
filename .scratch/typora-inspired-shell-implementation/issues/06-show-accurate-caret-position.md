# 06: Show accurate caret position in both editor modes

**What to build:** Add a single one-based line-and-column status value that follows the active caret in both WYSIWYG and source modes. Updates must be efficient for large documents and must never leak a stale position across tab or mode switches or alter editing history and persistence behavior.

**Blocked by:** 04: Build the grid shell and status foundation.

**Status:** resolved

Resolution evidence: implementation `012e9967`, review fix `932b89ba`, `caret-position.spec.ts`, `caret-status.spec.ts`, and the final Ticket 07 verification recorded in [the acceptance results](../07-acceptance-results.md).

- [x] WYSIWYG mode reports the active Muya Markdown focus position as one-based line and column values.
- [x] Source mode reports the active CodeMirror focus/head position using the same one-based convention.
- [x] The status bar formats valid positions consistently as `Ln n, Col n`.
- [x] The caret value is hidden when there is no active document or no valid active-editor position.
- [x] Switching tabs or editor modes clears the previous value before the new editor reports.
- [x] Late updates from a previously active tab or mode are rejected.
- [x] WYSIWYG caret calculation is coalesced to at most once per animation frame during rapid selection changes.
- [x] Caret reporting does not mutate Markdown, saved cursor state, undo history, dirty state, word count or source/WYSIWYG transitions.
- [x] Pure tests cover zero-to-one conversion, null positions, focus endpoint selection, stale-update rejection and update coalescing.
- [x] End-to-end tests verify exact positions after typing, clicking, moving with arrow keys, switching modes and switching tabs.
- [x] Existing editor cursor, source undo/reload and saved-state regression suites remain green.
