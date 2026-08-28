# Stabilization triage queue

1. STAB-001 packaged exit on the exact artifact.
2. STAB-002 explicit-file startup using fresh unique-profile comparison.
3. Accept and normalize further user reports.

STAB-003 is collected only alongside a reproduction; it is not an independent
repair lead.

For every P0/P1, `diagnosing-bugs` requires the same artifact, a unique profile,
the accurate entry method, timestamp, PID/window count, and one red command that
has actually run. No repair begins without that red light. Assign one diagnosing
task per defect; keep any repair for that defect in the same task worktree; use an
independent reviewer for review.
