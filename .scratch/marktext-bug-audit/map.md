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

## Questions to resolve

- [Define audit scope and severity](issues/01-define-audit-scope-and-severity.md): decide which MarkText surfaces and severity classes enter the first audit batch.
- [Choose the exploratory surface matrix](issues/02-choose-exploratory-surface-matrix.md): choose fixtures, state transitions and Windows configurations that efficiently expose defects.
- [Define reproduction and triage rules](issues/03-define-reproduction-and-triage-rules.md): settle the evidence threshold that separates confirmed bugs, tool artifacts, expected behavior and product decisions.
- [Define the remediation handoff](issues/04-define-remediation-handoff.md): decide batching, test, review, commit and acceptance rules before converting findings to a specification and tickets.

## Out of scope

- Reopening resolved shell visual decisions without a failing acceptance criterion.
- Redesigning the Preferences window; functional Preferences defects remain eligible.
- New feature development or Markdown syntax extensions unless required to repair an established regression.
- Fixing speculative issues that lack a deterministic or sufficiently high-rate reproduction.
- Publishing releases or pushing commits to GitHub.
