# 07: Create the confirmed-defect implementation ticket map

**What to build:** Convert the current approved remediation specification into a dependency-aware local implementation map in which every confirmed defect can be repaired, tested, independently reviewed where required and accepted without reopening resolved work.

**Blocked by:** the re-executed 06: Consolidate triage and publish the remediation specification, after Tickets 03–05.

**Historical lifecycle:** `resolved` for the emergency-stop map publication only.

**Current lifecycle:** `ready-for-agent`, unblocked by resolved Ticket 06. Execute this ticket only from the regenerated remediation specification; do not use the historical provisional specification or its map as current inputs.

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

The [remediation execution map](../../marktext-bug-remediation-execution/map.md) was published with two proposed final gates: Ticket 01, then Ticket 02. It intentionally created no product implementation ticket. The P0 implementation `26b09ea6` and its required queued/concurrent watcher review remediation `6e4b113c` remain accepted through Ticket 02A and must not be duplicated. Find-navigation P2 remains deferred by user policy; W1 automation/inconclusive evidence and baselines remain non-ticketed.

## Resumption instruction

The former map is paused and `superseded-by-resumed-audit`. Recreate a new dependency map from the resolved Ticket 06 specification with **zero product implementation tickets** and exactly two mandatory closure gates: first an independent Final Standards + Spec Review, then a Final Batch Acceptance/Closure ticket blocked by that review. Both gates cover the complete frozen matrix, accepted watcher-repair history, deferred dispositions, and all stated limits; neither authorizes a deferred P2 repair. Do not execute the historical remediation Tickets 01 or 02.
