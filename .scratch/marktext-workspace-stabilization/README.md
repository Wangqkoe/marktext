# MarkText Workspace stabilization contract

## Current round status — 2026-08-31

Automated implementation and package evidence is complete; final user Acceptance
is intentionally still open. See the [final workspace evidence](../marktext-feature-development-2026-08/handoff/evidence/final-workspace-evidence-2026-08-31.md).
Physical Windows right-tab split drag and drag-out-of-window Move must still be
performed by a user on the exact package. They are manual boundaries, not
blockers; the 63 scoped-lint warnings and absent `CONTEXT.md` are record items.

## Scope and decision

The frozen stabilization baseline is `fdda9330780edd11a79b84c6467eaed1cf1df61a`
(`fdda9330`). The local integration branch is
`codex/marktext-feature-development-2026-08`; the ledger task branch is
`codex/marktext-workspace-stabilization-ledger`. The target artifact is the
Windows unpacked package recorded in the [STAB-001 entry](defects/index.md).

This is **not** a release candidate. Stop "preparing to finish": T12, final
Review/Acceptance, and release judgement are paused. No new feature work,
opportunistic refactoring, or changes to resolved Issues are in scope.

The user supplies actual observed behavior. The coordinating task deduplicates,
sets severity, and creates owner tickets. A diagnosing task first makes a
red-capable reproduction; implementation is test-first; independent Review and
a black-box manual replay are separate gates. A Review pass never closes a
manual defect.

## Severity and workflow

| Severity | Meaning | Blocking rule |
| --- | --- | --- |
| P0 | Data loss, security issue, crash loop, or app unusable on a critical path | Blocks all release/final gates; reproduce before repair. |
| P1 | A core supported workflow is unavailable or unsafe | Blocks final gate; reproduce before repair. |
| P2 | Material but non-core defect with a viable workaround | Track and disposition before release judgement. |
| P3 | Minor or cosmetic defect | Track; does not by itself block stabilization. |

A `P0 candidate` or `P1 candidate` counts as its stated P0/P1 blocking item
until evidence downgrades it to P2, P3, or non-defect, or the defect is truly
`Closed`. `Deferred` does not remove that block unless the same decision records
an evidence-supported severity downgrade; it remains available for already
downgraded minor items. A `pending` log record does not count as P0/P1 unless it
is linked to a user-visible defect and classified. `Resolved in code` is not a
severity: an unmet `Manual-retest` continues to block through the manual gate.

Allowed states are `New`, `Triaged`, `Reproducing`, `Red-capable`, `Fixing`,
`Review`, `Integrated`, `Manual-retest`, `Closed`, and `Deferred`.

Stabilization completes only when P0/P1 are zero, every severe defect has a
regression, the same traceable artifact passes the complete manual matrix, and
one consecutive matrix round produces no new severe defect.

## Operating rules

Use the single [defect ledger](defects/index.md), then the
[triage queue](triage-queue.md), [manual regression matrix](manual-regression-matrix.md),
and [intake guide](intake.md). A failed manual run may clean up only that run's
exact executable process tree; cleanup is not normal-exit evidence.
