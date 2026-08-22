# MarkText first-batch bug-audit remediation specification

Label: `ready-for-agent`
Status: `ready-for-agent`

## Handoff basis and stop condition

This is the remediation handoff for the approved first-batch Windows bug audit. Discovery did **not** exhaust the frozen matrix and did not reach five confirmed defects: Ticket 02 confirmed the deterministic P0 `W3-AUTOSAVE-EXTERNAL-OVERWRITE` and the approved emergency-stop rule halted the audit immediately. Tickets 03, 04, and 05 were consequently not executed. Their workflows, Windows boundaries, other platforms, and optional-dependency coverage are not evidence of a pass.

The P0's emergency repair is local commit `26b09ea6`. Independent Ticket 02A review then found the distinct queued-event-order and concurrent-event race in that repair; its follow-up is local commit `6e4b113c` and was accepted by the final independent Standards + Spec re-review. Neither commit was pushed.

This specification is a triage and acceptance handoff only. It does not authorize speculative product changes, restart the frozen audit matrix, or reopen the completed shell work.

## Evidence and disposition register

Each observed candidate has exactly one disposition below. A disposition is an outcome for this handoff, not a claim that unexecuted work passed.

| Candidate | Severity | Disposition | Evidence and rationale | Required action |
| --- | --- | --- | --- | --- |
| `W3-AUTOSAVE-EXTERNAL-OVERWRITE` | P0 | **confirmed/repaired** | Before repair, the minimized Electron disk-outcome regression failed deterministically 2/2: an external write immediately after auto-save was suppressed as MarkText's own event and disappeared after the next auto-save. The primary evidence is the final disk content, which lacked the external marker. `26b09ea6` makes own-save suppression contingent on the exact saved bytes; its post-repair regression passed 2/2. | No new implementation ticket. Preserve the P0 regression and require its existing persistence/file-sync review and acceptance history when adjacent watcher work changes. |
| `W3-QUEUED-OWN-SAVE-EVENT-ORDER` | P2, high-risk persistence correctness | **confirmed/repaired** | Ticket 02A's minimized queue regression and Electron scenario failed deterministically before remediation; concurrent checks also returned `[true, false]` instead of `[true, true]`. `6e4b113c` scans eligible records correctly and serializes checks per window/path. Watcher tests passed 5/5, original plus queued-save regressions passed 8/8 under four workers, and final independent re-review accepted it. | No new implementation ticket. Keep it coupled to the P0 watcher acceptance boundary, not to find navigation or keyboard automation. |
| `FULL-E2E-FIND-NAVIGATION-INTERMITTENT` | P2 | **confirmed/deferred** | Three primary navigation failures occurred across six independent direction/run observations (dependent failures excluded), satisfying the bounded intermittent threshold. The visible find counter failed to advance under timing/load; no corruption, crash, or overlap with watcher modules was evidenced. The user-directed long-term policy is to record non-serious work for later rather than repair it in this emergency batch. | Create no product-fix ticket now. Any future ticket must first preserve the recorded fixture and distinguish real keyboard/menu behavior from the synthetic renderer seam. |
| `W1-SYNTHETIC-KEYBOARD-INPUT-INTERMITTENT` | none assigned | **automation/inconclusive** | Failures were confined to Playwright synthetic typing/focus: one related-set failure, two anomalous isolated repetitions, and a passing final full-suite run. There is no manual reproduction, application-level product failure, corruption, crash, or demonstrated relationship to the watcher changes. | No product repair. If revisited, first establish a deterministic editor action or manual reproduction and then reassess under the normal evidence threshold. |
| Loaded-document word count (`d93c259d`) | baseline | **baseline** | Ticket 01's controlled Electron baseline passed the loaded-content, tab-switch, CJK/ASCII, tooltip, and display-mode word-count cases. This verifies the earlier repair rather than identifying an open candidate. | Retain `editor-input.spec.ts` as a regression baseline; it becomes remediation work only if it newly fails and is confirmed. |
| Unchecked Preferences switch contrast (`948eec8b`) | baseline | **baseline** | Ticket 01's controlled Electron baseline passed the off-switch contrast check, including an effective track/thumb ratio of at least 3:1. This verifies the earlier repair rather than identifying an open candidate. | Retain `preference-switch-contrast.spec.ts` as a regression baseline; it becomes remediation work only if it newly fails and is confirmed. |

No candidate is classified as expected behavior, product decision, environment failure, or high-severity pending. The four deferred Ticket 01 review-hardening observations are test portability/documentation/naming maintenance, not observed MarkText runtime candidates, and do not create a product-fix ticket.

## Explicitly untested or unavailable scope

The emergency stop means the following are **untested/unavailable**, not passing and not candidates for remediation:

| Audit area | Status | Boundary of the claim |
| --- | --- | --- |
| W2 tabs, unsaved close, restart recovery, Save As, and persisted source/tab preferences | **untested** | Ticket 03 was not executed. |
| W4 large-document stability and E2–E5 dark theme, small window, 125% app zoom, and native-title-bar smokes | **untested** | Ticket 04 was not executed. |
| M1 native Open/Save As/export dialogs, M2 manual external-modification checks, M3 bitmap paste/drag-drop, and M4 manual unsaved restart | **untested** | Ticket 05 was not executed. |
| M5 Pandoc import conversion | **unavailable** | Ticket 05 was not executed; Pandoc was not installed to extend this audit, so no conversion result exists. |
| macOS, Linux, and any unexecuted Windows configuration or native boundary | **untested** | Windows E1 evidence and Electron tests do not establish cross-platform or unrun-boundary behavior. |

The Ticket 02 W1/W3 controls and Ticket 02A's test results support only their stated document-integrity and watcher assertions. They do not fill the unexecuted Ticket 03–05 boundary coverage.

## Priority and implementation queue

There is no open product repair authorized by this specification:

1. The P0 external-overwrite defect is repaired and independently accepted (`26b09ea6`, with required queue/concurrency follow-up `6e4b113c`).
2. The high-risk P2 watcher follow-up is repaired and independently accepted (`6e4b113c`).
3. The confirmed intermittent P2 find-navigation defect is intentionally deferred by user policy; it is the first candidate to triage if that policy changes.
4. The synthetic-keyboard observation requires better evidence before it can enter a product queue.

Do not merge the find-navigation candidate with watcher work: the evidence establishes neither a shared root cause nor a shared required change or regression seam. Do not create tickets from baselines, automation/inconclusive evidence, or untested/unavailable surfaces.

## Evidence thresholds for future work

- A deterministic product defect requires a controlled 2/2 reproduction on the current local commit with a fixed fixture and an application-level oracle.
- An intermittent defect may use at most ten attempts and requires at least two independent failures; record failures/attempts and exclude dependent follow-on failures.
- A real Windows-only defect requires a 2/2 bounded manual reproduction plus persistent output or application-state evidence and an exact checklist. Add automation at the nearest trustworthy seam.
- Screenshots and video are supplementary. Prefer disk bytes/hashes, process state, DOM/computed style/accessibility/hit testing, IPC/store state, and output artifacts. Resolve conflicts through fresh state, minimization, a normal control, and a second observation method.
- A P0/P1 event with strong initial evidence is preserved and isolated immediately; before threshold confirmation it remains high-severity pending, not a pretext for speculative product changes.

Any future candidate record must contain commit/environment, fixture and clean state, numbered steps, expected-behavior basis, actual application-level evidence, rate, catching command/checklist, severity/impact rationale, exactly one disposition, and a next action.

## Test-first, review, and acceptance contract

For each future independently confirmed defect, create one implementation ticket unless a shared root cause, required change, and regression seam are all proven.

1. Before product code changes, add the smallest trustworthy regression and show it fails for the recorded symptom. Use Electron E2E for desktop-visible behavior; use a focused unit seam where it more precisely isolates serialization, watcher, state, or formatting behavior.
2. Run the new regression, directly related tests, and affected-package type checking for every ticket. Do not claim unexecuted platforms or unavailable dependencies passed.
3. P0/P1 work and changes to persistence, serialization, file synchronization, shared editor state, IPC, or window lifecycle require independent ticket-level review and the full unit plus Electron E2E suites before ticket acceptance.
4. At complete-batch acceptance, run all new/adjacent regressions, full unit tests, full Electron E2E, type checking, lint with zero errors and no new warnings, an unpacked production build, the frozen exploratory matrix, affected real-Windows procedures, and an independent Standards + Spec review with no unresolved blockers. Record known exceptions precisely; do not call a suite fully green when it contains a deferred failure.
5. Follow the lifecycle `ready-for-agent → in-progress → implemented-awaiting-review → review-remediation` (when needed) `→ acceptance → resolved`. Keep each repair/test change and each review remediation in atomic local commits.

## Repository constraint

All artifacts, tests, fixes, reviews, builds, and commits remain local. Do not push to GitHub. Ticket 07 may use this specification to create a map only after the coordinating task explicitly directs it; this Ticket 06 handoff does not begin Ticket 07.
