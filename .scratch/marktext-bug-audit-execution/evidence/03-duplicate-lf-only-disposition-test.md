# Candidate evidence record: `TICKET-01-LF-ONLY-DISPOSITION-NEGATIVE-MUTATION`

## Identity and environment

- Observed at (local date/time and timezone): 2026-08-22 08:39 -07:00.
- Git commit (`git rev-parse HEAD`): `f4e3c52a372c44712e8e1d3c093e8a074a4d8ce1`.
- Git worktree state (`git status --short`): Ticket 03 audit harness/evidence only plus user-owned untracked `CONTEXT.md`; `CONTEXT.md` was untouched.
- OS, version and architecture: Windows 11 Pro 10.0.26200 x64; Node v24.18.0 x64.
- MarkText/Electron version and launch command: MarkText `0.20.0-rc.1`; Electron Playwright supporting-prior-art command recorded in `03-w2-results.md`.
- Audit configuration (E1–E5, window size, app zoom, title-bar mode, theme): not a desktop product workflow; Node test text processing only.
- Profile mode: no desktop profile used for the failing negative assertion.
- Artifact root (absolute path, if retained): ignored `packages/desktop/test-results/`; no product artifact required.

## Input and controlled clean state

- Fixture: tracked `candidate-record-template.md`, read only by the fixture-validation test.
- Original user file status: not used.
- Clean-state steps (fresh profile, launch arguments, Preferences, setup): run the existing prior-art fixture test after a Windows checkout with CRLF line endings.
- Exact action sequence: the negative assertion calls `template.replace('  - expected behavior\n', ...)`; with CRLF checkout bytes it does not alter the nested disposition list, so validation correctly accepts the unchanged template.

## Expected and actual behavior

- Expected behavior and basis (accepted specification, Markdown/format semantics, automated contract, or stable existing interaction): the negative test must remove a disposition independent of checkout line endings, then the validator must reject the altered list.
- Actual application-level evidence (disk bytes/hash, process state, DOM/computed style/accessibility/hit-test, IPC/store state, output artifact): `audit-fixtures.spec.ts` reports that `validateCandidateTemplateDispositions(missingButElsewhere)` did not throw; direct text inspection confirms the LF-only replace string did not match the CRLF working-tree content. This is a test-input construction failure, not a validator or application-runtime result.
- Supporting screenshot/video, if any (not primary evidence): none.
- Normal control and second observation method, where applicable: the same file's ordinary F1–F4 test and retained-artifact test passed; Ticket 01 already documents this exact LF-only portability limitation as deferred maintenance.

## Reproduction and classification

- Attempts/failures and rate (for example `2/2` or `2/10`): 2/2 deterministic failures in the targeted repeat; this reproduces the existing Ticket 01 checkout-dependent harness limitation, not a product failure.
- Catching command, automated test, or bounded manual checklist: `pnpm exec playwright test test/e2e/audit-fixtures.spec.ts --grep "candidate disposition validation" --repeat-each=2 --workers=1`, failing `candidate disposition validation ignores unrelated prose and rejects duplicate list items` assertion both times.
- Severity: P3.
- User impact and severity rationale: none for MarkText users; it only weakens a negative harness assertion on CRLF worktrees.
- Final disposition (choose exactly one): duplicate/baseline regression.
- Related candidate/duplicate or baseline, if applicable: Ticket 01's `01-baseline-results.md`, "Deferred review findings," records this LF-only test portability issue and accepts it as deferred.
- Next action / reason no product repair is proposed: do not reopen Ticket 01 or modify product code during Ticket 03; any newline-agnostic test hardening belongs to separate deferred harness maintenance.
