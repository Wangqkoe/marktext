# Stabilization triage queue

- Closed: STAB-001, STAB-002, STAB-004, STAB-006, STAB-008, and STAB-R001.
- Closed incorrect test chain: STAB-P001; `File > Move To` is a filesystem move,
  not a window Move.
- Deferred: STAB-005 is P2.
- STAB-003 is collected only with a failing run; it is not an independent repair
  lead or a guessed root cause.
- STAB-006 is `Closed / Manual-retest Passed` for the packaged close→Move path; see the [single evidence record](../marktext-feature-development-2026-08/handoff/evidence/stab-006-close-then-move-2026-08-29.md). Its physical drag-out is a separate T07 gate, passed for the supported single-primary shape; see the [T07 evidence](../marktext-feature-development-2026-08/handoff/evidence/t07-physical-drag-out-2026-08-29.md). STAB-008 is `Closed / Manual-retest Passed`; see the [single evidence record](../marktext-feature-development-2026-08/handoff/evidence/stab-008-details-2026-08-29.md). Screen-reader/PDF and the full manual matrix remain pending.
- STAB-007 reopened when integration `5847be6e` reproduced a real-dialog Save As result with no write/title rebind. Diagnostic `f593a5aa` (**DO NOT MERGE**) showed correct dialog output twice, then `unknown or revoked sender` before write. Root cause was unconditional `did-start-navigation` detach on same-document/hash navigation. Final `e583ee79` + `adaca3fa` are fast-forwarded to integration `adaca3fa36279ceb8f8deac37fff692851274586`; `f593a5aa` is not merged. Six unit files / 90 tests, two native-save E2E rounds of 5/5, desktop typecheck/build, fresh `electron-builder --dir`, and scoped production/E2E lint passed; both independent review axes passed with 0 blockers / 0 records. Existing adapter lint 74 errors / 1 warning matches the fixed point and is a non-blocking record.
- STAB-007 is `Resolved / Manual-retest Passed` for the complete same-hash packaged save-path regression: both untitled Ctrl+S and File > Save reached native Save As and wrote/rebound; Cancel retained dirty content without a target, double Ctrl+S produced one dialog/one write, and already-bound Save wrote without a dialog; CrashDraft tombstones and normal `clean-shutdown.json` were observed; see [manual retest evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-007-sender-save-as-2026-08-29.md). This is not a full manual-matrix pass: Move/close/open/details/accessibility/PDF, T12, final Review, and Acceptance remain Pending/Untested.
- P2 record from this round: STAB-009 — `File > Move To` moves data safely but leaves the visible title stale.

Accept and normalize further user reports.

Active P1: **0**. STAB-006, STAB-007, and STAB-008 have passed scoped packaged manual retests, but this does not complete the full same-artifact manual matrix, T12, final Review/Acceptance, screen-reader, or PDF visual inspection.

For every new P0/P1 report, `diagnosing-bugs` requires the same artifact, a
unique profile, the accurate entry method, timestamp, PID/window/logical-tab
state, and one red-capable command that has actually run. No repair begins
without that red light; entries marked "unavailable" have not met this gate.
