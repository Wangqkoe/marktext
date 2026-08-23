# MarkText first-batch bug-remediation execution

Label: `resolved`
Status: `batch resolved; Ticket 01 and Ticket 02 accepted; no current frontier`

> This is the unique current remediation execution map, republished by resolved audit Ticket 07 from the current [remediation specification](../marktext-bug-remediation/spec.md). The former emergency-stop map is historical only: it remains traceable in Git history and the current specification, but is not a current queue, frontier, or authorization.

## Current disposition and scope

- Confirmed product defects: **5**.
- Repaired and ticket-level accepted: **2** — `W3-AUTOSAVE-EXTERNAL-OVERWRITE` (`26b09ea6`) and `W3-QUEUED-OWN-SAVE-EVENT-ORDER` (`6e4b113c`). Neither may be reopened, duplicated, or turned into an implementation ticket.
- Confirmed P2 defects deferred by user policy: **3** — find-navigation intermittency, bitmap-paste persistence, and missing-Pandoc localization. None is authorized for repair, merging, or implementation.
- Open/authorized repairs: **0**.
- Product implementation tickets: **0**.

The two mandatory closure gates are complete: Ticket 01 independently accepted Standards and Spec, and Ticket 02's fresh final acceptance rerun is accepted. Open/authorized repairs remain **0**; the three P2 records remain deferred and require future separate authorization.

## Non-ticketed records

The frozen candidate register and evidence links remain in the [remediation specification](../marktext-bug-remediation/spec.md#frozen-evidence-and-disposition-register). The deferred P2s are records, not implementation tickets; any future authorization must first establish a trustworthy failing regression at the appropriate seam. Baselines, performance observations, harness/automation findings, capture limitations, unavailable Pandoc conversion, and untested platform or scaling boundaries also do not create implementation tickets.

## Tickets

1. [Final Standards + Spec Review](issues/01-final-standards-and-spec-review.md)
2. [Final Batch Acceptance/Closure](issues/02-final-batch-acceptance-and-closure.md)

## Frontier and dependency edges

**No current frontier — batch resolved.** Ticket 01's independent final review recorded **Standards: accepted** and **Spec: accepted** with no unresolved serious blocker. The source-mode repair retains its 29/30 pre-fix, 30/30 post-fix, and independent high-risk acceptance history; the task-list report remains a non-blocking historical observation (262/262 bounded Electron and 4/4 Muya controls). Ticket 02's [fresh final acceptance rerun](evidence/02-final-batch-acceptance-rerun.md) at `95c464f4` passed all mandatory gates, including 261 passed/4 skipped full E2E, with no serious blocker. The three deferred P2 records stay deferred; no repair is authorized.

## Repository constraint

Keep every review artifact, acceptance record, and commit local. Never push to GitHub.
