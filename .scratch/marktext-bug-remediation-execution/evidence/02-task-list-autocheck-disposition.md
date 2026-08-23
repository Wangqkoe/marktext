# Ticket 02 task-list-autocheck disposition

**Date:** 2026-08-23 (America/Los_Angeles)

**Baseline:** `e6b2625c`
**Scope:** independent characterization and disposition of the separately recorded task-list-autocheck failure only. No product repair, source-mode work, Ticket 02 closure, or deferred-P2 work is authorized or performed here.

## Preparation and feedback loop

This worktree initially had no usable desktop package links or unpacked Electron output. Safe preparation used `pnpm install --force --frozen-lockfile --reporter=append-only` (exit 0, 2m 51.9s; lockfile unchanged), followed by `pnpm build:unpack` (exit 0; renderer build 30.66s; known dynamic-import warnings only). No non-task Electron or MarkText process was stopped.

The red-capable unattended loop is the existing real-Electron file `packages/desktop/test/e2e/task-list-autocheck.spec.ts`. It opens a fresh document/profile per worker, sends `mt::user-preference`, clicks the native rendered checkbox, asserts all three real checkbox `.checked` flags, enters/exits source mode through the real menu via `getMarkdownContent`, and asserts the exact checked-marker count. It can fail specifically at preference propagation/before-click baseline, click delivery, DOM cascade, Markdown/source oracle, or renderer-error assertion.

## Bounded results

| Command (run from `packages/desktop` unless noted) | Exit | Result | Duration | Failure layer / rate |
| --- | ---: | --- | ---: | --- |
| `pnpm exec playwright test test/e2e/task-list-autocheck.spec.ts --config=test/e2e/playwright.config.ts --repeat-each=50 --workers=8` | 0 | 100 passed (ON 50, OFF 50) | 58.0s | None; 0/100. The first direct background wrapper did not print its exit sentinel, but Playwright completed `100 passed` and the process exited normally. |
| `pnpm exec playwright test test/e2e/task-list-autocheck.spec.ts --config=test/e2e/playwright.config.ts --repeat-each=30 --workers=1` | 0 | 60 passed (ON 30, OFF 30) | 1.9m | None; 0/60. Explicit wrapper sentinel: `__EXIT=0`. |
| `pnpm exec playwright test test/e2e/task-list-autocheck.spec.ts --config=test/e2e/playwright.config.ts --grep "autoCheck ON" --repeat-each=50 --workers=8` | 0 | 50 passed | 1.0m | None; 0/50. Explicit `__EXIT=0`. |
| `pnpm exec playwright test test/e2e/task-list-autocheck.spec.ts --config=test/e2e/playwright.config.ts --grep "autoCheck OFF" --repeat-each=50 --workers=8` | 0 | 50 passed | 1.4m | None; 0/50. Explicit `__EXIT=0`. |
| `pnpm exec vitest run src/block/gfm/taskListCheckbox/__tests__/parityAutoCheck.spec.ts` (from `packages/muya`) | 0 | 1 file, 4 passed | 5.02s | None; 0/4. Covers ON descendant cascade, ancestor re-derivation, OFF non-cascade, and serialization. |
| `pnpm --dir packages/desktop exec playwright test test/e2e/task-list-autocheck.spec.ts --config=test/e2e/playwright.config.ts` | 0 | 2 passed | 5.8s | Final default-control run; none; 0/2. |

The combined bounded Electron sample is **262 passed / 0 failed** (100 parallel mixed + 60 serial mixed + 50 isolated ON + 50 isolated OFF + 2 final control). It exercised 131 ON and 131 OFF cases. The serial run preserved the actual ON-to-OFF ordering, shared `beforeAll` application, and `reloadFixture` reset in every one of its 30 groups. No debug probe was added: no run became red, so an intrusive temporary interface/probe would not discriminate a failure layer. `rg -n "\\[DEBUG-02-task-list\\]" packages` returned no matches.

## Falsifiable hypotheses and outcome

| Rank | Hypothesis and prediction | Evidence and disposition |
| --- | --- | --- |
| H2 | If the fixed 200ms preference wait is unreliable under load, then an ON run will sometimes click before `autoCheck` reaches Muya, leaving descendants unchecked. | **Not reproduced.** The most stressful ON-only loop passed 50/50 and the mixed 8-worker loop passed its further 50 ON cases. This does not prove the 200ms convention is universally sufficient, but provides no current defect signal. |
| H3 | If `beforeAll`/shared app state or `reloadFixture` is incomplete, isolated tests will be stable but sequential mixed groups will fail, especially OFF after ON. | **Not reproduced.** The one-worker mixed loop passed 30 exact ON→OFF groups; isolated ON and OFF also passed 50/50 each. |
| H4 | If the Muya cascade has an intermittent product defect, confirmed preference/click runs will still produce wrong descendant flags or Markdown, and the closest unit seam may reproduce it. | **Not reproduced.** The real-Electron assertions remained green in 262 cases and parityAutoCheck passed 4/4. No minimal Electron or unit repro exists. |
| H5 | If Electron/Playwright pressure fails to deliver real clicks, parent `.checked` will occasionally remain false before cascade/Markdown assertions. | **Not reproduced.** Every real-click parent, DOM, Markdown, and renderer-error assertion passed under 8-worker and serial load. |
| H1 | If the old failure was a source-mode stale-store neighbor symptom, checkbox/cascade state would be correct but the source/Markdown oracle would be stale; current source-entry flush would remove that condition. | **Not established.** `getMarkdownContent` is part of the oracle and is green now, but no historical precise assertion or red sample exists for task-list. The source-mode repair's later green full run is correlation only, not duplicate proof. |

## Disposition

**Classification:** historical single-run inconclusive / automation-or-environment observation, **not a confirmed product bug** and **not a confirmed source-mode duplicate**. The earlier full-E2E report recorded a separate task-list failure but retained no precise failing assertion. The required bounded loops and unit control did not reproduce it, so there is no severe or P2/P3 product issue, no minimal repro, and no authorized product repair.

**Severity and stability:** non-blocking; current tested Windows/Electron stability is 262/262 E2E and 4/4 unit. This is deliberately not a claim that the root cause is known, that all platforms pass, or that a future intermittent failure is impossible.

**Ticket impact:** Ticket 02 remains unresolved pending its final acceptance rerun, but task-list-autocheck is no longer its blocker frontier. The next frontier is the prescribed final acceptance rerun. Existing macOS/Linux/native-scaling/Pandoc boundaries and the deferred P2 records (find navigation, bitmap paste persistence, missing-Pandoc localization) are unchanged.
