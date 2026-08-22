# 06: Consolidate triage and publish the remediation specification

**What to build:** After the frozen audit matrix has either completed or reached a valid current stop condition, turn its evidence into one evidence-backed remediation specification that identifies exactly which defects warrant repair, why they are prioritized and which observations must not become product changes.

**Blocked by:** 03: Audit tabs, unsaved documents and restart recovery; 04: Audit large documents and Windows boundary configurations; 05: Audit real Windows integration boundaries. The withdrawn P0 emergency pause does not satisfy these blockers.

**Historical lifecycle:** `resolved` for the emergency-stop publication only.

**Current lifecycle:** `ready-for-agent`, currently blocked by Tickets 03–05. Re-execute this ticket from the new complete audit evidence; do not treat the historical publication as the current remediation handoff.

## Historical completion snapshot

The checked items below accurately record the earlier emergency-stop publication. They are not current acceptance of this ticket and must be reassessed when this ticket is re-executed after Tickets 03–05.

- [x] The audit stop condition is explicit: five confirmed product defects, complete frozen matrix, or emergency P0 interruption.
- [x] Every observed candidate has one approved disposition and a rationale; no candidate disappears silently.
- [x] Confirmed deterministic findings meet 2/2, confirmed intermittent findings meet at least 2/10, and manual-only findings meet their approved evidence rule.
- [x] High-severity pending, inconclusive, expected, environment, automation/capture and product-decision findings are clearly separated from confirmed defects.
- [x] Each confirmed defect has the complete required evidence package and a P0–P3 severity justified by user impact.
- [x] Confirmed defects are ordered by severity, impact breadth and reproduction stability.
- [x] The remediation specification captures shared test-first, review, acceptance and local-commit constraints without forcing unverified implementation details.
- [x] Symptoms are proposed for merging only when a shared root cause, required change and regression seam have been proven.
- [x] Unavailable Windows boundaries, other platforms and optional dependencies are recorded as untested or unavailable rather than passing.
- [x] If no product defect is confirmed, the specification records that valid outcome and does not invent remediation work.
- [x] The specification is published locally with `ready-for-agent` status and is not pushed to GitHub.

## Historical resolution

The emergency P0 interruption produced the historical handoff at [`../../marktext-bug-remediation/spec.md`](../../marktext-bug-remediation/spec.md). It retains every then-observed candidate, keeps the P0 repair `26b09ea6` and its accepted queued/concurrent watcher follow-up `6e4b113c` as repaired, and defers the confirmed intermittent find-navigation P2 by user policy.

## Resumption instruction

The user withdrew the emergency pause as the batch's permanent early-stop choice. After Tickets 03–05 are resolved, publish a new remediation specification from the combined evidence and advance Ticket 07 from that regenerated specification. The historical file is provisional and `superseded-by-resumed-audit`; it is not a current Ticket 07 input.
