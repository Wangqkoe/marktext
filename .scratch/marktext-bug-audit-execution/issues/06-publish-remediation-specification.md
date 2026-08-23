# 06: Consolidate triage and publish the remediation specification

**What to build:** After the frozen audit matrix has either completed or reached a valid current stop condition, turn its evidence into one evidence-backed remediation specification that identifies exactly which defects warrant repair, why they are prioritized and which observations must not become product changes.

**Blocked by:** 03: Audit tabs, unsaved documents and restart recovery; 04: Audit large documents and Windows boundary configurations; 05: Audit real Windows integration boundaries.

**Status:** resolved

**Current lifecycle:** `resolved`. Tickets 01–05 completed the frozen matrix; Ticket 06 republished the sole current remediation handoff at [`../../marktext-bug-remediation/spec.md`](../../marktext-bug-remediation/spec.md). Ticket 07 is now the sole audit-execution frontier. This resolution does not execute or pre-authorize Ticket 07 product work.

## Historical lifecycle

The earlier emergency-stop publication remains historically traceable but is superseded as a current handoff. It correctly recorded the P0 interruption before Tickets 03–05 ran; those acceptance claims were reassessed from the complete matrix rather than carried forward as current status.

## Rechecked acceptance

- [x] The audit stop condition is the **complete frozen matrix**, with Ticket 05 integration evidence included in local commit `35e44c16`.
- [x] Every observed candidate has one disposition and rationale in the current specification; no candidate disappears silently.
- [x] Deterministic findings satisfy 2/2, the intermittent finding satisfies the bounded independent-failure threshold, and manual Windows findings retain bounded checklists plus persistent evidence.
- [x] Baselines, duplicate/harness findings, performance observations, environment/capture limits, unavailable scope and automation/inconclusive evidence are separated from product defects.
- [x] All five confirmed defects have complete evidence packages and severity/impact rationale.
- [x] Ordering is severity, impact breadth, then stability; accepted P0/P2 watcher history is preserved without reopening it.
- [x] The P0 `26b09ea6` and Ticket 02A watcher follow-up `6e4b113c` remain repaired and ticket-level accepted, not new remediation work.
- [x] The find-navigation, bitmap-paste persistence, and missing-Pandoc localization P2s are explicitly deferred by user policy; none is promoted to an authorized repair.
- [x] The specification reports five confirmed, two repaired/accepted, three deferred, and zero open/authorized repairs; it does not falsely claim zero confirmed defects.
- [x] Test-first, independent-review, acceptance, atomic-local-commit and no-push constraints are retained without guessing implementation details or merging unproven roots.
- [x] Pandoc conversion, other platforms, and unrun configurations are accurately bounded as unavailable or untested.
- [x] The current specification is `ready-for-agent` Ticket 07 input, while the old remediation execution map remains paused/superseded until Ticket 07 regenerates it.
- [x] Zero authorized product repairs is distinguished from zero closure gates: Ticket 07 must create an independent Final Standards + Spec Review followed by Final Batch Acceptance/Closure for the complete frozen batch, without authorizing any deferred P2 repair.

## Resolution

Ticket 06 is resolved from the complete frozen matrix. It publishes no current product repair authorization because the only unrepaired confirmed findings are deferred P2s. Ticket 07 is unblocked to regenerate the dependency-aware remediation map from the new specification with **zero implementation tickets and two mandatory closure gates**: independent Final Standards + Spec Review, then Final Batch Acceptance/Closure. It must preserve the explicit zero-authorized-repair queue and must not execute the historical paused map.
