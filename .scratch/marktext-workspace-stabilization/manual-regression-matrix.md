# Manual regression matrix

This is a bounded, risk-directed audit, not infinite combination enumeration.
Run representative combinations first; expand only the failing dimension after a
red light. Run every selected row on one traceable artifact. Each result must
record profile, accurate entry, expected, actual, timestamp, PID/window/logical-tab
state, log or recording link, and status. Required manual checks are not replaced
by automated tests. Each P1 must additionally retain one red-capable command that
has actually run before repair begins.

| Scenario | Profile / entry | Expected | Actual / logs or recording | Status |
| --- | --- | --- | --- | --- |
| First priority: no-target startup, no restore |  | One clean New Tab |  | Untested |
| First priority: open `.md` through CLI and running-instance delivery | Unique profiles; `launch-assert.mjs` probe | Actual path, title, and content match requested file | `run-2026-08-28T05-19-09-123Z/results.json`: 5/5 renderer pathname/sentinel passed, including quoted spaced/Chinese path and second-file same-window tab; earlier 05-14-53-283Z and 05-18-01-561Z are green controls | Passed (scope only) |
| First priority: native File > Open/Ctrl+O and association/double-click | Native dialog / UserChoice | Actual path, title, and content match requested file | Dialog invoked but Explorer-owned filename control cannot be automated; `MarkText.Document` has no unpacked open command | Unavailable |
| First priority: close in 1x1, 1x2, 2x1, 2x2 logical-tab layouts; representative tab-close/Alt+F4/X per window and final window | Unique packaged profiles; `stb001.ps1 -Mode full` | Correct exit/dirty decision; only intended windows/processes change | `events.ndjson` timestamps identify valid A/B rounds; `matrix.json` is final round only. Minimum B 1x1 sequential-close red 2/2; final title-bar close leaves exact process alive. Exclude ordinary-last-tab harness expectation | Failed |
| First priority: tab reorder versus Split, including single-hidden to multi-visible tab bar | Unique fresh profiles; `stab004-drag-harness.mjs` | Tab/title bar only reorders; document-area edge release splits | Tab-bar y=43 left/right and reorder directions red 2/2: preview then 1 -> 2 panes. Document edges green 2/2; 719px no Split/reorder works; 720px Split works. Drag-out Move `Unavailable` under CDP | Failed |
| First priority: right-click `Move to new window`, Open, and drag-out Move | Fresh profile; right-click `STABR001-move.md` and select `Move to new window` | Correct ownership/no bootstrap tab; Move is not Split | `C:\Users\1407\AppData\Local\Temp\marktext-stab-r001-rerun-59768bdffdac4b428c93551d4a50fbbe`: manual `1/1` passed; target had one moved file tab with the correct pathname/sentinel and no bootstrap tab; source had one clean New Tab and no old-file copy; exactly two windows; normal close left no exact-artifact process. `File > Move To`, `Open in new window`, and ordinary close-last-tab were not exercised. | Passed (STAB-R001 scope) |
| Filesystem Move To (separate from window Move) |  | Save-style dialog and safe disk rename/move |  | Untested |
| Sample: Split, narrow-window disablement |  | Pane isolation/collapse; narrow window disables Split |  | Untested |
| Sample: Details |  | Native/source-preview behavior |  | Untested |
| Sample: Dirty Save / Discard / Cancel |  | No data loss; unchanged choices |  | Untested |
| Sample: CrashDraft and MoveRecovery |  | Correct independent recovery |  | Untested |
| Sample: File observation / conflict |  | Safe conflict behavior |  | Untested |
