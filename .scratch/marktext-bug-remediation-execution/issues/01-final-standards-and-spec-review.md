# 01: Final Standards + Spec review

**Historical scope:** Deliver an independent final two-axis review of the already repaired watcher remediation, so a user can rely on auto-save and external-file handling without silently losing a later external edit or producing a false external-change notification during queued or concurrent saves.

**Blocked by:** The regenerated remediation map after resumed audit Tickets 03–05 and re-executed Tickets 06–07.

**Status:** paused (`superseded-by-resumed-audit`)

This is a historical proposed final-review ticket, not a current frontier. Do not execute it or treat its checklist as current acceptance. Recreate any final review only from the regenerated remediation map; its scope may differ after the resumed audit.

## Evidence and behavior contract

Review the [remediation specification](../../marktext-bug-remediation/spec.md), [P0 disk-outcome evidence](../../marktext-bug-audit-execution/evidence/02-p0-autosave-external-overwrite.md), [queued-event evidence](../../marktext-bug-audit-execution/evidence/02-p2-queued-own-save-event-order.md), and the completed [Ticket 02A review](../../marktext-bug-audit-execution/issues/02a-review-p0-autosave-external-change-repair.md). The historical local commits are `26b09ea6` (P0 repair) and `6e4b113c` (queued/concurrent repair); neither is to be reopened or duplicated.

The P0 disk-loss regression was deterministic before repair (2/2 failures, then 0/2 after `26b09ea6`). The high-risk persistence P2 had a deterministic queued-event regression and a controlled concurrent result of `[true, false]` before `6e4b113c`, corrected to `[true, true]` with at most one active read. These are historical red-to-green records to verify against, not authorization to create a duplicate repair.

- [ ] Independently review Standards and Spec as separate axes, including exact-byte own-save matching, eligible-record ordering and consumption, per-window/per-path serialization, failure forwarding, CRLF/encoding preservation, and unaffected-path independence.
- [ ] Verify the end-to-end outcome through the recorded P0 and queued/concurrent regressions: an external write immediately after auto-save survives a later save, and queued or concurrent own-save events do not produce a false external-change result or suppress the latest pending save.
- [ ] Run and record the focused red-to-green controls: `pnpm --filter marktext exec vitest run test/unit/specs/watcher-ignore-change.spec.ts` and `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save|queued own-save events" --repeat-each=2`; then run directly related tests, `pnpm test:unit`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, and `pnpm build:unpack`. Report each result and any unavailable or unrun boundary exactly.
- [ ] Treat a serious Standards or Spec finding as a blocker requiring a separately committed review remediation and repeat of the affected verification. Record low-impact maintenance, portability, coverage, naming, or documentation observations as deferred; do not turn them into speculative product work.
- [ ] Record the known full-E2E exception accurately: Ticket 02A's accepted run was 250 passed, 4 skipped, and 2 known/deferred find-navigation P2 failures. Do not describe that suite as green.
- [ ] Keep review artifacts and any remediation in atomic local commits; do not push to GitHub.

## Acceptance

The ticket is resolved only when both independent axes have no unresolved serious blocker, all results and exceptions are traceable to the evidence above, and the deferred find-navigation P2, W1 automation/inconclusive observation, baselines, and untested/unavailable scope remain outside the product queue.
