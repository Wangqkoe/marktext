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

The sole current frontier is **Ticket 03**. Ticket 04 is blocked by Ticket 03, and Ticket 05 is blocked by Ticket 04. Tickets 06 and 07 retain their emergency-stop publications as historical snapshots only; they must be re-executed after Tickets 03–05 provide new audit evidence. The resulting remediation specification and ticket map must then be regenerated before any final Standards + Spec review or final batch acceptance begins.

Tickets 01, 02, and 02A remain resolved historical work. The P0 external-overwrite repair `26b09ea6` and its queued/concurrent watcher review remediation `6e4b113c` remain implemented and independently accepted locally; resumed audit work does not reopen either acceptance boundary. The confirmed find-navigation P2 remains deferred by user policy. The previously published remediation specification, remediation execution map, and their final-review/acceptance tickets are paused and superseded as current handoff artifacts; they are not current frontiers and must not be executed.

## Repository constraint

Keep every artifact, test, fix, review change and commit local. Never push to GitHub.
