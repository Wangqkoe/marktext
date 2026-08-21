# MarkText bug audit and remediation

Label: `wayfinder:map`
Status: `ready-for-agent`

## Destination

Produce an evidence-backed, prioritized bug-remediation specification for user-visible MarkText defects, then hand each independently reproducible fix to small implementation tickets with explicit regression tests and review gates.

## Notes

- This map is independent from the resolved Typora-inspired shell implementation. A bug belongs there only when it demonstrably violates a shell acceptance contract.
- Windows is the primary exploratory environment; cross-platform claims must be limited to evidence available from tests or an actual platform run.
- The previously reported loaded-document word-count defect is resolved by `d93c259d` and covered by `editor-input.spec.ts`.
- The previously reported invisible unchecked Preferences switch is resolved by `948eec8b` and covered by `preference-switch-contrast.spec.ts`.
- Use a deterministic reproduction loop before diagnosing or fixing a candidate. Do not turn visual oddities or capture-tool failures into product bugs without application-level evidence.
- Keep all changes and commits local as required by `AGENTS.md`; never push to GitHub.

## Decisions so far

- Treat already fixed word-count and switch-contrast reports as regression baselines, not open bugs.
- Keep layout redesign, feature requests and broad refactors out of this bug map.
- Prefer user-visible correctness, data safety, crash prevention and broken core workflows over cosmetic polish.
- Require a dedicated regression test at the real failure seam before each fix whenever such a seam exists.
- Limit the first audit batch to core Windows workflows: file open/save/recovery, editor input, WYSIWYG/source round trips, tabs, import/export and functional Preferences behavior.
- Discover candidates from the current branch through exploratory checks, automated tests and user reports; defer the upstream GitHub issue sweep to a separate batch.
- Rank confirmed findings as P0 data loss/security, P1 crashes or blocked core workflows, P2 incorrect behavior/rendering/serialization or key accessibility failures, and P3 minor interaction/performance/visual defects.
- Stop the first audit batch after five confirmed defects; if a P0 is found, stop exploration and hand it to remediation immediately.
- Build the exploratory matrix with risk-weighted pairwise coverage instead of a full Cartesian product.
- Use a fresh isolated user-data directory per independent flow plus one shared directory for restart, session and preference persistence.
- Use four fixture families: a blank unsaved document, the canonical all-blocks fixture, a path/encoding/image edge fixture, and a generated medium-to-large document.
- Run the complete workflow on Windows light/custom-title-bar at 1280×720 and 100% zoom; use dark theme, 640×480, 125% application zoom and the native title bar only for representative boundary smokes.
- Include only Preferences that affect core behavior or persisted state: auto-save/delay, startup restoration, theme, image insertion, source mode and tab visibility.
- Do not install optional tools solely for the audit. Exercise the missing-Pandoc path and mark conversion itself unavailable when Pandoc is absent.
- Include limited real-Windows checks for native file dialogs, external file changes, bitmap paste/file drag, unsaved restart recovery and missing-Pandoc handling.
- Freeze the accepted matrix during exploration; add only the smallest isolation scenario needed to investigate an anomaly, recording why it was added.

## Questions to resolve

- [Define audit scope and severity](issues/01-define-audit-scope-and-severity.md): resolved; the first batch targets core Windows workflows under a P0-P3 model and a five-defect cap.
- [Choose the exploratory surface matrix](issues/02-choose-exploratory-surface-matrix.md): resolved; use the frozen risk-paired F1–F4, E1–E5, M1–M5 and W1–W6 matrix.
- [Define reproduction and triage rules](issues/03-define-reproduction-and-triage-rules.md): settle the evidence threshold that separates confirmed bugs, tool artifacts, expected behavior and product decisions.
- [Define the remediation handoff](issues/04-define-remediation-handoff.md): decide batching, test, review, commit and acceptance rules before converting findings to a specification and tickets.

## Out of scope

- Reopening resolved shell visual decisions without a failing acceptance criterion.
- Redesigning the Preferences window; functional Preferences defects remain eligible.
- New feature development or Markdown syntax extensions unless required to repair an established regression.
- Fixing speculative issues that lack a deterministic or sufficiently high-rate reproduction.
- Publishing releases or pushing commits to GitHub.
