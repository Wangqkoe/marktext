# STAB-007 sender Save As manual retest — 2026-08-29

## Scope and status

**Passed, scoped:** the complete STAB-007 packaged-manual regression: untitled
`Ctrl+S` → native Save As, Cancel, double `Ctrl+S`, and already-bound Save. This
does not pass the complete Windows matrix, T12, final Review, or Acceptance.

## Environment and artifact provenance

- OS: Windows 11 x64, 10.0.26200.
- Final integration: `adaca3fa36279ceb8f8deac37fff692851274586`.
- Manual artifact: `C:\Users\1407\.codex\worktrees\1e9a\Marktext\dist\stab007-fixed-adaca3fa\win-unpacked\marktext.exe`;
  226,508,288 bytes; SHA-256
  `1F22983EDFF222820D1F81CF37C613191C01006E4E31E98A30125390ECAC745F`.
- `resources\app.asar`: 149,922,040 bytes; SHA-256
  `84CC7476C0665A47D77AE3654188A49BBA6D01E6A44E8F612689CD1DBB623099`.
  These hashes match the independent final `dist\win-unpacked` artifact.
- Fresh profile: `C:\Users\1407\AppData\Local\Temp\marktext-stab007-adaca3fa-manual-01\profile`.
- Actual process command line:
  `& 'C:\Users\1407\.codex\worktrees\1e9a\Marktext\dist\stab007-fixed-adaca3fa\win-unpacked\marktext.exe' '--user-data-dir=C:\Users\1407\AppData\Local\Temp\marktext-stab007-adaca3fa-manual-01\profile'`.

## Entry, expected result, and observed result

1. Launched with the fresh profile at 2026-08-29 04:29:10 PDT (main PID
   `15928`; renderer PID `28000` and its single-main-window process tree).
   The fresh session had one main window and one logical `Untitled` tab; the
   single-tab bar could be hidden.
2. Entered exactly `STAB007_NATIVE_SAVE_ADACA3FA`, pressed `Ctrl+S`, selected
   `...\native-save-fixed.md` in the real Windows Save As dialog, then clicked
   Save.
3. Expected: the selected path is durably written with the exact bytes; the
   window and active logical tab rebind from `Untitled` to
   `native-save-fixed.md`; the dirty durable ACK produces a CrashDraft
   tombstone; normal close produces clean-shutdown state.
4. Actual: target creation was observed at 04:29:45 and write at 04:29:46.
   `native-save-fixed.md` contained exactly `STAB007_NATIVE_SAVE_ADACA3FA`
   (31 bytes; SHA-256
   `FA3695097FA49D135A91A3292D51FA19319CAFD638ED5DBF11D3B92E234CD398`).
   At 04:29:46 the window title was `native-save-fixed.md`, confirming active
   logical-tab rebind. `bXQtMA.tombstone.json` was present at 04:29:46.
5. After normal `CloseMainWindow`, `clean-shutdown.json` was present at
   04:44:06 and the fixed-artifact process count was 0.

The profile main log is
`C:\Users\1407\AppData\Local\Temp\marktext-stab007-adaca3fa-manual-01\profile\logs\20268\main.log`:
startup is recorded at 04:29:11 and the Save path has no Save error. This record
intentionally retains only the path and relevant summary, not machine-noise log
content.

## Red/green diagnostic contrast

The packaged `5847be6e` failure returned the selected real-dialog Save As path
but left no target and `Untitled`/dirty state. Diagnostic-only branch
`f593a5aa` (**DO NOT MERGE**) captured the same selected-path sequence twice:
`showSaveDialog` returned `canceled:false` with the correct `filePath`, then
`save-as` was rejected as `unknown or revoked sender` before write. It is not
merged. The final fix is `e583ee79` plus `adaca3fa`: the latter revokes only
main-frame non-same-document navigation, retaining same-document/subframe
authentication while destroyed senders still revoke.

## Second manual session — Cancel, double Save, and bound Save

- Artifact: the same-hash final `C:\Users\1407\.codex\worktrees\1e9a\Marktext\dist\win-unpacked\marktext.exe`
  recorded above (SHA-256 `1F22983EDFF222820D1F81CF37C613191C01006E4E31E98A30125390ECAC745F`).
- Fresh profile: `C:\Users\1407\AppData\Local\Temp\marktext-stab007-adaca3fa-cancel-01\profile`.
- Environment/session: main PID `34764` started 2026-08-29 05:04:57.441 PDT;
  one main window and one logical `Untitled` tab. The shared profile log is
  `C:\Users\1407\AppData\Local\Temp\marktext-stab007-adaca3fa-cancel-01\profile\logs\20268\main.log`.

| Case | Entry and expected result | Actual result / timestamp | Status |
| --- | --- | --- | --- |
| Cancel | In the single dirty Untitled tab, enter `STAB007_CANCEL_ADACA3FA`, press `Ctrl+S`, then cancel the native dialog. Expected: content and dirty Untitled state remain, with no target file. | In the session that started at 05:04:57.441 PDT, the user observed `Untitled-1`, green dirty state, and content retained. The run root contained 0 `.md` files and `must-not-exist.md` did not exist. CrashDraft contained three drafts, latest `bXQtMA.4`. | Passed |
| Double `Ctrl+S` | While that Untitled document is dirty, press `Ctrl+S` twice quickly and save the one dialog to `...\double-save.md`. Expected: one dialog and one durable write/rebind, with no second dialog. | In the same PID/window/tab session, the user observed one dialog and no second dialog after two seconds. `double-save.md` was written with exact `STAB007_CANCEL_ADACA3FA` plus trailing newline (24 bytes; SHA-256 `C43B86437DDE7F1AD0D3B4F9D13DBB89FA23EF4D0B9E3EED5E7539BE927D26A8`); title rebound and dirty cleared. `bXQtMA.6` committed then tombstoned at 05:07:36. | Passed |
| Already-bound Save | Append `STAB007_BOUND_SAVE_ADACA3FA`, then press `Ctrl+S`. Expected: no Save As dialog, same bound title, and dirty clears after the durable write. | In the same PID/window/tab session, the user observed no Save As dialog, title remained `double-save.md`, and dirty cleared. Final file was 53 bytes, mtime 2026-08-29 05:08:47.3939067 PDT, SHA-256 `D79E62D56DE6FBC203B1C2589B9E2F2F8A4406982491199065EF11E694F9C4F6`, containing both sentinels separated by an empty line. `bXQtMA.6` was tombstoned at 05:08:47. | Passed |

At clean bound state, `CloseMainWindow` requested `true`; no second Save dialog
was reported, exact-artifact process count was 0, and `clean-shutdown.json` had
mtime 2026-08-29 05:09:33.938838 PDT. These three cases share the profile log
above; this evidence records only the relevant observations, not machine-noise
log content.
