# 07: Create the confirmed-defect implementation ticket map

**What to build:** Convert the approved remediation specification into a dependency-aware local implementation map in which every confirmed defect can be repaired, tested, independently reviewed where required and accepted without reopening audit decisions.

**Blocked by:** 06: Consolidate triage and publish the remediation specification.

**Status:** ready-for-agent

- [ ] The approved remediation specification is processed through `to-tickets` rather than manually collapsing all defects into one task.
- [ ] Each independent confirmed defect receives one tracer-bullet implementation ticket; symptoms merge only under the proven same-root-cause rule.
- [ ] No inconclusive, expected, environment-only, automation/capture or unresolved product-decision candidate receives an implementation ticket.
- [ ] Each ticket contains its evidence link, severity, reproduction rate, behavior contract, exclusions, red regression, commands, acceptance checks, review requirement and local-commit requirement.
- [ ] Blocking edges reflect genuine code or state dependencies, and tickets are ordered by P0, P1, P2 and P3 before impact and reproduction stability.
- [ ] P0/P1, persistence, serialization, file-sync, shared editor-state, IPC and window-lifecycle repairs explicitly require ticket-level independent review.
- [ ] The map includes final batch Standards + Spec review and complete acceptance gates after all implementation tickets.
- [ ] If the remediation specification contains zero confirmed defects, publish an explicit no-implementation closure rather than empty or speculative fix tickets.
- [ ] All ticket files and map changes are committed locally and are not pushed to GitHub.
