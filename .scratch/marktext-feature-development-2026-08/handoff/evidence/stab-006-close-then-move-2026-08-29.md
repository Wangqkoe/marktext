# STAB-006 close-then-move evidence — 2026-08-29

## Disposition

STAB-006 is `Closed / Manual-retest Passed` for the tab-context
`Open in new window` → close → `Move to new window` path. Physical drag-out
was not exercised by this evidence and remains outside the claim.

## Root cause and repair boundary

The transfer adapter detached unconditionally for any `did-start-navigation`.
Vue hash navigation is same-document navigation, so the source endpoint was
lost before the close-then-move sequence could use it. The formal minimal fix
revokes only on main-frame, non-same-document navigation; same-document and
subframe navigation retain the endpoint, while `destroyed` still revokes it.

Formal implementation commit: `800a99208c58c0dbe0eb88c3801bc5461241551c`.
The cherry-pick integration commit was `7ef53a06351a59d58cb6444758c2a109d60fe841`;
the current integration is `9ce0eed0a0d77fa40c6df8158674665148fe0065`, whose
only additional change is the AGENTS documentation commit. The scoped code
diff is empty:
`git diff 800a9920..9ce0eed0 -- packages/desktop packages/muya package.json pnpm-lock.yaml`.

## Formal automated and artifact evidence

- Exact automated commands, from cwd
  `C:\Users\1407\.codex\worktrees\cee8\Marktext\packages\desktop`:

  ```text
  pnpm exec vitest run test/unit/specs/tab-transfer-core.spec.ts
  ```

  Repeat3; each run passed 10 tests. The Electron command passed 10 tests:

  ```text
  pnpm exec playwright test test/e2e/workspace-transfer-electron.spec.ts
  ```

- `pnpm typecheck` was recorded as passed, but its exact cwd was not retained
  (`unknown`). Changed-file lint was recorded as passed, but its exact command
  and cwd were not retained (`unknown`); neither is reconstructed here.
- Complete formal artifact with no diagnostic artifact:
  `C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920\win-unpacked`;
  129 files / 476,315,948 bytes.
- Artifact build record: from cwd
  `C:\Users\1407\.codex\worktrees\cee8\Marktext\packages\desktop`,
  `pnpm run build:unpack` refreshed the output with no failure (numeric exit
  code was not explicitly retained); then this command exited 0:

  ```text
  pnpm exec electron-builder --win --x64 --dir --publish never "--config.directories.output=C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920"
  ```
- SHA-256: `marktext.exe`
  `F7C3E3EBF82995C7D71E544F5F1FAF7E41C86219A38D50F52B7768869B7B03B5`;
  `resources\app.asar`
  `4C3A601D8AF20D1AE8C7DFEE2A87314AED3427897EF0182B590D3F0173E7E81E`;
  `icudtl.dat`
  `C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.
  No diagnostic markers were present.
- Dual review: Standards `PASS`, 0 blockers / 1 record (optional defensive
  default for navigation details); Spec `PASS`, 0 blockers / 1 record
  (complete close→Move combination automation is absent; the first formal
  run's anomaly remains recorded).

## Manual retest

At `2026-08-29 09:47:51 PDT`, this retest used the complete artifact above and
its `marktext.exe` SHA-256
`F7C3E3EBF82995C7D71E544F5F1FAF7E41C86219A38D50F52B7768869B7B03B5`.
The profile was
`C:\Users\1407\AppData\Local\Temp\marktext-stab006-formal-final-800a9920\manual-03\profile`;
the fixture was
`C:\Users\1407\AppData\Local\Temp\marktext-stab006-formal-final-800a9920\manual-03\close-then-move-final.md`,
30 bytes with SHA-256
`1643A172BA83724D09AA3644AB4348571A495EB2494B7AE25A6A7F90C9A1CD0D`.
The exact launch command was:

```powershell
Start-Process -FilePath 'C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920\win-unpacked\marktext.exe' -WorkingDirectory 'C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920\win-unpacked' -ArgumentList '--user-data-dir=C:\Users\1407\AppData\Local\Temp\marktext-stab006-formal-final-800a9920\manual-03\profile', 'C:\Users\1407\AppData\Local\Temp\marktext-stab006-formal-final-800a9920\manual-03\close-then-move-final.md' -PassThru
```

The associated log was
`C:\Users\1407\AppData\Local\Temp\marktext-stab006-formal-final-800a9920\manual-03\profile\logs\20268\main.log`.
No explicit Move instrumentation was available; the log had no error/crash,
so it does not replace the UI evidence below.
The user performed: File > New Tab → file tab Open in new window → target X →
source file tab Move to new window. The user confirmed that Open created the
target, closing it left the source, and Move created the target again; the
source window retained only New Tab after the file tab moved. PID `50380` had
two reliably enumerated visible top-level windows (`close-then-move-final.md`
and `New Tab`); no error, crash, or dump occurred.

This evidence does not claim physical drag-out. The complete same-artifact
manual matrix, STAB-008 manual, accessibility/PDF/T12 checks, and final
Acceptance remain unclaimed.
