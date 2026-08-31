# Stabilization triage queue

- Closed: STAB-001, STAB-002, STAB-004, STAB-006, STAB-008, STAB-010, STAB-011, STAB-012, and STAB-R001.
- Closed incorrect test chain: STAB-P001; `File > Move To` is a filesystem move,
  not a window Move.
- Deferred: STAB-005 is P2.
- STAB-003 is collected only with a failing run; it is not an independent repair
  lead or a guessed root cause.
- STAB-006 is `Closed / Manual-retest Passed` for the packaged close→Move path; see the [single evidence record](../marktext-feature-development-2026-08/handoff/evidence/stab-006-close-then-move-2026-08-29.md). Its physical drag-out is a separate T07 gate, passed for the supported single-primary shape; see the [T07 evidence](../marktext-feature-development-2026-08/handoff/evidence/t07-physical-drag-out-2026-08-29.md). STAB-008 is `Closed / Manual-retest Passed`; see the [single evidence record](../marktext-feature-development-2026-08/handoff/evidence/stab-008-details-2026-08-29.md). Screen-reader/PDF and the full manual matrix remain pending.
- STAB-007 reopened when integration `5847be6e` reproduced a real-dialog Save As result with no write/title rebind. Diagnostic `f593a5aa` (**DO NOT MERGE**) showed correct dialog output twice, then `unknown or revoked sender` before write. Root cause was unconditional `did-start-navigation` detach on same-document/hash navigation. Final `e583ee79` + `adaca3fa` are fast-forwarded to integration `adaca3fa36279ceb8f8deac37fff692851274586`; `f593a5aa` is not merged. Six unit files / 90 tests, two native-save E2E rounds of 5/5, desktop typecheck/build, fresh `electron-builder --dir`, and scoped production/E2E lint passed; both independent review axes passed with 0 blockers / 0 records. Existing adapter lint 74 errors / 1 warning matches the fixed point and is a non-blocking record.
- STAB-007 is `Resolved / Manual-retest Passed` for the complete same-hash packaged save-path regression: both untitled Ctrl+S and File > Save reached native Save As and wrote/rebound; Cancel retained dirty content without a target, double Ctrl+S produced one dialog/one write, and already-bound Save wrote without a dialog; CrashDraft tombstones and normal `clean-shutdown.json` were observed; see [manual retest evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-007-sender-save-as-2026-08-29.md). This is not a full manual-matrix pass: Move/close/open/details/accessibility/PDF, T12, final Review, and Acceptance remain Pending/Untested.
- P2 record from this round: STAB-009 — `File > Move To` moves data safely but leaves the visible title stale.
- STAB-010 is `Closed / Manual-retest Passed`; exact repair, 2/2 regression, 5/5 native-open suite, 6/6 last-tab close, 48/48 runtime, artifact, and manual evidence are in the [STAB-010 record](../marktext-feature-development-2026-08/handoff/evidence/stab-010-close-reopen-2026-08-29.md).
- STAB-011 is `Closed / Manual-retest Passed` for the Details floating HTML edit
  entry. The repaired source/Preview/Escape path passed the final fresh-profile
  6/6 manual retest; see the [STAB-011 evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-011-details-floating-edit-2026-08-30.md).
- STAB-012 is `Closed / Manual-retest Passed` at ticket scope: the old final
  package's no-target CrashDraft restart created a recovery window and then an
  extra normal window. Production repair `810db72d` is integrated at `85e5b61e`;
  the isolated CrashDraft restart/close replay passed on the task artifact. See
  the [STAB-012 evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-012-recovery-startup-close-2026-08-30.md).

Accept and normalize further user reports.

Historical final status: **T12 Accepted at `57d2ae4d`**. That conclusion is
preserved as the recorded 2026-08-30 result, but the newly reported STAB-012 P1
invalidates its old final artifact as the current final candidate. STAB-012 is
repaired, integrated, and manually retested at ticket scope; T12 is now
**reopened for final-candidate generation and same-package regression gates**.
It must not be described as currently Accepted until a package built from
`85e5b61e` (or a later documentation-only descendant) completes the new final
candidate checks. See the [STAB-012 evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-012-recovery-startup-close-2026-08-30.md) and
[updated T12 evidence](../marktext-feature-development-2026-08/handoff/evidence/t12-final-acceptance-2026-08-30.md).
STAB-005 and STAB-009 remain deferred/P2. Screen-reader/PDF and other explicitly
unclaimed environments remain untested; this is not a blanket manual-matrix pass.

For every new P0/P1 report, `diagnosing-bugs` requires the same artifact, a
unique profile, the accurate entry method, timestamp, PID/window/logical-tab
state, and one red-capable command that has actually run. No repair begins
without that red light; entries marked "unavailable" have not met this gate.
