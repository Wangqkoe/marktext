# 07: Create the confirmed-defect implementation ticket map

**What to build:** Convert the approved remediation specification into a dependency-aware local implementation map in which every confirmed defect can be repaired, tested, independently reviewed where required and accepted without reopening audit decisions.

**Blocked by:** 06: Consolidate triage and publish the remediation specification.

**Status:** resolved

- [x] The approved remediation specification is processed through `to-tickets` rather than manually collapsing all defects into one task.
- [x] Each independent confirmed defect receives one tracer-bullet implementation ticket; symptoms merge only under the proven same-root-cause rule.
- [x] No inconclusive, expected, environment-only, automation/capture or unresolved product-decision candidate receives an implementation ticket.
- [x] Each ticket contains its evidence link, severity, reproduction rate, behavior contract, exclusions, red regression, commands, acceptance checks, review requirement and local-commit requirement.
- [x] Blocking edges reflect genuine code or state dependencies, and tickets are ordered by P0, P1, P2 and P3 before impact and reproduction stability.
- [x] P0/P1, persistence, serialization, file-sync, shared editor-state, IPC and window-lifecycle repairs explicitly require ticket-level independent review.
- [x] The map includes final batch Standards + Spec review and complete acceptance gates after all implementation tickets.
- [x] If the remediation specification contains zero confirmed defects, publish an explicit no-implementation closure rather than empty or speculative fix tickets.
- [x] All ticket files and map changes are committed locally and are not pushed to GitHub.

## Resolution

The [remediation execution map](../../marktext-bug-remediation-execution/map.md) is published with two approved, dependency-ordered final gates: Ticket 01, then Ticket 02. It intentionally creates no current product implementation ticket. The specification's general one-ticket-per-confirmed-defect rule is satisfied by the already completed P0 implementation `26b09ea6` and its required queued/concurrent watcher review remediation `6e4b113c`, both accepted through Ticket 02A; duplicating those tickets would reopen resolved work without new evidence. The only other confirmed product candidate, find-navigation P2, is explicitly deferred by user policy. Thus the correct no-implementation condition is **zero open and authorized repairs**, not a false assertion that the audit found no confirmed defects. W1 automation/inconclusive evidence, baselines, and untested/unavailable scope remain non-ticketed.
