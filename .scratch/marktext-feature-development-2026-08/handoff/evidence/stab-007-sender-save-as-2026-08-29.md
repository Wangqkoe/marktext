# STAB-007 sender Save As manual retest — 2026-08-29

## Scope and status

**Passed, scoped:** the exact STAB-007 untitled `Ctrl+S` → native Save As path.
This record does not pass packaged-manual Cancel, double `Ctrl+S`, or an
already-bound Save; those remain `Untested` (their separate automated evidence
may remain Passed). It also does not pass the complete Windows matrix, T12,
final Review, or Acceptance.

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
