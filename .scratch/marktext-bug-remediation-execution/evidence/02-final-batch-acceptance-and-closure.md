# Ticket 02 final batch acceptance / closure evidence

**Date:** 2026-08-23 (America/Los_Angeles)
**Acceptance baseline:** `fe5ddf2d` (`git rev-parse --short HEAD`)
**Scope:** final verification only; no product implementation, watcher repair, or deferred-P2 work was authorized or performed.

## Start gate

Ticket 01 was independently confirmed resolved before this acceptance attempt. Its [evidence](01-final-standards-and-spec-review.md) records **Standards: accepted**, **Spec: accepted**, and no serious unresolved blocker. The baseline includes the accepted watcher repairs `26b09ea6` and `6e4b113c`; neither was reopened or reimplemented.

`git diff --check` was run twice during this acceptance attempt and passed both times (exit 0, no output): the initial check took `00:00:00.1821845`, and the repeated final check before this evidence update took `00:00:00.1198419`.

This independent worktree initially had no `node_modules` or desktop `out/` output. Dependency preparation used the locked workspace state: an initial `pnpm install --frozen-lockfile --reporter=append-only` reached `ERR_PNPM_EPERM` while linking `native-keymap`; the recovery retry `pnpm install --force --frozen-lockfile --reporter=append-only` completed successfully in `4m 31s` with pnpm `10.33.4`, did not alter the lockfile, and rebuilt the native modules. The first focused Electron run then established that the missing `out/main/index.js` needed the required unpacked production build before Electron verification could start.

## Fresh command results

All durations below are actual elapsed durations from this attempt. Test counts are recorded as emitted by each command; unavailable, skipped, and failed work is not represented as passing.

| Command | Exit | Actual result | Duration | Notes |
| --- | ---: | --- | ---: | --- |
| `git diff --check` | 0 | passed | 0.1821845 s | No output; also passed on the repeated final check. |
| `pnpm --filter marktext exec vitest run test/unit/specs/watcher-ignore-change.spec.ts` | 0 | 5 passed | 3.4646784 s | Focused watcher regression passed. |
| `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save\|queued own-save events" --repeat-each=2` (first run) | 1 | 4 launch timeouts | 1:05.2709989 | Production output was absent: missing `out/main/index.js`; this was an environment/build-preparation failure, not a passing result. |
| `pnpm build:unpack` (preparation/retry build) | 0 | passed | 1:03.8626981 | Unpacked production build completed. Vite emitted known dynamic-import warnings. |
| `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save\|queued own-save events" --repeat-each=2` (rerun after build) | 0 | 4 passed | 16.0808658 s | `--repeat-each=2`; verifies both named user-visible contracts. |
| `pnpm test:unit` | 0 | 772 passed, 1 skipped | 24.5944184 s | Full unit result. |
| `pnpm test:e2e` (initial) | 1 | 0 executed | 3.4556633 s | Parser failure before execution: `test/e2e/audit-large-boundaries.spec.ts:97 First argument must use object destructuring`. Superseded as the current E2E blocker after local test-maintenance preparation. |
| `pnpm test:e2e` (current) | 1 | 255 passed, 5 failed, 4 skipped | 00:09:53.4945354 | The script loaded the existing nested Playwright config. See the current failure record below; failed/skipped work is not passing. |
| `pnpm typecheck` | 0 | passed | 17.6912926 s | Full typecheck result. |
| `pnpm lint` (initial) | 1 | 11 errors, 131 warnings | 1:18.2284255 | Initial result included 10 source formatting/prefer-const errors in the audit-tabs-restart spec and an ignored generated `test-results/.last-run` EOL error. |
| `pnpm lint` (after maintenance and generated-result cleanup) | 0 | 0 errors, 131 existing warnings | 9.4815618 s | No new warnings were introduced; the required zero-error/no-new-warning gate is met. |
| final `git diff --check` | 0 | passed | 0.1198419 s | No output. |

The initial focused Electron failure was addressed by the required safe build preparation and rerun, rather than being treated as a command-not-found exemption. The original parser/lint source blockers were then addressed in the local test-maintenance commit `9b95bf5`; the current full Electron run loaded the existing nested configuration and executed tests. The completed `build:unpack` and final lint results remain valid, but do not cure the current full-E2E failures.

## Current full-E2E failure record and serious blocker

The fresh current `pnpm test:e2e` run exited 1 after `00:09:53.4945354`: **255 passed, 5 failed, 4 skipped**. Its failures were recorded exactly as follows:

- `audit-document-integrity` W1: immediate WYSIWYG-to-source entry drops `IT` from `W1-WYSIWYG-AUDIT`.
- `audit-large-boundaries` W4: source-mode entry drops the marker suffix `W4-F2-2` to `W4-F`.
- `editor-input`: source-mode entry drops the typed suffix `typed-token` to `typed-t`.
- `parity-cursor-lang`: source-mode entry drops `## H2` to `## H`.
- Task-list autocheck: a separate current E2E failure. It must not be diagnosed or represented as the same defect without additional evidence.

The first four failures are a **serious unresolved persistence-boundary blocker**: entering source mode reads deferred rAF state/current-file content without first flushing the active editor. The resulting transition can observe a stale prefix and discard recently typed suffix content. Historical commit `c907b29c` repaired the same save boundary, and the existing `editorStore.flushActiveEditor` seam appears to be the necessary operation before source-mode entry. This ticket makes no product-code repair, and it does not claim that this diagnosis has been implemented or independently reviewed.

Required follow-up is an **independently authorized high-risk persistence repair and review**, including an appropriate regression at the source-entry boundary, followed by a fresh full-E2E and final acceptance rerun. The task-list autocheck failure requires separate investigation/disposition before it can be counted as resolved or non-blocking.

## Watcher contract verification

The fresh focused results verify both repaired watcher contracts:

- An external edit immediately after auto-save is surfaced to safe reload/conflict handling and is not silently overwritten by a later save.
- Rapid queued/concurrent own-save events do not create a false external-change event and retain the latest pending save.

This is consistent with the authoritative disk-outcome [P0 evidence](../../marktext-bug-audit-execution/evidence/02-p0-autosave-external-overwrite.md) and queued/concurrent [watcher evidence](../../marktext-bug-audit-execution/evidence/02-p2-queued-own-save-event-order.md). It is not an authorization to alter either accepted repair.

## Frozen matrix and real-Windows evidence

The complete frozen matrix and its dispositions were rechecked through the [remediation specification](../../marktext-bug-remediation/spec.md), [audit execution map](../../marktext-bug-audit-execution/map.md), Ticket 04 [performance/configuration evidence](../../marktext-bug-audit-execution/evidence/04-w4-w5-results.md), and final [real-Windows M1–M5 evidence](../../marktext-bug-audit-execution/evidence/05-real-windows-integration-results.md).

M1–M5 were **not rerun in this acceptance attempt**. The existing procedures require user-operated native dialogs, clipboard, and drag/drop; unattended replay here would not preserve their documented disk/profile/application-state oracles. The authoritative prior manual evidence remains sufficient to establish the completed matrix's historical results, but does not substitute for the mandatory fresh full-E2E command, which ran and failed as recorded above. M1, M2, M3 local-image drag/drop, and M4 passed in the prior controlled Windows run; M3 bitmap paste and M5 raw missing-Pandoc localization remain separately confirmed P2s.

## Preserved exceptions, observations, and deferrals

- Pandoc conversion remains **unavailable**: Pandoc was not installed. Only its safe missing-dependency path was tested.
- macOS, Linux, native display scaling, and other unrun configurations remain **untested**.
- The three confirmed P2s remain deferred without implementation authorization: [find navigation intermittency](../../marktext-bug-audit-execution/evidence/02-p2-find-navigation-intermittent.md), [bitmap-paste persistence](../../marktext-bug-audit-execution/evidence/05-p2-bitmap-paste-persistence.md), and [missing-Pandoc localization](../../marktext-bug-audit-execution/evidence/05-p2-missing-pandoc-localization.md).
- Historical Electron harness/environment/input/capture limitations remain historical limitations, not passing product evidence. The present full-E2E content-integrity failures are current acceptance failures.
- F4 source-mode round trip remains a non-defect performance observation (about 6.5–6.9 s versus about 0.1 s for F2, within the declared 10 s bound) and its baseline record is retained.

## Classification and closure decision

**Serious unresolved product issue:** source-mode entry may drop recently typed content by reading deferred editor/current-file state before the active editor is flushed. This is a new serious closure blocker; no product fix was made. The two accepted watcher repairs remain accepted, and no deferred P2 was repaired or promoted.

**Closure blockers (acceptance/infrastructure):**

1. Current `pnpm test:e2e` exited 1 after 255 passed, 5 failed, and 4 skipped. Four failures expose the serious source-mode-entry persistence boundary above; the task-list autocheck failure remains separately unclassified.
2. The task-list autocheck failure remains unclassified and must receive a separate disposition. The parser/lint maintenance was completed in local commit `9b95bf5`; final lint passed, but neither fact resolves the serious source-mode persistence blocker.

The policy for minor maintenance issues does not waive Ticket 02's explicit full-command and build gates. This ticket makes no product-code repair or production-configuration change to mask the current failures.

**Closure: blocked.** Ticket 02 remains unresolved. Required follow-up is an independently authorized high-risk persistence repair/review for source-mode entry, separate task-list-autocheck disposition, and fresh full-E2E/lint/final acceptance evidence before reconsidering closure.
