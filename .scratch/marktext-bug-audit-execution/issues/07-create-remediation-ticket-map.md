# 07: Create the confirmed-defect implementation ticket map

**What to build:** Convert the current approved remediation specification into the dependency-aware local tracker that preserves the zero-authorized-repair queue and publishes its two mandatory closure gates without reopening accepted work or authorizing deferred P2 repairs.

**Blocked by:** the re-executed 06: Consolidate triage and publish the remediation specification, after Tickets 03–05.

**Status:** resolved.

**Resolution:** Re-published the local one-file-per-ticket remediation tracker from resolved Ticket 06 and the current remediation specification. The unique current map is [`../../marktext-bug-remediation-execution/map.md`](../../marktext-bug-remediation-execution/map.md): it reports 5 confirmed / 2 repaired+ticket-level accepted / 3 P2 deferred / 0 open-authorized repairs / 0 product implementation tickets, and contains exactly two mandatory closure gates. The former emergency-stop map is historical only in Git history and documentation; it is not a current queue or authorization.

## Historical completion snapshot

The checked items below accurately record the earlier emergency-stop map publication. They are not current acceptance of this ticket and must be reassessed when this ticket is re-executed.

- [x] The approved remediation specification is processed through `to-tickets` rather than manually collapsing all defects into one task.
- [x] Each independent confirmed defect receives one tracer-bullet implementation ticket; symptoms merge only under the proven same-root-cause rule.
- [x] No inconclusive, expected, environment-only, automation/capture or unresolved product-decision candidate receives an implementation ticket.
- [x] Each ticket contains its evidence link, severity, reproduction rate, behavior contract, exclusions, red regression, commands, acceptance checks, review requirement and local-commit requirement.
- [x] Blocking edges reflect genuine code or state dependencies, and tickets are ordered by P0, P1, P2 and P3 before impact and reproduction stability.
- [x] P0/P1, persistence, serialization, file-sync, shared editor-state, IPC and window-lifecycle repairs explicitly require ticket-level independent review.
- [x] The map includes final batch Standards + Spec review and complete acceptance gates for every completed batch, including a batch with zero current implementation tickets.
- [x] If the remediation specification contains zero confirmed defects, publish an explicit no-implementation closure rather than empty or speculative fix tickets.
- [x] All ticket files and map changes are committed locally and are not pushed to GitHub.

## Historical resolution

The former emergency-stop map, with two proposed final gates, remains traceable only through Git history and the remediation specification. It intentionally created no product implementation ticket. The P0 implementation `26b09ea6` and its required queued/concurrent watcher review remediation `6e4b113c` remain accepted through Ticket 02A and must not be duplicated. Find-navigation P2 remains deferred by user policy; W1 automation/inconclusive evidence and baselines remain non-ticketed.

## Current publication

The current tracker contains **zero product implementation tickets** and exactly two `ready-for-agent` mandatory closure gates: [Ticket 01: Final Standards + Spec Review](../../marktext-bug-remediation-execution/issues/01-final-standards-and-spec-review.md), blocked by none, then [Ticket 02: Final Batch Acceptance/Closure](../../marktext-bug-remediation-execution/issues/02-final-batch-acceptance-and-closure.md), blocked by Ticket 01. Ticket 01 is the current remediation frontier. Both tickets cover the complete frozen matrix, accepted watcher-repair history, deferred dispositions, repository/spec boundaries, and unavailable or untested limits; neither authorizes a deferred P2 repair.

Ticket 07 does not execute either closure gate. It publishes their dependency-aware map only.
