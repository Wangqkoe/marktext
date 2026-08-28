# Stabilization triage queue

- Closed: STAB-001, STAB-002, STAB-004, and STAB-R001.
- Closed incorrect test chain: STAB-P001; `File > Move To` is a filesystem move,
  not a window Move.
- Deferred: STAB-005 is P2.
- STAB-003 is collected only with a failing run; it is not an independent repair
  lead or a guessed root cause.
- There are no confirmed P0/P1 fixing tickets.

Accept and normalize further user reports.

For every new P0/P1 report, `diagnosing-bugs` requires the same artifact, a
unique profile, the accurate entry method, timestamp, PID/window/logical-tab
state, and one red-capable command that has actually run. No repair begins
without that red light; entries marked "unavailable" have not met this gate.
