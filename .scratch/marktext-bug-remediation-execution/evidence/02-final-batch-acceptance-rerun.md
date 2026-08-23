# Ticket 02 final batch acceptance rerun

**Date:** 2026-08-23 (America/Los_Angeles)
**Acceptance baseline:** `95c464f4`
**Scope:** fresh final acceptance only. No product or test code, deferred P2 work, release artifact, or remote push was authorized or performed.

## Start gate and environment

Ticket 01 remains independently resolved with **Standards: accepted**, **Spec: accepted**, and no serious unresolved finding. The accepted watcher repairs `26b09ea6` and `6e4b113c` were not reopened. The source-mode entry repair `33395878` remains independently accepted on both axes, and the task-list-autocheck record remains a non-blocking historical single-run inconclusive automation/environment observation (262/262 bounded Electron and 4/4 Muya controls), not a product defect or source-mode duplicate.

This worktree initially lacked usable package links. `pnpm install --force --frozen-lockfile --reporter=append-only` was used as safe locked preparation. It populated the locked 2082-package workspace; `pnpm-lock.yaml` SHA-256 remained `5D714D163E5015C6B57EC2D11AD2858A8A8FE6C6A2FE186289A826039107C6C9`. The first required build correctly reported `tsx` unavailable before this preparation and was treated as an environment condition, not a product result. The successful production build below was completed before every Electron run and produced `packages/desktop/out/main/index.js`.

The only pre-existing worktree item was untracked `CONTEXT.md`; it was neither modified nor staged.

## Historical result separation

| Run | Result | Treatment |
| --- | --- | --- |
| Pre-repair Ticket 02 acceptance | **255 passed, 5 failed, 4 skipped** | Historical failed acceptance. Four failures were the later-repaired source-mode persistence defect; the separate task-list failure was subsequently characterized, not attributed to source mode. |
| Source repair verification | **261 passed, 4 skipped** | Historical post-repair verification, including a 30/30 source-mode pressure loop; not a substitute for this final rerun. |
| This final acceptance, baseline `95c464f4` | **261 passed, 4 skipped**, exit 0 | Fresh complete result used for this closure. |

## Fresh command record

Durations are wall-clock durations from this rerun. Counts are reported exactly as emitted; skipped work is not called passing.

| Exact command | Exit | Result | Duration | Necessary warning / note |
| --- | ---: | --- | ---: | --- |
| `git diff --check` | 0 | passed; no output | 0.114 s | Initial cleanliness control. |
| `pnpm build:unpack` | 0 | passed; unpacked `out/main/index.js` present | 34.6 s (renderer build 29.22 s) | Production build completed before Electron tests. |
| `pnpm --filter marktext exec vitest run test/unit/specs/watcher-ignore-change.spec.ts` | 0 | 1 file, **5 passed** | 19.720 s | Focused watcher contract. |
| `pnpm --filter marktext exec playwright test test/e2e/audit-document-integrity.spec.ts --grep "immediately after auto-save|queued own-save events" --repeat-each=2` | 0 | **4 passed** | 16.245 s | `NO_COLOR`/`FORCE_COLOR` Node notices only. Verifies no immediate post-auto-save overwrite and queued own-save handling. |
| `pnpm --filter marktext exec playwright test test/e2e/editor-input.spec.ts --grep=immediately --repeat-each=10 --workers=8` | 0 | **10 passed** | 22.006 s | Same color-environment notices only. Each result verifies source entry, source exit/save, disk bytes, and reopen. |
| `pnpm --filter marktext exec playwright test test/e2e/task-list-autocheck.spec.ts` | 0 | **2 passed** | 4.880 s | Default ON/OFF real-checkbox control; no attribution is made to source mode. |
| `pnpm test:unit` | 0 | 52 files, **772 passed; 1 skipped** | 18.185 s | Full unit suite. |
| `pnpm test:e2e` | 0 | **261 passed; 4 skipped** | 9m 00s | Full Electron suite; final log closed 01:42:51 after a 01:33:51 start. |
| `pnpm typecheck` | 0 | passed | 12.985 s | Full desktop `vue-tsc --noEmit`. |
| `pnpm lint` (first pass) | 1 | **1 error; 131 warnings** | 5.525 s | The only error was ignored generated `packages/desktop/test-results/.last-run.json` from this rerun, missing final EOL. It was not source/test work and was removed after verifying it was ignored and untracked. |
| `pnpm lint` (final) | 0 | **0 errors; 131 warnings** | 5.425 s | Warning count and file/rule inventory match the established 131-warning baseline; no new warning. Node's `MODULE_TYPELESS_PACKAGE_JSON` notice is an existing runtime notice. |
| final `git diff --check` | 0 | passed; no output | recorded after documentation update below | Final pre-commit formatting control. |

## Full E2E skips

The four full-suite skips are existing unavailable/not-applicable boundaries, not passes:

- `loose-list-toggle.spec.ts` — menu toggle of tight/loose list.
- `paragraph-blocks.spec.ts` — horizontal rule transform.
- `paragraph-blocks.spec.ts` — default insert-table dialog acceptance.
- `view-modes.spec.ts` — typewriter caret-centering/scrolling.

No full-suite failed test, crash, data-integrity regression, or persistence blocker occurred. The temporary ignored Playwright `.last-run.json` lint error is an environment/generated-result maintenance condition, not a product finding; the final lint gate is green after that exact generated file was removed.

## Frozen Windows matrix and limits

M1–M5 were **not rerun in this acceptance**: the source-mode repair changes neither native dialog, clipboard, nor drag-drop operation layers, and these real-Windows procedures require user-operated native controls. The authoritative frozen manual evidence remains [Ticket 05 real Windows integration results](../../marktext-bug-audit-execution/evidence/05-real-windows-integration-results.md): M1, M2, M3 local-image drag/drop, and M4 controls passed; M3 bitmap paste persistence and M5 raw missing-Pandoc localization are confirmed P2s and remain deferred by policy. Pandoc conversion itself remains **unavailable** because Pandoc is intentionally not installed; it is not reported as passing.

macOS, Linux, native display scaling, and the prior capture/input harness limitations remain untested or historical limitations, not passing coverage. The F4 performance observation/baseline is retained as a non-blocking observation. No statement here reclassifies or repairs those boundaries.

## Disposition and closure

- Deferred P2s remain exactly three: find-navigation intermittency, bitmap-paste persistence, and missing-Pandoc localization. None is authorized, repaired, or reopened.
- Accepted watcher repairs remain accepted and unreopened.
- Minor findings: none newly raised. The generated-result lint cleanup is non-product maintenance only.
- Serious findings/blockers: **none**.
- Open/authorized repairs: **0**. Future work on a deferred P2 requires separate authorization.

**Closure: accepted.** Every mandatory final acceptance gate is green on this fresh rerun; the frozen evidence, known limits, and deferred dispositions are preserved. No release or installer was built, and no commit was pushed.
