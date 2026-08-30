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
This initial failure observation does not include an application-exit assertion.
The record does not infer when the user independently closed the application.

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

## Formal repair and verification

Candidate commit `7c55bc4ef891e1c56747b347025088bc2d3826ef` is integrated at
`de73aa76d5db7635cc26999c146892f51a160a91`. The repair sends the existing
`mt::window-tab-closed(fileKey)` exactly once after a successful applied
file-backed `closeLegacyTab`; cancel/failure/rejected closes send nothing, and
last-tab window-close behavior is unchanged. The candidate/integration
package-input diff is empty.

The baseline red reproduced New Tab/no canonical path/no sentinel on reopen.
The exact STAB-010 E2E, from cwd
`C:\Users\1407\.codex\worktrees\c884\Marktext\packages\desktop`, was:

```powershell
& .\node_modules\.bin\playwright.cmd test test/e2e/workspace-native-file-open.spec.ts --config=test/e2e/playwright.config.ts --grep STAB-010 --repeat-each=2
```

It passed 2/2; the complete
`workspace-native-file-open` suite passed 5/5; last-tab-window-close passed 6/6;
workspace runtime passed 48/48. Typecheck, scoped ESLint, desktop build, and
diff-check passed. Final independent Standards and Spec reviews both passed
with 0 blockers / 1 record. The transparent record is that discard,
dirty-bound-save, save-failure/rejected, and untitled typed Save As were not
each re-tested for the legacy registry; the code chain has no observed risk and
is not expanded here.

## Formal artifact and manual retest

Artifact: `C:\Users\1407\.codex\worktrees\c884\Marktext\dist\stab010-formal-complete-7c55bc4e\win-unpacked`;
129 files / 476,321,652 bytes; no diagnostic markers. SHA-256: `marktext.exe`
`70D668C1D85867E43D47AB582E28F12E4F5F756CC72B0889B5BD40D36E70AB7A`;
`resources\app.asar`
`A00578C98938CD587A46E925DB3206724E3200DF31685198FEB5F69D265F3BF7`;
`icudtl.dat`
`C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.

The manual process started at `2026-08-29 23:22:53 PDT`; final capture was
`2026-08-29 23:29:08 PDT`. It used the complete artifact above. The exact
launch command was:

```powershell
Start-Process -FilePath 'C:\Users\1407\.codex\worktrees\c884\Marktext\dist\stab010-formal-complete-7c55bc4e\win-unpacked\marktext.exe' -WorkingDirectory 'C:\Users\1407\.codex\worktrees\c884\Marktext\dist\stab010-formal-complete-7c55bc4e\win-unpacked' -ArgumentList '--user-data-dir=C:\Users\1407\AppData\Local\Temp\marktext-stab010-manual-final-7c55bc4e\manual-01\profile', 'C:\Users\1407\AppData\Local\Temp\marktext-stab010-manual-final-7c55bc4e\manual-01\split-close-reopen-final.md' -PassThru
```

Profile
`C:\Users\1407\AppData\Local\Temp\marktext-stab010-manual-final-7c55bc4e\manual-01\profile`
and fixture
`C:\Users\1407\AppData\Local\Temp\marktext-stab010-manual-final-7c55bc4e\manual-01\split-close-reopen-final.md`
(68 bytes, SHA-256
`F4171F54EB98D136A2C32F9730937DB22C2BAC29A97F8988C7BA496BF8C305FF`, sentinel
`STAB010_MANUAL_CLOSE_REOPEN_7C55BC4E`), the user confirmed: File > New Tab;
saved tab Split Right; close the right-pane sole saved tab and collapse to one
pane New Tab without closing the window; Ctrl+O same-path reopen restored the
file with correct title and sentinel.

Main PID `58120` was Responding; final enumeration showed one visible window
`split-close-reopen-final.md` and five exact-profile processes. The main log had
absolute path
`C:\Users\1407\AppData\Local\Temp\marktext-stab010-manual-final-7c55bc4e\manual-01\profile\logs\20268\main.log`,
5 info lines and 0 ICU/error/crash entries. Crashpad root was
`C:\Users\1407\AppData\Local\Temp\marktext-stab010-manual-final-7c55bc4e\manual-01\profile\Crashpad`;
0 `.dmp` files. At the final capture the application was still running with
five exact artifact/profile processes: PIDs `58120`, `23588`, `36312`, `59116`,
and `58708`. This manual result counts only the four functional confirmations;
application exit status is not part of this round's conclusion. No inference is
made about when the user independently closed the application.
