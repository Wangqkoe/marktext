# MarkText first-batch bug-remediation execution

Label: `blocked`
Status: `Ticket 01 resolved; Ticket 02 source-mode repair independently accepted but closure remains blocked`

> This is the unique current remediation execution map, republished by resolved audit Ticket 07 from the current [remediation specification](../marktext-bug-remediation/spec.md). The former emergency-stop map is historical only: it remains traceable in Git history and the current specification, but is not a current queue, frontier, or authorization.

## Current disposition and scope

- Confirmed product defects: **5**.
- Repaired and ticket-level accepted: **2** — `W3-AUTOSAVE-EXTERNAL-OVERWRITE` (`26b09ea6`) and `W3-QUEUED-OWN-SAVE-EVENT-ORDER` (`6e4b113c`). Neither may be reopened, duplicated, or turned into an implementation ticket.
- Confirmed P2 defects deferred by user policy: **3** — find-navigation intermittency, bitmap-paste persistence, and missing-Pandoc localization. None is authorized for repair, merging, or implementation.
- Open/authorized repairs: **0**.
- Product implementation tickets: **0**.

This batch still has exactly **two mandatory closure gates**. A zero-authorized-repair queue does not eliminate the independent final review or final acceptance required by the originating audit specification.

## Non-ticketed records

The frozen candidate register and evidence links remain in the [remediation specification](../marktext-bug-remediation/spec.md#frozen-evidence-and-disposition-register). The deferred P2s are records, not implementation tickets; any future authorization must first establish a trustworthy failing regression at the appropriate seam. Baselines, performance observations, harness/automation findings, capture limitations, unavailable Pandoc conversion, and untested platform or scaling boundaries also do not create implementation tickets.

## Tickets

1. [Final Standards + Spec Review](issues/01-final-standards-and-spec-review.md)
2. [Final Batch Acceptance/Closure](issues/02-final-batch-acceptance-and-closure.md)

## Frontier and dependency edges

**Current frontier: blocked at Ticket 02 — Final Batch Acceptance/Closure.** Ticket 01 is resolved: its independent final review recorded **Standards: accepted** and **Spec: accepted**, with no unresolved serious blocker (see [Ticket 01 evidence](evidence/01-final-standards-and-spec-review.md)). The independently authorized source-mode repair now flushes the active WYSIWYG editor at the shared entry to source mode; its [diagnosis and verification evidence](evidence/02-source-mode-entry-flush-diagnosis-and-repair.md) records a 29/30 pre-fix red loop, 30/30 post-fix loop, and a fresh full E2E result of 261 passed and 4 skipped. Its [independent high-risk review](evidence/02-source-mode-entry-flush-independent-high-risk-review.md) records **Standards: accepted** and **Spec: accepted** with no serious blocker. The full rerun's two task-list-autocheck cases passed, but its earlier failure remains separately pending explicit disposition and is not attributed to the source-mode repair. Ticket 02 must remain blocked until task-list disposition and final acceptance complete; the next frontier is independent task-list-autocheck characterization.

## Repository constraint

Keep every review artifact, acceptance record, and commit local. Never push to GitHub.
