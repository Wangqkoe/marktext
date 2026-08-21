# MarkText first-batch bug audit and remediation handoff

Label: `ready-for-agent`
Status: `ready-for-agent`

## Problem Statement

The user has already encountered user-visible MarkText defects, including a loaded-document word count that remained at zero and an unchecked Preferences switch whose white background made its thumb difficult to see. Those two reports are now repaired and covered by regression tests, but they show that important failures can survive in ordinary editing and settings workflows even when the application starts normally.

The user wants MarkText inspected for additional bugs and wants confirmed problems repaired, without mixing this maintenance work into the completed Typora-inspired shell redesign. A useful audit must distinguish product defects from expected behavior, product-design questions, missing optional dependencies, operating-system limitations, automation failures and screenshot artifacts. It must concentrate first on document safety and core Windows editing flows, remain small enough to review, and produce evidence strong enough that each repair can begin with a failing regression test.

## Solution

Run a bounded, evidence-driven first bug-audit batch on the current local MarkText branch. Exercise a frozen, risk-weighted Windows matrix covering file lifecycle, WYSIWYG/source transitions, tabs and session restoration, import/export boundaries, behavior-affecting Preferences and representative window/theme configurations. Use isolated user-data directories for independent flows and one deliberately shared directory for restart and persistence checks.

Every observation receives a recorded disposition. Confirm deterministic defects at 2/2 controlled reproductions and intermittent defects at two or more failures in a bounded ten-run loop. Preserve a strongly evidenced P0/P1 event immediately and reproduce it safely on copies. Screenshots support findings but do not replace disk, process, DOM or application-state evidence.

Stop when five product defects are confirmed or the complete frozen matrix is exhausted. Then produce an evidence-backed remediation specification and one test-first implementation ticket per independent defect. High-risk repairs receive ticket-level independent review; the complete batch receives an independent Standards + Spec review and full acceptance before local closure. All changes and commits remain local and are never pushed to GitHub.

## User Stories

1. As a MarkText user, I want the application audited for defects in normal editing workflows, so that failures are found before they damage my work.
2. As a Markdown author, I want opening, editing, saving and reopening a document to preserve its content, so that routine use is safe.
3. As a Markdown author, I want WYSIWYG and source-mode round trips to preserve Markdown meaning and bytes where the format contract requires it, so that changing editing modes does not rewrite my document unexpectedly.
4. As a user, I want undo and redo to remain coherent after changing modes, tabs or external file state, so that I can recover edits predictably.
5. As a user with multiple documents, I want each tab to retain its own content, dirty state, caret, scroll and history, so that switching documents does not mix state.
6. As a user with unsaved work, I want close and restart behavior to recover or explicitly protect that work, so that an application lifecycle event does not silently discard it.
7. As a user of auto-save, I want the configured delay and disk result to agree with the visible saved state, so that I know when my document is durable.
8. As a user whose file changes outside MarkText, I want clean and dirty documents handled safely, so that external tools do not cause silent overwrites or lost edits.
9. As a user working in Chinese paths, I want files under directories containing spaces and non-ASCII characters to open, save and reload correctly, so that the application works with real Windows filenames.
10. As a user with CRLF documents, I want save and reload behavior to preserve the established line-ending contract, so that MarkText does not create unnecessary file churn.
11. As a user with relative images, I want image references and configured insertion behavior preserved across editing and saving, so that documents remain portable.
12. As a user pasting a bitmap, I want the image stored according to my Preferences, so that clipboard workflows do not create broken or transient links.
13. As a user dragging a local image into MarkText, I want the operating-system path and persistence policy handled correctly, so that the inserted image remains available later.
14. As a user exporting a document, I want HTML and PDF outputs to be created at the selected location and represent the active document, so that exported artifacts are trustworthy.
15. As a user without Pandoc installed, I want import to explain the missing dependency without destabilizing the editor, so that an unavailable optional feature fails safely.
16. As a user with Pandoc unavailable in the audit environment, I want that limitation reported honestly, so that an unexecuted conversion is not presented as passing.
17. As a user switching themes, I want core editing and controls to remain operable in light and dark modes, so that theme selection does not hide functional state.
18. As a user in a small window, I want navigation, editing and saving to remain usable, so that constrained geometry does not break a core workflow.
19. As a user at non-default application zoom, I want input, menus and source-mode controls to remain usable, so that scaling does not produce functional failures.
20. As a Windows user with a native title bar, I want startup, editing, saving and restart to work without relying on the custom-title-bar path, so that both supported configurations remain functional.
21. As a user changing Preferences that affect core behavior, I want the setting to apply and persist, so that the UI and actual application behavior do not diverge.
22. As a user, I want the repaired word count checked as a baseline, so that the prior zero-count defect does not return.
23. As a user, I want the repaired unchecked-switch contrast checked as a baseline, so that the prior inaccessible state does not return.
24. As a user, I want layout redesign requests kept separate from this audit, so that bug repair does not reopen approved shell decisions.
25. As a maintainer, I want the first audit batch capped at five confirmed defects, so that the resulting remediation remains reviewable.
26. As a maintainer, I want the complete frozen matrix run even if it finds fewer than five defects, so that scope is not expanded merely to fill a quota.
27. As a maintainer, I want data loss and corruption ranked above crashes, blocked workflows, incorrect behavior and cosmetic issues, so that remediation follows user risk.
28. As an auditor, I want each independent workflow to start from isolated user data, so that persisted state from another check cannot create false evidence.
29. As an auditor, I want one shared user-data profile used intentionally for restart tests, so that session and Preferences persistence are exercised rather than mocked away.
30. As an auditor, I want every candidate reproduced from a documented clean state, so that another maintainer can repeat the observation.
31. As an auditor, I want deterministic findings reproduced twice, so that an incidental interaction is not promoted to a bug.
32. As an auditor, I want intermittent findings measured in a bounded loop, so that their failure rate is known and the audit cannot run indefinitely.
33. As an auditor, I want a single strongly evidenced data-loss or crash event preserved immediately, so that subsequent investigation does not destroy the most important evidence.
34. As an auditor, I want screenshots treated as supporting rather than authoritative evidence, so that capture and scaling artifacts are not misclassified as product defects.
35. As an auditor, I want expected behavior tied to an accepted contract or format semantic, so that personal preference is not silently converted into a repair requirement.
36. As a product owner, I want ambiguous intended behavior recorded as a product decision, so that implementation does not guess at product policy.
37. As a maintainer, I want automation-only failures checked against real application state and a control case, so that time is not spent fixing a broken harness as though it were MarkText.
38. As a maintainer, I want every observed candidate retained with a disposition, so that rejected and inconclusive reports are not repeatedly rediscovered.
39. As a maintainer, I want original user documents treated as read-only, so that auditing cannot damage source material.
40. As a fixer, I want each confirmed defect to include a complete evidence package, so that I can reproduce it without reopening discovery.
41. As a fixer, I want a failing regression test established before product code changes, so that the repair is tied to the actual symptom.
42. As a fixer of an OS-boundary issue, I want a repeatable manual checklist and an automated test at the nearest reliable seam, so that both integration reality and maintainable coverage are retained.
43. As a reviewer, I want one independent defect per implementation ticket, so that the change and its risk can be evaluated in isolation.
44. As a reviewer, I want symptoms combined only after a shared root cause and test seam are proven, so that convenient grouping does not hide unrelated changes.
45. As a reviewer, I want P0/P1 and persistence, serialization, IPC or shared-state repairs reviewed independently, so that high-risk changes do not rely solely on implementation self-review.
46. As a reviewer, I want a final Standards + Spec review of the complete batch, so that repository conventions and user-approved behavior are evaluated separately.
47. As a maintainer, I want adjacent defects returned to triage unless they meet the same-root-cause rule, so that ticket scope remains stable.
48. As a maintainer, I want each ticket recorded in an atomic local commit with follow-up review-remediation commits, so that history remains reviewable and reversible.
49. As a maintainer, I want unavailable platform and dependency checks recorded as untested or unavailable, so that acceptance results never overclaim coverage.
50. As the repository owner, I want no commit pushed to GitHub, so that all work follows the local-only repository instruction.

## Implementation Decisions

- Treat this specification as a two-stage workflow: execute and document the bounded audit first, then create a confirmed-defect remediation specification and implementation tickets. Do not create speculative product-fix tickets before confirmation.
- Audit the current local branch on Windows. Cross-platform statements require actual platform evidence and cannot be inferred from Windows results.
- Keep completed Typora-inspired shell work separate. A shell issue enters this audit only when it violates an existing accepted shell contract.
- Keep the repaired word-count and unchecked-switch issues as regression baselines. They count against the five-defect cap only if they regress and meet current confirmation rules.
- Use severity P0 for data loss, file corruption or serious security defects; P1 for crashes, inability to open/save or a completely blocked core workflow; P2 for incorrect behavior, rendering, serialization or key accessibility failures; and P3 for minor interaction, performance or visual defects.
- Order confirmed work by severity, then impact breadth and reproduction stability.
- Stop discovery after five confirmed product defects or after the frozen matrix is complete. A strongly evidenced P0 pauses discovery immediately for safe preservation and emergency handoff.
- Use risk-weighted pairwise coverage rather than multiplying every fixture, configuration and transition.
- Use a fresh isolated user-data directory for each independent audit flow. Use one separate shared user-data directory only for restart, session and preference persistence.
- Define four fixture families: F1 blank/unsaved; F2 a canonical document containing all supported block families; F3 a temporary path/encoding/image edge document; and F4 a generated medium-to-large document.
- Define five Windows configurations: E1 light/custom-title/1280×720/100% as the full baseline; E2 dark; E3 640×480; E4 125% application zoom; and E5 native title bar. E2–E5 receive representative boundary smokes rather than complete coverage.
- Restrict Preferences coverage to auto-save and delay, startup document/layout restoration, theme, image insertion policy, source mode and tab visibility. Preferences visual redesign is excluded.
- Do not install optional tools only to broaden audit coverage. When Pandoc is absent, verify the missing-dependency behavior and record conversion as unavailable.
- Include five real-Windows boundaries: M1 native open/Save As/export dialogs; M2 clean and dirty external file modification; M3 bitmap paste and local-image drag/drop; M4 unsaved close/restart recovery; and M5 missing-Pandoc import behavior.
- Pair the matrix as W1 F2+E1 full editing/save/reload round trip; W2 F1+E1 tabs, unsaved restart, Save As and reopen; W3 F3+E1 path, CRLF, relative-image, auto-save and external-change behavior; W4 F4+E1 stability smoke; W5 F2 sampled across E2–E5; and W6 the M1–M5 real-Windows checks.
- Run baseline regressions first, then W1/W3 data-integrity flows, W2 session recovery, W4/W5 boundaries and finally W6 operating-system integration.
- Freeze the matrix once execution begins. Add only the smallest scenario required to isolate an anomaly, and record why it was added.
- Classify candidates as confirmed deterministic, confirmed intermittent, high-severity pending, inconclusive, expected behavior, environment failure, automation/capture artifact, product decision, or duplicate/baseline regression.
- Only confirmed deterministic and confirmed intermittent product defects consume the five-finding cap or receive ordinary remediation tickets.
- Resolve expected behavior using accepted specifications, explicit Markdown/format semantics, existing automated contracts and stable internally consistent interaction, in that order. Typora is a design reference rather than a functional oracle.
- Preserve a concise record and disposition for every observed candidate. Store minimized reproduction material in the audit workspace; keep original user files read-only and out of commits.
- Require every confirmed finding to include environment and commit identity, fixture/input, clean-state steps, expected-behavior basis, actual application-level evidence, reproduction rate, catching command or harness, severity and impact rationale.
- Confirmation does not require finding the introducing commit. Perform history bisection later only when it materially reduces remediation risk.
- Produce one batch remediation specification when the audit stop condition is met. Convert it through `to-tickets` into one ticket per independent confirmed defect with explicit dependencies.
- Merge multiple symptoms into one ticket only after proving a shared root cause, required change and regression seam.
- Use the ticket lifecycle `ready-for-agent`, `in-progress`, `implemented-awaiting-review`, optional `review-remediation`, `acceptance`, and `resolved`.
- Implement one remediation ticket at a time by default. Parallel implementation is allowed only when modules and state dependencies do not overlap.
- Keep at least one atomic local test-and-fix commit per remediation ticket. Record review remediation in subsequent local commits. Never push any commit.

## Testing Decisions

- Test externally observable behavior at the highest reliable seam. Avoid tests that depend only on private component state, internal method order or incidental markup when a desktop-level result is available.
- Electron Playwright E2E is the primary audit and regression seam because it exercises renderer behavior, application IPC, real persistence, tabs, menus, source mode and Electron lifecycle together.
- Desktop and Muya unit tests are auxiliary seams for pure serialization, file-writing, watcher, state-transition, editor-engine and formatting behavior when they isolate the real failure more precisely.
- Real Windows procedures are the authoritative integration seam for native dialogs, actual external-process file changes, OS clipboard bitmaps and file-manager drag/drop that cannot be simulated faithfully.
- Existing E2E launch helpers already create isolated temporary user-data directories and support intentional relaunch against the same directory; reuse these mechanisms.
- Reuse the existing canonical all-blocks fixture and existing round-trip, editor-input, source-mode, tabs, layout-persistence, external-reload, export, theme and Preferences contrast suites as prior art.
- Confirm a normal deterministic candidate only after 2/2 reproductions on the current local commit with a fixed fixture and application-level oracle.
- Run an intermittent candidate at most ten times. Confirm it at two or more failures and record failures/attempts; retain a 1/10 result as inconclusive.
- A single strongly evidenced P0/P1 event triggers evidence preservation and pauses exploration. Reproduction must use copies or isolated state; until confirmed, keep it high-severity pending and do not modify product code.
- Use disk bytes and hashes, process exit and error state, application store/IPC state, DOM state, computed style, accessibility state, hit testing and output artifacts as primary evidence. Screenshots and video remain supplementary.
- When evidence conflicts, rerun with fresh user data, minimize input, add a normal control and verify through a second observation method. Classify a failure confined to the harness or capture path as an automation/capture artifact.
- An OS-only defect can be confirmed with 2/2 manual reproduction, persistent output or application-state evidence and an exact bounded checklist. Its repair must also add an automated test at the nearest trustworthy seam.
- Before modifying product code for a confirmed defect, establish the smallest trustworthy regression and verify that it fails for the recorded reason.
- Every remediation ticket must run its new regression, directly related tests and affected-package type checking.
- P0/P1 repairs and changes involving file persistence, serialization, file synchronization, shared editor state, IPC or window lifecycle must also run the full unit and Electron E2E suites at ticket acceptance.
- Each P0/P1 and each high-risk persistence/shared-state repair receives an independent ticket-level review. Every completed batch receives an independent Standards + Spec review.
- After review remediation, final batch acceptance requires all new and related regressions, full unit tests, full Electron E2E, type checking, lint with zero errors and no new warnings, an unpacked production build, the frozen exploratory matrix and all affected real-Windows procedures.
- Record unavailable platforms and dependencies explicitly as `untested` or `unavailable`; never report them as passing.

## Out of Scope

- Reopening approved Typora-inspired shell layout or visual decisions without a failing acceptance contract.
- Redesigning the Preferences window; only functional behavior of selected settings is eligible.
- Treating Typora behavior as an automatic MarkText specification.
- Adding features, Markdown syntax extensions or broad architectural refactors unrelated to a confirmed repair.
- Searching or triaging the upstream GitHub issue backlog in this first batch.
- Installing Pandoc or other optional external tools solely for audit completeness.
- Performing a full Cartesian product of documents, themes, title bars, sizes, zoom levels and state transitions.
- Promoting visual oddities, screenshots or automation-only failures without application-level evidence.
- Fixing speculative, inconclusive, expected, environment-only or unresolved product-decision candidates.
- Requiring git bisect before a defect can be confirmed.
- Claiming macOS, Linux, native display scaling or unavailable dependencies have passed without actual evidence.
- Publishing releases or pushing commits to GitHub.

## Further Notes

- The loaded-document word-count defect was repaired by local commit `d93c259d`; its Electron editor-input coverage is a first audit baseline.
- The unchecked Preferences switch-contrast defect was repaired by local commit `948eec8b`; its contrast E2E coverage is the second baseline.
- The previously completed shell project has separate acceptance evidence and must not absorb unrelated product maintenance findings.
- The accepted matrix intentionally favors document integrity, crash prevention and broken core workflows over cosmetic polish.
- The accepted evidence rules favor reproducibility over finding count. Completing the matrix with zero or fewer than five confirmed defects is a valid outcome.
- All generated artifacts, specifications, tickets, tests, fixes and review-remediation commits remain local under the repository instruction.
