# 02: Final batch acceptance and closure

**Historical scope:** Formally close the approved emergency remediation batch once its final independent review is accepted, giving users a verified end-to-end assurance that the repaired watcher path preserves a later external edit and handles queued/concurrent own-save events correctly, while precisely retaining every known exception and untested boundary.

**Blocked by:** A regenerated final-review ticket after resumed audit Tickets 03–05 and re-executed Tickets 06–07.

**Status:** paused (`superseded-by-resumed-audit`)

This is a historical proposed acceptance ticket, not a current frontier. Do not execute it or claim final review or final batch acceptance has occurred. Recreate any acceptance gate only from the regenerated remediation map.

## Evidence and acceptance scope

Use the accepted [final review ticket](01-final-standards-and-spec-review.md), the [remediation specification](../../marktext-bug-remediation/spec.md), [Ticket 02 audit history](../../marktext-bug-audit-execution/issues/02-audit-document-integrity-and-external-changes.md), and [Ticket 02A acceptance history](../../marktext-bug-audit-execution/issues/02a-review-p0-autosave-external-change-repair.md). The completed local implementation history is `26b09ea6` followed by `6e4b113c`; this ticket accepts that batch and does not reopen it.

Its historical red-to-green evidence is the P0's 2/2 pre-repair disk-loss failures and 0/2 post-repair failures, followed by the P2 queue/concurrency repair from `[true, false]` to `[true, true]`. The known separately confirmed find-navigation P2 is three primary failures across six independent observations and remains deferred, not a closure blocker under the approved policy.

- [ ] Confirm Ticket 01 has no unresolved serious Standards or Spec blocker before acceptance begins.
- [ ] Run and record the focused watcher controls, all new/adjacent watcher regressions, `pnpm test:unit`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, and `pnpm build:unpack`; verify the affected real-Windows W3 procedure where the accepted scope permits it.
- [ ] Verify the complete user-visible watcher outcome: a post-auto-save external edit reaches reload/conflict handling instead of being overwritten by a later auto-save, and rapid queued or concurrent own-save events retain the correct save without false external-change handling.
- [ ] Record the full Electron E2E result verbatim. The known accepted historical result is 250 passed, 4 skipped, and 2 deferred find-navigation P2 failures; any acceptance record must not call that suite green or hide a new failure.
- [ ] Keep the policy boundary explicit: a serious new finding blocks closure and requires review remediation; minor observations are recorded and deferred. The confirmed find-navigation P2 remains deferred, W1 remains automation/inconclusive, baselines remain baselines, and Tickets 03–05, other platforms, and Pandoc remain untested or unavailable rather than passing.
- [ ] Publish the closure only in atomic local commits and do not push to GitHub.

## Acceptance

The batch may be resolved only after Ticket 01 is accepted, the required commands and affected real-Windows procedure are recorded, no serious blocker remains, and the closure report states its exact E2E exception and untested/unavailable limits. It must not claim a fully green suite, a completed frozen audit matrix, or cross-platform coverage.
