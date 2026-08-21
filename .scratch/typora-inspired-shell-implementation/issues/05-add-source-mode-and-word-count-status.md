# 05: Add source mode and word count to the status bar

**What to build:** Complete the primary status-bar interactions by adding a source-mode control beside the sidebar control and moving the active document's word count out of the title bar. The status control must reuse MarkText's existing source/WYSIWYG transition so menu, shortcut and pointer entry points always agree.

**Blocked by:** 04: Build the grid shell and status foundation.

**Status:** resolved

Resolution evidence: implementation `b35b97dc`, review fix `4fd5314d`, `shell-foundation.spec.ts`, `editor-input.spec.ts`, and the visible `W 117` Windows smoke recorded in [the acceptance results](../07-acceptance-results.md).

- [x] The source-mode control has an exact 34px footprint and a centered 16×16px SVG.
- [x] Sidebar and source controls have identical vertical and horizontal icon centers within 0.5px.
- [x] The source control's tooltip and accessible name are `Toggle Source Code Mode`.
- [x] The control exposes pressed state, visible keyboard focus and a disabled state without relying only on color.
- [x] Invoking the status control, existing menu command or shortcut drives one shared source-mode state and synchronized menu checkmark.
- [x] The source control is disabled when no document is active while the underlying preference remains preserved.
- [x] The status bar displays `Markdown` or `Source` for the active document mode.
- [x] Word count is removed from the title bar and rendered in the status bar from the active file's count state.
- [x] Switching active tabs updates the displayed count without showing a previous document's value.
- [x] Clicking the compact counter still cycles words, paragraphs, characters and all characters, and its detail tooltip remains available.
- [x] Document mode and word count are hidden in the no-document state.
- [x] Existing source-mode content, cursor, scroll, saved-state and undo regression tests remain green.
- [x] End-to-end coverage verifies shared source state, accessibility attributes, count updates and the W/P/C/A cycle.
