# Stabilization triage queue

1. STAB-001: create the minimal fixing ticket from the red-capable packaged loop.
2. STAB-002: wait for a manual/native-entry red or controllable dialog acceptance;
   do not open a fixing ticket from the current green probe.
3. STAB-004: begin its independent packaged diagnosis now.
4. Close the incorrect test chain in STAB-P001 immediately: File > Move To is a
   filesystem move, not window Move; use tab-context Move or out-of-window drag.
5. STAB-R001 remains `Manual-retest` for Move-specific source replacement; it is
   separate from ordinary close-tab/exit behavior and is neither closed nor
   duplicated.
6. Accept and normalize further user reports.

STAB-003 is collected with every failing run; it is not an independent repair lead
or a guessed root cause.

For every P0/P1, `diagnosing-bugs` requires the same artifact, a unique profile,
the accurate entry method, timestamp, PID/window/logical-tab state, and one
red-capable command that has actually run. No repair begins without that red
light; current candidate entries that say "unavailable" have not met this gate.
Assign one diagnosing task per defect; keep any repair for that defect in the same
task worktree; use an independent reviewer for review.
