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

## Questions to resolve

- [Define audit scope and severity](issues/01-define-audit-scope-and-severity.md): resolved; the first batch targets core Windows workflows under a P0-P3 model and a five-defect cap.
- [Choose the exploratory surface matrix](issues/02-choose-exploratory-surface-matrix.md): choose fixtures, state transitions and Windows configurations that efficiently expose defects.
- [Define reproduction and triage rules](issues/03-define-reproduction-and-triage-rules.md): settle the evidence threshold that separates confirmed bugs, tool artifacts, expected behavior and product decisions.
- [Define the remediation handoff](issues/04-define-remediation-handoff.md): decide batching, test, review, commit and acceptance rules before converting findings to a specification and tickets.

## Out of scope

- Reopening resolved shell visual decisions without a failing acceptance criterion.
- Redesigning the Preferences window; functional Preferences defects remain eligible.
- New feature development or Markdown syntax extensions unless required to repair an established regression.
- Fixing speculative issues that lack a deterministic or sufficiently high-rate reproduction.
- Publishing releases or pushing commits to GitHub.
