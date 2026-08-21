# Define the remediation handoff

Type: `grilling`
Status: `resolved`
Blocked by: 03

## Question

How should confirmed findings be grouped into a specification and implementation tickets, and which regression, review, acceptance and local-commit gates must each fix satisfy?

## Comments

- Prefer one independently reviewable defect per implementation ticket unless multiple symptoms share one proven root cause.
- Require regression coverage before a fix when the real failure seam is testable.
- Record unavailable platform checks rather than treating them as passing.
- Keep commits local and do not push to GitHub.

## Resolution

### Specification and ticket boundaries

- Transition from audit to remediation when five defects are confirmed or the frozen matrix is exhausted, whichever happens first. If the completed matrix yields fewer than five, proceed with the confirmed set rather than expanding scope to fill a quota.
- A P0 interrupts exploration and receives an immediate minimal emergency specification and implementation ticket. After its resolution, explicitly decide whether to resume the remaining audit.
- Produce two handoff layers:
  1. a batch `spec.md` containing confirmed findings, priorities, shared constraints, the acceptance matrix and dispositions for excluded candidates;
  2. an implementation map produced through `to-tickets`, with one ticket per independent confirmed defect and explicit dependency ordering.
- Default to one defect per ticket. Merge symptoms only after evidence proves they share one root cause, one required change and one regression-test seam.
- If implementation reveals an adjacent defect, include it only when the same-root-cause rule is satisfied. Otherwise return it to the candidate pool for normal triage. A newly discovered P0 interrupts the current plan.

### Required ticket contract

Every implementation ticket must contain:

- defect ID, severity and a link to its evidence package;
- exact reproduction steps and measured failure rate;
- expected and actual results;
- established failure boundary and explicit exclusions;
- the regression test to establish before the fix and its command;
- likely code entry points without forcing an unverified implementation;
- acceptance criteria, adjacent regression tests and manual checks;
- independent-review requirements;
- final local commits and verification results.

### Test-first and per-ticket verification

- Before changing product code, create the smallest trustworthy regression test and verify that it fails because of the recorded symptom.
- For an OS-only boundary that cannot be reliably automated end to end, preserve the 2/2 manual evidence and create a failing test at the nearest trustworthy code seam.
- Every completed ticket runs its new regression, directly related test groups and affected-package type checking.
- P0/P1 tickets and changes involving document persistence, serialization, file synchronization, shared editor state, IPC or window lifecycle also run the complete unit and Electron E2E suites before leaving ticket acceptance.
- Run lint and the unpacked production build at batch acceptance unless a ticket-specific risk requires them earlier.

### Independent review gates

Implementation self-review is not the only review for:

- every P0 or P1 repair;
- file writing, serialization, recovery, auto-save or external-file synchronization;
- shared editor state, IPC, window lifecycle or cross-component interface changes;
- the complete remediation batch before final acceptance.

High-risk tickets receive their own independent review. Localized P2/P3 tickets may rely on implementation review until the batch gate, but cannot become resolved before the independent batch Standards + Spec review. Fix every blocking review finding in a follow-up local commit and rerun the affected verification.

### Implementation order and lifecycle

Order tickets by P0, P1, P2 and P3, then by impact breadth and reproduction stability. Implement one ticket at a time by default. Parallel work is allowed only for tickets with no overlapping modules or state dependencies.

Use this lifecycle:

`ready-for-agent → in-progress → implemented-awaiting-review → review-remediation (when needed) → acceptance → resolved`

Unavailable platforms or optional dependencies remain explicitly `untested` or `unavailable`; they are never treated as passing.

### Commits and batch acceptance

- Keep at least one atomic local commit per ticket containing its regression coverage and repair.
- Put independent-review remediation in subsequent local commits and record all relevant commit IDs in the ticket.
- Never push any commit to GitHub.
- After all ticket reviews and remediation, require:
  - all new and adjacent regression tests;
  - the complete unit and Electron E2E suites;
  - type checking;
  - lint with zero errors and no new warnings;
  - an unpacked production build;
  - the frozen exploratory matrix and all affected real-Windows checks;
  - explicit records for unavailable platform/dependency checks;
  - an independent Standards + Spec review with no unresolved blockers.
