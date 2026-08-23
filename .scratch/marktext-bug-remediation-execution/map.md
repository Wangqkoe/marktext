# MarkText first-batch bug-remediation execution

Label: `ready-for-agent`
Status: `ready-for-agent`

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

**Current frontier: Ticket 01 — Final Standards + Spec Review.** It is ready for an independent reviewer because it is blocked by none. Ticket 02 is ready-for-agent but cannot begin until Ticket 01 has independently found no unresolved serious Standards or Spec issue. No other work is authorized by this map.

## Repository constraint

Keep every review artifact, acceptance record, and commit local. Never push to GitHub.
