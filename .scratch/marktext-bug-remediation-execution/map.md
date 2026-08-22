# MarkText first-batch bug-remediation execution

Label: `provisional`
Status: `paused` (`superseded-by-resumed-audit`)

> Historical emergency-stop snapshot. The user resumed the audit at Ticket 03. This map and its Tickets 01–02 have no current authorization and must not be executed; regenerate them only after Tickets 03–05 complete and Ticket 06 publishes a new specification.

## Source and scope

This map is the historical Ticket 07 publication from the now-superseded [remediation specification](../marktext-bug-remediation/spec.md), with the supporting [Ticket 02 audit record](../marktext-bug-audit-execution/issues/02-audit-document-integrity-and-external-changes.md) and [Ticket 02A independent review record](../marktext-bug-audit-execution/issues/02a-review-p0-autosave-external-change-repair.md).

At its publication there were **zero open, authorized product repairs** in this map. This is not a claim that discovery found zero confirmed defects: it means every confirmed defect eligible for the emergency batch was already repaired and accepted, while the separately confirmed find-navigation P2 was deliberately deferred. It no longer defines the current repair queue or final gates.

## Disposition and non-ticketed work

- `W3-AUTOSAVE-EXTERNAL-OVERWRITE` (P0) was repaired in local commit `26b09ea6` and accepted through the Ticket 02/02A persistence and file-sync review history. It must not be copied, reopened, or made into a new implementation ticket.
- `W3-QUEUED-OWN-SAVE-EVENT-ORDER` (P2, high-risk persistence correctness), including the concurrent-event race found during review, was repaired in local commit `6e4b113c` and accepted by Ticket 02A's ticket-level independent re-review. That is not a completed batch Final Review. It remains part of the same completed watcher acceptance boundary, not a new ticket.
- `FULL-E2E-FIND-NAVIGATION-INTERMITTENT` (P2) is confirmed but deferred by the user's non-serious-work policy. It creates no current implementation ticket and must not be combined with watcher work; the evidence establishes no shared root cause or regression seam.
- `W1-SYNTHETIC-KEYBOARD-INPUT-INTERMITTENT` is automation/inconclusive, and the word-count and Preferences-switch observations are baselines. None authorizes product remediation.
- Tickets 03–05 scope, unrun Windows boundaries, other platforms, and Pandoc are untested or unavailable. They are neither passing evidence nor remediation candidates.

The specification's rule that each independently confirmed defect receives an implementation ticket is satisfied here by the existing completed implementation-and-review history for the two repaired watcher defects. Creating duplicate tickets after `26b09ea6` and `6e4b113c` would misrepresent their resolved status and reopen accepted work. The only otherwise confirmed product defect is explicitly deferred, so it is not currently authorized for implementation.

## Tickets

1. [Final Standards + Spec review](issues/01-final-standards-and-spec-review.md)
2. [Final batch acceptance and closure](issues/02-final-batch-acceptance-and-closure.md)

## Current frontier

None in this paused map. The sole current frontier is audit Ticket 03. Ticket 04 is blocked by Ticket 03, Ticket 05 is blocked by Ticket 04, and Tickets 06–07 must be re-executed from their new evidence before a new remediation map can create final-review or acceptance gates. Do not execute remediation Tickets 01 or 02 from this historical map.

## Repository constraint

Keep every artifact, review, acceptance record, and commit local. Never push to GitHub.
