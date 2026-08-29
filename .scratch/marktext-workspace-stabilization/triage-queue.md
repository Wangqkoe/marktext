# Stabilization triage queue

- Closed: STAB-001, STAB-002, STAB-004, and STAB-R001.
- Closed incorrect test chain: STAB-P001; `File > Move To` is a filesystem move,
  not a window Move.
- Deferred: STAB-005 is P2.
- STAB-003 is collected only with a failing run; it is not an independent repair
  lead or a guessed root cause.
- Resolved / automated verified on current source+fresh build: STAB-006 and STAB-008. Their old `9715ced7` packaged/manual observations remain historical evidence; required current packaged Windows/manual retests remain pending.
- STAB-007 reopened when integration `5847be6e` reproduced a real-dialog Save As result with no write/title rebind. Diagnostic `f593a5aa` (**DO NOT MERGE**) showed correct dialog output twice, then `unknown or revoked sender` before write. Root cause was unconditional `did-start-navigation` detach on same-document/hash navigation. Final `e583ee79` + `adaca3fa` are fast-forwarded to integration `adaca3fa36279ceb8f8deac37fff692851274586`; `f593a5aa` is not merged. Six unit files / 90 tests, two native-save E2E rounds of 5/5, desktop typecheck/build, fresh `electron-builder --dir`, and scoped production/E2E lint passed; both independent review axes passed with 0 blockers / 0 records. Existing adapter lint 74 errors / 1 warning matches the fixed point and is a non-blocking record.
- STAB-007 is `Resolved / Manual-retest Passed` for the same-hash packaged Save As blocker: `native-save-fixed.md` contained the expected 31-byte sentinel and title rebind; CrashDraft tombstone and normal `clean-shutdown.json` were observed. This is not a full manual-matrix pass: Cancel, double Ctrl+S, already-bound Save, Move/close/open/details/accessibility/PDF, T12, final Review, and Acceptance remain Pending/Untested.
- P2 record from this round: STAB-009 — `File > Move To` moves data safely but leaves the visible title stale.

Accept and normalize further user reports.

Active P1: **0**. STAB-007's reproduced Save As blocker has a passed packaged manual retest, but this does not complete T12, final Review/Acceptance, screen-reader, PDF visual inspection, or the remaining current packaged Windows manual matrix.

For every new P0/P1 report, `diagnosing-bugs` requires the same artifact, a
unique profile, the accurate entry method, timestamp, PID/window/logical-tab
state, and one red-capable command that has actually run. No repair begins
without that red light; entries marked "unavailable" have not met this gate.
