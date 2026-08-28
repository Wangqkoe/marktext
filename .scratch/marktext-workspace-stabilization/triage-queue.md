# Stabilization triage queue

1. First wave, parallel: STAB-001 packaged exit and STAB-002 entry-by-entry
   document opening, both on the exact artifact with unique profiles.
2. STAB-004 reorder-versus-Split follows immediately and may diagnose in parallel
   because it has an independent gesture boundary.
3. Close the incorrect test chain in STAB-P001 immediately: File > Move To is a
   filesystem move, not window Move; use tab-context Move or out-of-window drag.
4. STAB-R001 remains `Manual-retest`.
5. Accept and normalize further user reports.

STAB-003 is collected with every failing run; it is not an independent repair lead
or a guessed root cause.

For every P0/P1, `diagnosing-bugs` requires the same artifact, a unique profile,
the accurate entry method, timestamp, PID/window/logical-tab state, and one
red-capable command that has actually run. No repair begins without that red
light; current candidate entries that say "unavailable" have not met this gate.
Assign one diagnosing task per defect; keep any repair for that defect in the same
task worktree; use an independent reviewer for review.
