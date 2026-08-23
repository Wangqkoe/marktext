# 01: Final Standards + Spec Review

**What to build:** Deliver an independent, evidence-backed final review of the completed frozen audit batch so maintainers can decide whether its accepted watcher repairs, deferred dispositions, evidence boundaries, and closure plan comply both with repository standards and with the originating audit specification. The review produces separate Standards and Spec conclusions; it does not implement product changes.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Required review scope and evidence

Review the complete [frozen audit matrix and its frontier history](../../marktext-bug-audit-execution/map.md), the current [remediation specification](../../marktext-bug-remediation/spec.md), all cited candidate evidence, and the accepted watcher history: [P0 disk-outcome evidence](../../marktext-bug-audit-execution/evidence/02-p0-autosave-external-overwrite.md), [queued/concurrent watcher evidence](../../marktext-bug-audit-execution/evidence/02-p2-queued-own-save-event-order.md), and [Ticket 02A independent review](../../marktext-bug-audit-execution/issues/02a-review-p0-autosave-external-change-repair.md). The repaired commits are `26b09ea6` and `6e4b113c`; they are accepted ticket-level work and must not be reopened or duplicated.

Review the three confirmed deferred P2 dispositions individually: [find-navigation intermittency](../../marktext-bug-audit-execution/evidence/02-p2-find-navigation-intermittent.md), [bitmap-paste persistence](../../marktext-bug-audit-execution/evidence/05-p2-bitmap-paste-persistence.md), and [missing-Pandoc localization](../../marktext-bug-audit-execution/evidence/05-p2-missing-pandoc-localization.md). Confirm that each remains deferred and non-ticketed under the user policy; this ticket has no authority to repair, authorize, or merge any of them.

Keep the review within the complete frozen matrix, accepted watcher repairs, originating specification, repository standards, evidence integrity, and declared scope limits. Do not turn baselines, performance observations, harness/automation findings, environment/capture limitations, or unavailable/untested boundaries into product work.

## Review commands

Record the outcome or deliberate non-execution of the review controls: `git diff --check`; `pnpm --filter marktext exec vitest run test/unit/specs/watcher-ignore-change.spec.ts`; and `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save|queued own-save events" --repeat-each=2`. These support independent review; they do not substitute for Ticket 02's full acceptance command set, and no command may be reported as run unless its actual result is recorded.

## Acceptance criteria

- [ ] Produce a **Standards conclusion** that separately evaluates repository conventions, test and evidence quality, local atomic-commit/no-push compliance, and the accepted watcher repair history. Record evidence links and distinguish any serious defect from a minor observation.
- [ ] Produce a **Spec conclusion** that separately evaluates the complete frozen-matrix disposition register, the five-confirmed/two-repaired/three-deferred/zero-open authorization counts, the required review-and-acceptance workflow, and all scope limits against the originating audit specification.
- [ ] Verify that the accepted watcher behavior remains traceable to its recorded regressions: a post-auto-save external edit is not overwritten by a later save, and queued or concurrent own-save events do not create a false external-change result or suppress the latest pending save. Review the documented test seams and results without claiming a rerun that did not occur.
- [ ] Treat only an unresolved **serious** Standards or Spec issue as a closure blocker. If found, record the precise blocker, require separately committed review remediation and affected re-verification, then return to this gate. Record minor maintenance, portability, coverage, naming, or documentation observations as deferred; do not expand them into repair tickets.
- [ ] Confirm the exclusions accurately: Pandoc conversion is unavailable (its safe missing-dependency path was tested); macOS, Linux, native display scaling, and other unrun configurations are untested; earlier capture/input limitations are historical environment observations; known deferred P2s remain deferred.
- [ ] State an independent final result with two explicit fields: **Standards: accepted / serious blocker** and **Spec: accepted / serious blocker**. Only two accepted conclusions unblock Ticket 02. Keep resulting artifacts and any remediation in atomic local commits; do not push.

## Review boundary

This is an independent review gate, not final batch acceptance and not product implementation. It may inspect existing tests, commands, commits, and evidence, but must not report Review or Acceptance as completed until a reviewer actually records those results.
