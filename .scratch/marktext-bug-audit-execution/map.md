# MarkText first-batch bug audit execution

Label: `ready-for-agent`
Status: `ready-for-agent`

## Source

Execute the approved [MarkText first-batch bug audit and remediation handoff specification](../marktext-bug-audit/spec.md). These tickets collect and classify evidence; they do not assume that any unobserved product defect exists.

## Tickets

1. [Establish audit fixtures, evidence records and regression baselines](issues/01-establish-audit-fixtures-and-baselines.md)
2. [Audit document integrity and external file changes](issues/02-audit-document-integrity-and-external-changes.md)
   - [02A: Independently review and accept the emergency auto-save/external-change repair](issues/02a-review-p0-autosave-external-change-repair.md)
3. [Audit tabs, unsaved documents and restart recovery](issues/03-audit-tabs-and-restart-recovery.md)
4. [Audit large documents and Windows boundary configurations](issues/04-audit-large-documents-and-windows-boundaries.md)
5. [Audit real Windows integration boundaries](issues/05-audit-real-windows-integrations.md)
6. [Consolidate triage and publish the remediation specification](issues/06-publish-remediation-specification.md)
7. [Create the confirmed-defect implementation ticket map](issues/07-create-remediation-ticket-map.md)

## Frontier

Tickets 01, 02, 02A and 06 are resolved. Ticket 02 confirmed a P0 data-loss race and stopped discovery; Tickets 03–05 remain unexecuted under the approved early-stop rule. Emergency repair `26b09ea6` plus queued/concurrent watcher review remediation `6e4b113c` are implemented and independently accepted locally. Ticket 06 published the [`ready-for-agent remediation specification`](../marktext-bug-remediation/spec.md), which records all candidates and the untested/unavailable boundaries without overclaiming coverage. Ticket 07 is the current, unblocked frontier and has not been started. The unrelated intermittent find-navigation P2 remains deferred by user policy; the W1 synthetic-input observation and low-impact review hardening items remain recorded for later work and are not part of further emergency repair.

## Repository constraint

Keep every artifact, test, fix, review change and commit local. Never push to GitHub.
