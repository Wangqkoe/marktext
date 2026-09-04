# Move tabs and Split Right

- Status: implementation contract from user request; implementation complete and focused automated validation passed. Windows human acceptance: user-confirmed passed on 2026-09-03 for the eight recorded checks; Linux/macOS untested.
- Final source/test commit: `dd5e1dadb4d550095c8718c2f758685be38fd36f`.
- Baseline: `a4184af194ef351dd6f9239b8fb782a6646b0303`.
- Evidence: [acceptance results and platform boundaries](../testing/move-tabs-and-split-right.md).

## Actions and entry points

- Rename the old pane-relocation actions and their active descriptions to **Move to Right** and **Move to Left**. Movement removes the source view; it does not duplicate document content or create another view merely because a pane edge is involved.
- **Split Right** is a genuine same-document second view, invoked only by an explicit context-menu click. The left tab remains, and the right pane displays the same document. There is no Split Left action.
- Preserve the shared tab-bar / focused-pane Opened Files menu factory: equivalent captured targets have identical items, order, enabled state and results. The shared menu's Split Right is the same explicit action, not a separate implicit entry point.
- A left-pane Split Right reuses the existing right view of that document, if any. Right-pane Split Right is disabled. At most two panes exist.
- New files, new tabs and normal file-open routes open in the left pane, including when the right pane has focus. They never implicitly split. Explicit activation of an existing tab or Opened Files item may focus its existing right-pane view.
- Dragging a tab to either pane edge remains movement only. Existing command/keybinding relocation entry points describe and perform Move; genuine Split Right has no command-palette or keyboard mapping.

## Document and view ownership

- Both views share Markdown, dirty state, undo/redo history, save lifecycle and file identity. Edits, undo/redo and successful saves must be reflected in both views, without stale-view content overwriting newer content.
- Each view retains independent scroll position, cursor and editing mode. Switching or scrolling one view must not unexpectedly reposition or change the other view's mode.
- Moving a view into a pane already showing that document safely coalesces the views: one target view remains, the source is removed, and shared content/history/dirty state are preserved.
- Move to New Window is disabled and rejected while that document has views in both panes; close the other view first. The existing cross-window transfer assumes exclusive source ownership. Single-view cross-window moves remain unchanged, and native pane-edge moves remain supported with safe coalescing.
- Closing one view must not discard the still-visible document, stop its file ownership prematurely, or prompt as though the last document view were being closed. Closing the final view retains the existing dirty-document safety contract.
- Save, Save As, rename, external file changes and recovery must preserve one logical document identity/content across both views; a second view is never an independent disk copy.
- Preserve emergency crash-draft/transfer recovery and the existing clean-start policy; do not add normal session restoration.

## Locale contract

All ten desktop locales have matching keys with translated labels:

- `contextMenu.tabs.moveToRight` and `contextMenu.tabs.moveToLeft`; English values are `Move to Right` and `Move to Left`.
- `contextMenu.tabs.splitRight` remains, now describing genuine Split Right.
- `commands.workspace.moveToRight` and `commands.workspace.moveToLeft` describe movement.
- Remove `commands.workspace.splitRight`; do not add any `splitLeft` key.

## Scope and acceptance boundary

Reuse the current two-pane workspace and shared menu contract. Do not add a third pane, independent document copies, implicit split gestures or unrelated editor refactors. Historical frozen specifications and test evidence retain their original meaning, with supersession notes rather than rewritten results.

Acceptance requires targeted unit and Electron interaction coverage, fresh typecheck/build, locale validation and explicit reporting of any untested manual/platform checks. Treat data loss, wrong persistence/ownership, stale overwrite, failed mandatory checks and missing behavior above as blockers; record unrelated pre-existing warnings separately.
