# Ticket 02 independent high-risk review: source-mode entry flush

**Date:** 2026-08-23 (America/Los_Angeles)
**Reviewed range:** `e33c5bb789efd267c3607408b6060241fcb6be02...HEAD`
**Reviewed commits:** `33395878 fix(desktop): flush pending edits before source mode`; `6f2fd324 docs: record source-mode persistence repair evidence`
**Scope:** independent review of the source-mode-entry persistence repair only. No product or test code was changed by this review.

## Independent conclusions

### Standards

**Standards: accepted**

No serious finding. `preferences.ts` reuses the existing synchronous renderer-bus listener and does not import the editor store, so it preserves the established Options-Store boundary and avoids a store cycle. The narrow entry guard and typed `ViewMode` path add no IPC surface. The Electron test follows the existing helper and cleanup pattern. The documentation changes preserve the blocked state. `git diff --check` passed; no documented-standard breach or applicable Fowler-baseline judgement-call smell was found.

### Spec

**Spec: accepted**

No serious finding. The shared `TOGGLE_VIEW_MODE` transition emits the pre-existing flush event only when entering source mode. Status-bar, renderer command/shortcut, and main-menu IPC all reach that action; the editor listener synchronously calls `flush()`. The permanent Electron regression enters through the real menu and verifies CodeMirror, disk persistence after the real save command, and content after close/reopen. The evidence distinguishes the 29/30 pre-fix result from the 30/30 post-fix result and explicitly falsifies synthetic-input key loss. The repair neither attributes nor closes task-list autocheck, and it leaves the accepted watcher repairs and three deferred P2 records out of scope.

Deferred, non-blocking documentation finding: the Ticket 02 acceptance record should identify the earlier 255-passed/5-failed/4-skipped E2E result as pre-repair history rather than a current result once final acceptance is resumed. This review makes that clarification in the ticket; it does not change the acceptance decision.

## Review controls and fresh verification

| Command | Result |
| --- | --- |
| `git rev-parse e33c5bb7` | `e33c5bb789efd267c3607408b6060241fcb6be02` |
| `git merge-base e33c5bb7 HEAD` | `e33c5bb789efd267c3607408b6060241fcb6be02` |
| `git diff --check` | exit 0; no output |
| `pnpm install --force --frozen-lockfile --reporter=append-only` | exit 0; 2m 55.3s; lockfile unchanged |
| `pnpm build:unpack` | exit 0; unpacked output built; known dynamic-import warnings only |
| `pnpm --filter marktext exec playwright test test/e2e/editor-input.spec.ts --grep=immediately --repeat-each=30 --workers=8` | exit 0; **30 passed** in 1.1m |
| `pnpm --filter marktext exec playwright test test/e2e/editor-input.spec.ts test/e2e/audit-document-integrity.spec.ts test/e2e/audit-large-boundaries.spec.ts test/e2e/parity-cursor-lang.spec.ts` | exit 0; **24 passed** in 57.1s |

The review did not rerun full E2E. It relies on the implementation record's explicit fresh `pnpm test:e2e` result of 261 passed and 4 skipped; final Ticket 02 acceptance must still run its own required acceptance sequence.

## Decision

The source-mode-entry repair is **independently accepted** on both axes. Ticket 02 remains **blocked**, because task-list autocheck still needs an independent disposition and final acceptance is still pending. The next frontier is task-list-autocheck characterization, not further source-mode or deferred-P2 implementation.
