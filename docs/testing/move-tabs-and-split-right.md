# Move tabs and Split Right acceptance checklist

Status: **Pending**. This is a test plan, not passing evidence. Implementation SHA, commands, result counts, fresh build provenance and platform results must be recorded after execution against the final candidate.

Specification: [Move tabs and Split Right](../specs/move-tabs-and-split-right.md).

## Required behavior checks

- [ ] Tab and Opened Files context menus show matching Move to Right / Move to Left and Split Right items, order, enabled states and captured-target results.
- [ ] Move commands and active descriptions use Move terminology; no Split Left exists and genuine Split Right has no keyboard or command-palette entry point.
- [ ] Clicking Split Right on a saved left tab retains it and creates exactly one right view of the same document; dirty and untitled documents behave identically without disk-only copies.
- [ ] Repeating left Split Right selects/reuses the existing right view without duplicates; right-pane Split Right is disabled; no third pane is created.
- [ ] New file/new-tab and normal file-open routes open on the left even when right has focus; no implicit split occurs. Explicit activation of existing tabs/Opened Files items can still focus their right-pane views.
- [ ] Physical drag to both pane edges moves only; Move to Left / Right removes the source view and preserves content. Moving onto the same document coalesces safely.
- [ ] Move to New Window is disabled and rejected for a document visible in both panes; closing the other view restores normal single-view cross-window movement without data loss.
- [ ] Editing either view updates the other; dirty indicators agree; undo/redo is shared, including alternating edits and stale editor reports.
- [ ] Each view's cursor, scroll and Source/WYSIWYG mode remain independent through focus changes, document edits and mode switches.
- [ ] Save and Save As from either view retain one document identity and clear shared dirty state only for saved content; rename and external updates do not fork or overwrite newer content.
- [ ] Closing one view preserves the other, shared history and watcher/file ownership; closing the last dirty view retains cancellation/save/discard safety.
- [ ] Emergency crash-draft/transfer recovery retains coherent document content and ownership without duplicate conflicting documents or stale content. The existing clean-start policy remains; no normal session restoration is added.
- [ ] All ten locale JSON files parse, have matching keys and nonempty translations, and satisfy the new locale contract.

## Execution evidence to fill after implementation

| Check                                                | Status   | Evidence required                                                                         |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| Targeted workspace/menu/i18n unit tests              | Pending  | Exact command, candidate SHA, files/tests/results                                         |
| Targeted Electron behavior and automated drag checks | Pending  | Exact command, fresh bundle provenance, results                                           |
| Typecheck and fresh build                            | Pending  | Commands, candidate SHA and exit status                                                   |
| Owned-file formatting and locale validation          | Pending  | Exact commands and exit status                                                            |
| Windows human physical drag and manual interaction   | Pending  | Environment and actual human observations; automated input alone does not pass this check |
| Linux/macOS platform behavior                        | Untested | Actual platform execution; do not infer from Windows                                      |

Report unrelated baseline failures separately with direct evidence. Do not reuse prior desktop-navigation passes as proof of these new behaviors.
