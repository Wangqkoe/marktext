# Stabilization triage queue

- Closed: STAB-001, STAB-002, STAB-004, and STAB-R001.
- Closed incorrect test chain: STAB-P001; `File > Move To` is a filesystem move,
  not a window Move.
- Deferred: STAB-005 is P2.
- STAB-003 is collected only with a failing run; it is not an independent repair
  lead or a guessed root cause.
- Active P1: STAB-006 — fresh-profile tab-context `Move to new window` completed with no target window or ownership change on the current exact artifact. Reproduce/diagnose before any repair.
- Active P1: STAB-007 — fresh untitled dirty document does not respond to Ctrl+S or File > Save, and no requested target file is created. Reproduce/diagnose before any repair.
- Active P1: STAB-008 — Details summary disclosure changes its arrow but does not hide/show the body as required by V1 Spec/A11. Reproduce/diagnose before any repair.
- P2 record from this round: STAB-009 — `File > Move To` moves data safely but leaves the visible title stale.

Accept and normalize further user reports.

For every new P0/P1 report, `diagnosing-bugs` requires the same artifact, a
unique profile, the accurate entry method, timestamp, PID/window/logical-tab
state, and one red-capable command that has actually run. No repair begins
without that red light; entries marked "unavailable" have not met this gate.
