# Stabilization triage queue

- Closed: STAB-001, STAB-002, STAB-004, and STAB-R001.
- Closed incorrect test chain: STAB-P001; `File > Move To` is a filesystem move,
  not a window Move.
- Deferred: STAB-005 is P2.
- STAB-003 is collected only with a failing run; it is not an independent repair
  lead or a guessed root cause.
- Resolved / automated verified on current source+fresh build: STAB-006, STAB-007, and STAB-008. The old `9715ced7` packaged/manual observations remain historical evidence, not current-product failures. Current source is integration `8f3e0303` (validation tree `14d57913`, identical file tree); the focused native-menu callback, concurrent untitled Save, bound-after-SaveAs/CrashDraft race, and exact empty-line Details sentinel checks passed 3/3 in aggregate. Their required current packaged Windows/manual retests remain pending.
- P2 record from this round: STAB-009 — `File > Move To` moves data safely but leaves the visible title stale.

Accept and normalize further user reports.

Active P1: **0**. This automated disposition does not complete T12, final Review/Acceptance, screen-reader, PDF visual inspection, or the current packaged Windows manual matrix.

For every new P0/P1 report, `diagnosing-bugs` requires the same artifact, a
unique profile, the accurate entry method, timestamp, PID/window/logical-tab
state, and one red-capable command that has actually run. No repair begins
without that red light; entries marked "unavailable" have not met this gate.
