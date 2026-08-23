# Ticket 01 final Standards + Spec review evidence

**Review fixed point:** `b88c21a3d4aab0a352986492208db5fa1b5fa52f`

**Diff reviewed:** `git diff b88c21a3d4aab0a352986492208db5fa1b5fa52f...HEAD`

**Commit range reviewed:** `git log --oneline b88c21a3d4aab0a352986492208db5fa1b5fa52f..HEAD` (25 commits; non-empty)
**Review boundary:** independent closure gate only; not Ticket 02 acceptance and not product implementation.

The fixed point resolved successfully and the three-point diff was non-empty. This review used independent Standards and Spec axes. It inspected the complete frozen audit matrix/frontier, the current remediation handoff, all cited candidate records, and accepted watcher history `26b09ea6` and `6e4b113c`. Those repairs remain accepted historical work and are not reopened.

## Standards

**Standards: accepted**

**Serious blocker:** none

Evidence reviewed: [repository instructions](../../../AGENTS.md), [editor settings](../../../.editorconfig), developer [README](../../../packages/website/content/docs/dev/README.md), [TypeScript](../../../packages/website/content/docs/dev/TYPESCRIPT.md) and [IPC](../../../packages/website/content/docs/dev/IPC.md) conventions, root and desktop package scripts, watcher/IPC/save changes, watcher unit and Electron regressions, and the P0/queued-save evidence plus Ticket 02A review.

The reviewed diff has no documented-standard violation. The byte-hash save contract and per-window/per-path watcher serialization remain typed and traceable; the IPC contract changes stay within the documented typed bridge conventions. Focused watcher unit cases cover matching and external bytes, queued/out-of-order saves, and concurrent reads; Electron cases cover the user-visible post-auto-save and queued-event behaviour. `26b09ea6` and `6e4b113c` are locally recorded atomic repair/review-remediation history, with no push performed for this review.

**Findings:** none. There is no serious, minor, or deferred Standards finding. The review also found no applicable smell-baseline judgement call. The existing watcher callback typing exception is documented in `TYPESCRIPT.md` and was not introduced by this batch.

The three P2 records (find navigation, bitmap paste persistence, and missing-Pandoc localization) remain deferred/non-ticketed. Baselines, performance observations, automation/capture limitations, and unavailable or untested platforms remain non-product scope.

## Spec

**Spec: accepted**

**Serious blocker:** none

Evidence reviewed: [originating audit specification](../../marktext-bug-audit/spec.md), [current remediation specification](../../marktext-bug-remediation/spec.md), [frozen audit map](../../marktext-bug-audit-execution/map.md), all three deferred-P2 records, P0 and queued/concurrent watcher records, Ticket 02A, and the reviewed three-point diff.

The frozen register is complete and correctly records five confirmed product defects: two repaired/accepted (`26b09ea6`, `6e4b113c`), three individually deferred P2s, and zero open/authorized repairs. The watcher regressions remain traceable: an external write following auto-save is forwarded to safe reload/conflict handling rather than overwritten later, and queued/concurrent own-save events retain the latest pending save without false external-change handling. The diff creates no repair or authorization for a deferred P2 and preserves the required two closure gates.

Pandoc conversion remains unavailable while its safe missing-dependency path is recorded; macOS, Linux, native display scaling, and other unrun configurations remain untested. Earlier input/capture limitations remain environmental historical records. These exclusions accurately follow the originating specification.

**Findings:** none. There is no serious, minor, or deferred Spec finding newly raised.

## Independent review controls

| Command | Actual outcome | Review treatment |
| --- | --- | --- |
| `git diff --check` | **Passed** — exit 0, no output. | Formatting control is clean. |
| `pnpm --filter marktext exec vitest run test/unit/specs/watcher-ignore-change.spec.ts` | **Did not run tests** — exit 1: `'vitest' is not recognized as an internal or external command`; pnpm reported `Command "vitest" not found`. | Current dependency/execution-environment limitation; not reported as passing and not a product finding. |
| `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save|queued own-save events" --repeat-each=2` | **Did not run tests** — exit 1: `error: unknown command 'test'`; pnpm reported the command failed. | Current dependency/execution-environment limitation; not reported as passing and not a product finding. |

These controls support this independent review only. They do not substitute for Ticket 02's complete acceptance command set. Historical watcher evidence is retained as evidence and is not represented as a rerun in this review.

## Result

Both independent axes are accepted with no unresolved serious blocker. Ticket 01 is resolved. Ticket 02 is the current ready, unexecuted frontier for final batch acceptance/closure.
