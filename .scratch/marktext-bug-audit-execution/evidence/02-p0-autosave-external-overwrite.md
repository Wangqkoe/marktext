# Candidate evidence record: `W3-AUTOSAVE-EXTERNAL-OVERWRITE`

## Identity and environment

- Observed at (local date/time and timezone): 2026-08-21 09:52–09:56 -07:00.
- Git commit (`git rev-parse HEAD`): `463df5d1ad96ccb2129f0592cc7a9a2b66a21cf6` before repair; repaired by local commit `26b09ea6`.
- Git worktree state (`git status --short`): controlled audit test changes plus user-owned untracked `AGENTS.md` and `CONTEXT.md`; neither user file was modified or committed.
- OS, version and architecture: Windows product report `Windows 10 Pro`, version `2009`, build `26200`, 64-bit; Node `v24.18.0` x64.
- MarkText/Electron version and launch command: MarkText `0.20.0-rc.1`, Electron `42.1.x`; `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts`.
- Audit configuration (E1–E5, window size, app zoom, title-bar mode, theme): E1, 1280×720, 100%, custom title bar visible, light theme.
- Profile mode: isolated `w3-autosave-external-race`.
- Artifact root (absolute path, if retained): disposable `%TEMP%\marktext-audit-*`; cleaned after each run. Playwright failure context was generated under `packages/desktop/test-results/`.

## Input and controlled clean state

- Fixture: F3 disposable copy at `%TEMP%\marktext-audit-*\fixtures\F3 path with spaces 中文\CJK 中文 emoji 😀.md`; initial UTF-8 CRLF bytes SHA-256 `75b95746611680dcbde8b1f6464965f9ccb94a644de835dcc21a3b8b836dff9f` (130 bytes).
- Original user file status: not used.
- Clean-state steps (fresh profile, launch arguments, Preferences, setup): generate F3, launch it with a fresh caller-owned profile, enable auto-save with a 100 ms delay, and wait until the first editor change is on disk and the tab is clean.
- Exact action sequence: append `W3-RACE-AUTOSAVE`; wait for auto-save; immediately append `W3-RACE-EXTERNAL-CONTENT` to disk externally; wait beyond watcher stabilization without mode toggles; make `W3-RACE-USER-NEXT-EDIT`; wait for the next auto-save; inspect final disk bytes.

## Expected and actual behavior

- Expected behavior and basis (accepted specification, Markdown/format semantics, automated contract, or stable existing interaction): a later external write is not an own-save event. It must be reloaded into a clean tab or surfaced as a conflict before a later editor save; its bytes must not be silently discarded.
- Actual application-level evidence (disk bytes/hash, process state, DOM/computed style/accessibility/hit-test, IPC/store state, output artifact): before repair, final disk content contained `W3-RACE-AUTOSAVE` and `W3-RACE-USER-NEXT-EDIT` but no `W3-RACE-EXTERNAL-CONTENT`. The watcher removed the matching ignore entry solely by path/time and returned `true`, so the renderer never observed the external change and the next auto-save overwrote it.
- Supporting screenshot/video, if any (not primary evidence): none required.
- Normal control and second observation method, where applicable: ordinary clean external reload passes after the own-save event is consumed; unit tests directly prove matching bytes are ignored while different bytes are delivered. After repair, the minimized disk-outcome regression passes 2/2 and the complete W1/W3 file passes 3/3.

## Reproduction and classification

- Attempts/failures and rate (for example `2/2` or `2/10`): 2/2 deterministic failures before repair; 0/2 failures after repair.
- Catching command, automated test, or bounded manual checklist: `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save" --repeat-each=2`.
- Severity: P0.
- User impact and severity rationale: a valid external edit can be silently and irreversibly overwritten by a later MarkText auto-save; this is direct user-data loss.
- Final disposition: confirmed deterministic.
- Related candidate/duplicate or baseline, if applicable: none.
- Next action / reason no product repair is proposed: repaired locally in `26b09ea6`; Ticket 02A review identified and repaired queued/concurrent watcher follow-up issues in `6e4b113c`, then accepted the cumulative repair with no serious findings remaining.
