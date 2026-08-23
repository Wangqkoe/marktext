# MarkText first-batch bug-audit remediation specification

Label: `ready-for-agent`
Status: `ready-for-agent`

> This is the unique current, evidence-backed remediation handoff and required input to Ticket 07. It supersedes the prior emergency-stop publication, which remains traceable through Ticket 06 and Git history. It does not reopen accepted watcher work or authorize product work before Ticket 07 publishes the current map.

## Handoff basis and audit stop

Tickets 01–05 completed the approved frozen Windows audit matrix. Discovery stopped because the **complete frozen matrix** was exhausted, not because an emergency interruption remains active. The batch has five confirmed product defects: two repaired/accepted findings and three confirmed P2 findings deferred by the user's policy. No P0 or P1 repair is open.

The current baseline includes Ticket 05's integration evidence commit `35e44c16`. The P0 external-overwrite repair is local commit `26b09ea6`; the separately reviewed queued/concurrent watcher follow-up is local commit `6e4b113c`. Both are completed, independently accepted ticket-level work and must not be reopened or duplicated. Neither was pushed.

The required confirmation thresholds were met: deterministic defects were reproduced 2/2 from controlled fresh state, the find-navigation intermittent candidate produced three independent failures across six direction/run observations, and manual Windows findings include exact bounded checklists plus persistent application-state or disk evidence. Screenshots were supplementary only.

## Frozen evidence and disposition register

Every candidate below has exactly one disposition. Ordering is severity, user impact breadth, then stability; an already repaired item remains ahead of deferred P2s only to preserve safety history rather than create a queue.

| Candidate | Severity | Stability | Disposition | Evidence and required action |
| --- | --- | --- | --- | --- |
| `W3-AUTOSAVE-EXTERNAL-OVERWRITE` | P0 | deterministic 2/2 before repair; 0/2 after | **confirmed/repaired/accepted** | An external write immediately after auto-save was silently lost on the next auto-save. Disk-outcome evidence is in [Ticket 02 evidence](../marktext-bug-audit-execution/evidence/02-p0-autosave-external-overwrite.md). Repaired in `26b09ea6`; do not create another ticket. |
| `W3-QUEUED-OWN-SAVE-EVENT-ORDER` | P2, high-risk persistence correctness | deterministic unit and Electron 2/2; concurrent seam deterministic | **confirmed/repaired/accepted** | Review found queued-order and concurrent-event defects in the P0 repair. `6e4b113c` repaired them; watcher target passed 5/5, P0 plus queued regressions 8/8 across four workers, and Ticket 02A independent re-review accepted it. See [candidate record](../marktext-bug-audit-execution/evidence/02-p2-queued-own-save-event-order.md). Do not reopen or duplicate it. |
| `FULL-E2E-FIND-NAVIGATION-INTERMITTENT` | P2 | 3 independent failures / 6 observations | **confirmed/deferred** | The visible find counter intermittently did not advance under timing/load. No corruption, crash, watcher overlap, shared root cause, or reliable manual reproduction was demonstrated. See [candidate record](../marktext-bug-audit-execution/evidence/02-p2-find-navigation-intermittent.md). Record for later; no current repair authorization. |
| `05-P2-bitmap-paste-persistence` | P2 | deterministic manual 2/2 | **confirmed/deferred** | With configured `folder` + relative `assets` policy, bitmap paste emitted a `data:image/png` URI and wrote no asset. Disk/profile/reference evidence is in [candidate record](../marktext-bug-audit-execution/evidence/05-p2-bitmap-paste-persistence.md). Record for later; no current repair authorization. |
| `05-P2-missing-pandoc-localization` | P2 | deterministic manual 2/2 | **confirmed/deferred** | With Pandoc absent, Import remained safe but exposed raw `dialog.importWarning` and `dialog.installPandoc` keys. See [candidate record](../marktext-bug-audit-execution/evidence/05-p2-missing-pandoc-localization.md). Record for later; no current repair authorization. |
| `W1-SYNTHETIC-KEYBOARD-INPUT-INTERMITTENT` | none assigned | mixed related/isolated/full-suite results | **automation/inconclusive** | Synthetic typing/focus drift has no manual reproduction, product evidence, or relation to watcher work. See [record](../marktext-bug-audit-execution/evidence/02-automation-w1-keyboard-input-intermittent.md). Do not create product work. |
| Loaded-document word count (`d93c259d`) | baseline | controlled baseline passed | **baseline** | Ticket 01 verified the earlier repair; retain the regression only. |
| Unchecked Preferences switch contrast (`948eec8b`) | baseline | controlled baseline passed | **baseline** | Ticket 01 verified the earlier repair; retain the regression only. |
| `TICKET-01-LF-ONLY-DISPOSITION-NEGATIVE-MUTATION` | P3 harness maintenance | deterministic 2/2 | **duplicate/baseline regression** | CRLF-sensitive negative-test mutation is the documented Ticket 01 portability limitation, not a MarkText runtime defect. See [record](../marktext-bug-audit-execution/evidence/03-duplicate-lf-only-disposition-test.md). |
| F4 source-mode cost | performance observation | bounded E1 control 2/2 | **non-defect observation** | F4 source round trip was about 6.5–6.9 s versus 0.1 s for F2, but remained below the declared 10 s bound without error or blocked workflow. See [Ticket 04 results](../marktext-bug-audit-execution/evidence/04-w4-w5-results.md). |
| M1, M2, M3 drag/drop, M4 | normal controls | bounded Windows checks | **no product candidate** | The completed real-Windows checks passed; the initial invalid drag landing was an operation control, not a defect. See [Ticket 05 results](../marktext-bug-audit-execution/evidence/05-real-windows-integration-results.md). |
| Earlier Ticket 05 capture/input blocks | environment/capture limitation | superseded by user-operated rerun | **environment/automation limitation** | Earlier Computer Use delivery and screenshot conflicts are retained historically, were not used as product conclusions, and do not negate final manual evidence. |

There are no expected-behavior, unresolved product-decision, environment-only product candidates, or high-severity-pending candidates in the completed matrix. The deferred Ticket 01 review-hardening notes are harness/documentation/naming maintenance, not product candidates.

## Current authorization and priority

User policy is: record and defer non-serious problems; repair serious ones. Under the accepted severity model, only P0/P1 findings enter the default repair queue. P2/P3 work requires separate user authorization.

Accordingly, the current counts are:

- Confirmed product defects: **5**.
- Repaired and ticket-level accepted: **2** (`26b09ea6`, `6e4b113c`).
- Deferred confirmed defects: **3** (find navigation, bitmap paste persistence, missing-Pandoc localization).
- Open/authorized repairs: **0**.

This is accurately described as **zero open/authorized repairs**, not as zero confirmed defects. The three P2s must not be promoted, merged, or implemented by default. They have neither a proven shared root cause nor a shared required change/regression seam.

## Scope limits and unavailable evidence

- Pandoc conversion is **unavailable** by design: Pandoc was absent and was not installed. Its missing-dependency path was tested; no conversion pass is claimed.
- macOS, Linux, native display scaling, and any unrun configuration are **untested**. Windows/Electron evidence does not establish them.
- Earlier Windows input/capture limitations remain historical environmental observations only. The final controlled manual M1–M5 evidence used user-operated controls and disk/profile state as the primary oracle.
- No product-code, test, or implementation authorization follows from a performance observation, harness duplicate, baseline, unavailable dependency, or automation/capture limitation.

## Ticket 07 publication contract

Ticket 07 is unlocked solely to regenerate the remediation execution map from this specification. It must:

1. Publish an explicit **no-current-product-implementation** queue: no P0/P1 repair is open, the two repaired watcher items are historical accepted work, and all three confirmed P2s are deferred without user authorization.
2. Preserve each deferred P2 as a non-ticketed record with its evidence link and the rule that future work first establishes a trustworthy failing regression at the appropriate seam.
3. Keep the prior remediation execution map paused and `superseded-by-resumed-audit`; it is not a source of current final-review or acceptance authorization.
4. Create final Standards + Spec review and batch-acceptance gates only when a future authorized remediation batch actually contains work requiring them. Do not manufacture closure work from the deferred-only queue.

## Test-first, review, and acceptance contract for future authorization

For any independently authorized future repair, first add the smallest trustworthy regression and show it fails for the recorded symptom. Test desktop-visible behavior at Electron E2E where reliable; use a focused unit seam for precise persistence, serialization, watcher, state, formatting, notification, or i18n contracts. A real-Windows-only issue also needs its exact 2/2 manual checklist and an automated test at the nearest reliable seam.

Each ticket must run its new regression, directly related tests, and affected-package type checking. P0/P1 work and persistence, serialization, file-sync, shared-editor-state, IPC, or window-lifecycle changes require independent ticket-level review plus full unit and Electron E2E suites at acceptance. Batch acceptance requires the documented full checks, frozen matrix/affected Windows procedures, and independent Standards + Spec review. Keep one atomic local test-and-fix commit per repair and local follow-up review-remediation commits; never push.

## Historical traceability

The prior `provisional` / `superseded-by-resumed-audit` emergency-stop specification correctly described the incomplete post-Ticket-02 state. It is superseded as a current handoff by this complete-matrix publication, while its P0/02A evidence and accepted commits remain authoritative historical records. Ticket 06, its audit evidence, and Git history retain that trace; Ticket 07 must use this document instead.
