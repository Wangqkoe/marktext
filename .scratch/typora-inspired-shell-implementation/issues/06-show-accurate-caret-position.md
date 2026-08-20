# 06: Show accurate caret position in both editor modes

**What to build:** Add a single one-based line-and-column status value that follows the active caret in both WYSIWYG and source modes. Updates must be efficient for large documents and must never leak a stale position across tab or mode switches or alter editing history and persistence behavior.

**Blocked by:** 04: Build the grid shell and status foundation.

**Status:** ready-for-agent

- [ ] WYSIWYG mode reports the active Muya Markdown focus position as one-based line and column values.
- [ ] Source mode reports the active CodeMirror focus/head position using the same one-based convention.
- [ ] The status bar formats valid positions consistently as `Ln n, Col n`.
- [ ] The caret value is hidden when there is no active document or no valid active-editor position.
- [ ] Switching tabs or editor modes clears the previous value before the new editor reports.
- [ ] Late updates from a previously active tab or mode are rejected.
- [ ] WYSIWYG caret calculation is coalesced to at most once per animation frame during rapid selection changes.
- [ ] Caret reporting does not mutate Markdown, saved cursor state, undo history, dirty state, word count or source/WYSIWYG transitions.
- [ ] Pure tests cover zero-to-one conversion, null positions, focus endpoint selection, stale-update rejection and update coalescing.
- [ ] End-to-end tests verify exact positions after typing, clicking, moving with arrow keys, switching modes and switching tabs.
- [ ] Existing editor cursor, source undo/reload and saved-state regression suites remain green.

