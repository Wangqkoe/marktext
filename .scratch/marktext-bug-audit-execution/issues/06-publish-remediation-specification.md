# 06: Consolidate triage and publish the remediation specification

**What to build:** Turn the completed or deliberately stopped audit into one evidence-backed remediation specification that identifies exactly which defects warrant repair, why they are prioritized and which observations must not become product changes.

**Blocked by:** 02: Audit document integrity and external file changes; 03: Audit tabs, unsaved documents and restart recovery; 04: Audit large documents and Windows boundary configurations; 05: Audit real Windows integration boundaries. A documented P0/five-confirmed-defect early-stop condition may satisfy the unfinished exploration blockers.

**Status:** resolved

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

## Resolution

The emergency P0 interruption is the completed audit stop condition. The independent, ready-for-agent remediation handoff is published at [`../../marktext-bug-remediation/spec.md`](../../marktext-bug-remediation/spec.md). It records every observed candidate with one disposition, keeps the P0 repair `26b09ea6` and its accepted queued/concurrent watcher follow-up `6e4b113c` as repaired, defers the confirmed intermittent find-navigation P2 by user policy, and explicitly marks Ticket 03–05 scope untested or unavailable. Ticket 07 is now unblocked to consume this handoff; it is not started by this ticket.
