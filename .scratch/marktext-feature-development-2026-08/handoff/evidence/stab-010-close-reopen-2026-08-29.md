# STAB-010 close→reopen evidence — 2026-08-29

## Disposition

STAB-010 is a P1 blocker: closing a saved workspace tab can leave the main
opened-file registry stale, so reopening the same unchanged path through File >
Open becomes a no-op. This is a stabilization record for the close→reopen path;
it does not claim that Split Right or pane collapse is itself defective.

## Reproduction and evidence

The exact formal artifact was used: `C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920\win-unpacked`;
`marktext.exe` SHA-256
`F7C3E3EBF82995C7D71E544F5F1FAF7E41C86219A38D50F52B7768869B7B03B5`.
Profile:
`C:\Users\1407\AppData\Local\Temp\marktext-final-split-800a9920\manual-01\profile`.
Fixture:
`C:\Users\1407\AppData\Local\Temp\marktext-final-split-800a9920\manual-01\split-final.md`;
45 bytes, SHA-256
`C11D46FC7CD29394393102707821549DA2B25D2D03F592CA5F6590E5B695FB5A`.

The user performed: launch `split-final.md` → File > New Tab → tab context
`Split Right` → close the right-pane sole saved-file tab and collapse → Ctrl+O,
select the same existing unchanged `split-final.md`. The file did not reappear.
The main log had 5 info lines and 0 error/crash entries; 0 dumps were present.
The application then exited cleanly with 0 exact-artifact processes. This record
does not infer when the user independently closed the application.

## Diagnostic boundary and confirmed code evidence

`PaneEditorComposition.closeLegacyTab()` can successfully remove the document
and view and collapse the pane without sending the existing
`mt::window-tab-closed` IPC. The legacy close path sends that IPC, and main
`WindowManager` relies on it to call `EditorWindow.removeFromOpenedFiles`.
Consequently stale `_openedFiles` makes `EditorWindow.openTabs` treat the path as
a duplicate and send `mt::switch-tab-by-file_path`; the renderer no longer has
that tab and the operation no-ops. Split collapse is not the root cause: the
same stale registry can occur in a single pane, while closing the last document
tab through the window-close path is distinct.

## Test-first contract for the follow-up implementation

First add a red regression to the existing `workspace-native-file-open.spec.ts`
using a saved fixture and the real File/Open entry: New Tab → close saved tab →
reopen the same path → assert the tab, content, and path return. Cover ordinary
single-pane close; Split collapse may be a minimal second assertion. Preserve
last-tab window-close behavior.

The minimal implementation contract is: before a successful close, capture the
canonical `fileKey`; only when the final close result is `applied`, send the
existing `mt::window-tab-closed(fileKey)` exactly once. Clean close, dirty
discard, and dirty save-then-close send it; cancel, save failure, and rejected
close send nothing. Add no new IPC, type, registry, or abstraction.
