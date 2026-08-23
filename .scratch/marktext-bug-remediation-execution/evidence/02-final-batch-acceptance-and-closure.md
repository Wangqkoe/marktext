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
| `pnpm test:e2e` | 1 | 0 executed | 3.4556633 s | Parser failure before execution: `test/e2e/audit-large-boundaries.spec.ts:97 First argument must use object destructuring`. |
| `pnpm typecheck` | 0 | passed | 17.6912926 s | Full typecheck result. |
| `pnpm lint` | 1 | 11 errors, 131 warnings | 1:18.2284255 | Includes 10 source formatting/prefer-const errors in the audit-tabs-restart spec and an ignored generated `test-results/.last-run` EOL error. Existing warnings remain; lint therefore does not meet the required zero-error/no-new-warning gate. |
| final `git diff --check` | 0 | passed | 0.1198419 s | No output. |

The initial focused Electron failure was addressed by the required safe build preparation and rerun, rather than being treated as a command-not-found exemption. The later full Electron command still cannot be accepted: it did not execute any tests. The completed `build:unpack` result is valid, but it does not cure the full-E2E parser failure or lint errors.

## Watcher contract verification

The fresh focused results verify both repaired watcher contracts:

- An external edit immediately after auto-save is surfaced to safe reload/conflict handling and is not silently overwritten by a later save.
- Rapid queued/concurrent own-save events do not create a false external-change event and retain the latest pending save.

This is consistent with the authoritative disk-outcome [P0 evidence](../../marktext-bug-audit-execution/evidence/02-p0-autosave-external-overwrite.md) and queued/concurrent [watcher evidence](../../marktext-bug-audit-execution/evidence/02-p2-queued-own-save-event-order.md). It is not an authorization to alter either accepted repair.

## Frozen matrix and real-Windows evidence

The complete frozen matrix and its dispositions were rechecked through the [remediation specification](../../marktext-bug-remediation/spec.md), [audit execution map](../../marktext-bug-audit-execution/map.md), Ticket 04 [performance/configuration evidence](../../marktext-bug-audit-execution/evidence/04-w4-w5-results.md), and final [real-Windows M1–M5 evidence](../../marktext-bug-audit-execution/evidence/05-real-windows-integration-results.md).

M1–M5 were **not rerun in this acceptance attempt**. The existing procedures require user-operated native dialogs, clipboard, and drag/drop; unattended replay here would not preserve their documented disk/profile/application-state oracles. The authoritative prior manual evidence remains sufficient to establish the completed matrix's historical results, but does not substitute for the mandatory fresh full-E2E command, which failed before execution. M1, M2, M3 local-image drag/drop, and M4 passed in the prior controlled Windows run; M3 bitmap paste and M5 raw missing-Pandoc localization remain separately confirmed P2s.

## Preserved exceptions, observations, and deferrals

- Pandoc conversion remains **unavailable**: Pandoc was not installed. Only its safe missing-dependency path was tested.
- macOS, Linux, native display scaling, and other unrun configurations remain **untested**.
- The three confirmed P2s remain deferred without implementation authorization: [find navigation intermittency](../../marktext-bug-audit-execution/evidence/02-p2-find-navigation-intermittent.md), [bitmap-paste persistence](../../marktext-bug-audit-execution/evidence/05-p2-bitmap-paste-persistence.md), and [missing-Pandoc localization](../../marktext-bug-audit-execution/evidence/05-p2-missing-pandoc-localization.md).
- Historical Electron harness/environment/input/capture limitations remain historical limitations, not passing product evidence. In particular, the present full-E2E parser failure is a current acceptance failure.
- F4 source-mode round trip remains a non-defect performance observation (about 6.5–6.9 s versus about 0.1 s for F2, within the declared 10 s bound) and its baseline record is retained.

## Classification and closure decision

**Serious unresolved product issue:** none newly found. The two accepted watcher repairs remain accepted, and no deferred P2 was repaired or promoted.

**Closure blockers (acceptance/infrastructure):**

1. `pnpm test:e2e` exited 1 before executing tests because of the Playwright parser error at `test/e2e/audit-large-boundaries.spec.ts:97`.
2. `pnpm lint` exited 1 with 11 errors and 131 warnings; the mandatory lint gate requires zero errors and no new warnings.

The policy for minor maintenance issues does not waive Ticket 02's explicit full-command and build gates. This ticket does not change product code, test code, generated results, or configurations to clear those blockers.

**Closure: blocked.** Ticket 02 remains unresolved. Required follow-up is to correct the full-E2E parser/lint gate failures in a separately authorized maintenance change, then rerun and record the affected mandatory acceptance commands before reconsidering closure.
