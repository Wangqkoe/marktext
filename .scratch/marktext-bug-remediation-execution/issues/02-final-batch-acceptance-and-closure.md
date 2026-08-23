# 02: Final Batch Acceptance/Closure

**What to build:** Independently verify and close the completed first audit batch only after final review has found no serious unresolved issue, giving maintainers an accurate acceptance record for the frozen Windows audit matrix and the accepted watcher repairs while preserving every known exception and deferred disposition.

**Blocked by:** None — Ticket 01 resolved with Standards and Spec accepted.

**Status:** ready-for-agent (current frontier; unexecuted)

## Start gate and evidence

Do not begin acceptance until Ticket 01 records separate Standards and Spec conclusions with no unresolved serious blocker. Use that review, the current [remediation specification](../../marktext-bug-remediation/spec.md), complete [audit execution map](../../marktext-bug-audit-execution/map.md), [P0 disk-outcome evidence](../../marktext-bug-audit-execution/evidence/02-p0-autosave-external-overwrite.md), [queued/concurrent watcher evidence](../../marktext-bug-audit-execution/evidence/02-p2-queued-own-save-event-order.md), and [final real-Windows integration results](../../marktext-bug-audit-execution/evidence/05-real-windows-integration-results.md).

The scope accepts completed work in `26b09ea6` and `6e4b113c`; it does not reopen it. The three deferred P2 records remain [find navigation](../../marktext-bug-audit-execution/evidence/02-p2-find-navigation-intermittent.md), [bitmap paste](../../marktext-bug-audit-execution/evidence/05-p2-bitmap-paste-persistence.md), and [missing Pandoc localization](../../marktext-bug-audit-execution/evidence/05-p2-missing-pandoc-localization.md). No acceptance action authorizes their repair.

## Acceptance criteria

- [ ] Confirm Ticket 01's independent Standards and Spec conclusions have no unresolved serious blocker before running acceptance. A serious new finding blocks closure, requires separately committed review remediation, and requires affected verification to be repeated.
- [ ] Execute and record the relevant watcher regressions, including `pnpm --filter marktext exec vitest run test/unit/specs/watcher-ignore-change.spec.ts` and `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save|queued own-save events" --repeat-each=2`, plus directly related regressions required by the current evidence.
- [ ] Execute and record the original-spec full acceptance commands: `pnpm test:unit`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, and `pnpm build:unpack`. Lint acceptance requires zero errors and no new warnings; the unpacked production build must complete. Record actual results rather than inferring them from prior runs.
- [ ] Verify the complete frozen-matrix evidence and run the affected real Windows procedures where the environment permits, using the documented disk/profile/application-state oracles. Confirm the user-visible watcher contract: an external edit immediately after auto-save reaches safe reload/conflict handling rather than later overwrite, and rapid queued/concurrent own-save events retain the right save without false external-change handling.
- [ ] Record the full Electron E2E result exactly. Do not call unavailable, skipped, failed, or known-deferred work passing. In particular, Pandoc conversion is unavailable because Pandoc was not installed; macOS, Linux, native display scaling, and other unrun configurations are untested; retain known deferred P2s and prior harness/environment limits explicitly.
- [ ] Close only when no serious unresolved issue remains, all executed commands and procedures have traceable evidence, and the final record preserves the frozen matrix, repaired watcher history, three P2 deferrals, baselines, performance observations, automation/harness/capture limits, and unavailable/untested boundaries. Commit closure artifacts atomically and locally; do not push.

## Acceptance boundary

This ticket is final batch acceptance/closure, not an implementation ticket. It must never repair or authorize a deferred P2, and it must not claim Review or Acceptance occurred until the independent review and the listed verification actually complete.
