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

Tickets 01–06 are resolved. Tickets 03–05 supplied the completed W2, W4/W5, and M1–M5 frozen-matrix evidence; Ticket 06 consolidated it into the sole current [remediation specification](../marktext-bug-remediation/spec.md). The sole current frontier is **Ticket 07**. It is unlocked to regenerate a dependency-aware remediation execution map from that specification. The map must state the evidence-backed zero-open/authorized-repair outcome and preserve the three confirmed P2s as deferred; it must not reopen the accepted watcher repairs or execute the historical paused map.

Tickets 01, 02, and 02A remain resolved historical work. The P0 external-overwrite repair `26b09ea6` and its queued/concurrent watcher review remediation `6e4b113c` remain implemented and independently accepted locally; resumed audit work does not reopen either acceptance boundary. The confirmed find-navigation, bitmap-paste persistence, and missing-Pandoc localization P2s are deferred by user policy. The old remediation execution map and its final-review/acceptance tickets remain paused and `superseded-by-resumed-audit`; Ticket 07 must regenerate them before any future authorized work.

## Repository constraint

Keep every artifact, test, fix, review change and commit local. Never push to GitHub.
