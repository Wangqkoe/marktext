# Manual regression matrix

Run every row on one traceable artifact. Each result must record profile, entry,
expected, actual, log or recording link, and status. Required manual checks are
not replaced by automated tests.

| Scenario | Profile / entry | Expected | Actual / logs or recording | Status |
| --- | --- | --- | --- | --- |
| No-target startup, no restore |  | One clean New Tab |  | Untested |
| Explicit-file startup |  | Only requested valid file |  | Untested |
| Single-window tab close, Alt+F4, title-bar X |  | Correct exit/dirty decision behavior |  | Untested |
| Two-window close behavior |  | Only intended window/process changes |  | Untested |
| New Window |  | Independent window behavior |  | Untested |
| Open and Move |  | Correct ownership/no bootstrap tab |  | Untested |
| External drag/drop |  | Supported behavior or documented fallback |  | Untested |
| Split |  | Pane isolation and collapse behavior |  | Untested |
| Details |  | Native/source-preview behavior |  | Untested |
| Dirty Save / Discard / Cancel |  | No data loss; unchanged choices |  | Untested |
| CrashDraft and MoveRecovery |  | Correct independent recovery |  | Untested |
| File observation / conflict |  | Safe conflict behavior |  | Untested |
