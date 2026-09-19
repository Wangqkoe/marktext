# Source UI clone timing (2026-09-19)

Baseline: `22972132975e54127a564f77dfd6d306cb8f3854`. This is a measurement only; no product behavior was changed. The diagnostic used the existing 9,309-line, 626,129-byte Source fixture, one newly opened document and one tab. In one production-build Electron session it sent 5 warmup and 15 recorded trusted `x` keypresses. Each key inserted exactly one character, and CodeMirror and workspace markdown agreed; cleanup deletion ran outside the timed window. Scope assertions required one `APPLY_WORKSPACE_PROJECTION` and one markdown `reportSource` per recorded key. The source history serialized to 90 UTF-8 bytes both before and after the run.

The temporary production probe is saved as [source-ui-clone-instrumentation.patch](source-ui-clone-instrumentation.patch), but was removed from the final product source and build. Reproduction from the baseline: `git apply docs/testing/source-ui-clone-instrumentation.patch`, `pnpm --filter marktext build`, then set `MARKTEXT_SOURCE_UI_CLONE_TIMING_OUT` to an absolute output JSON path and run `pnpm --filter marktext exec playwright test --config=test/e2e/playwright.config.ts test/e2e/source-cursor-response-perf.spec.ts --grep 'Source UI clone timing' --workers=1`. Reverse the patch and rebuild afterward. The raw result is `E:/Program Files/Marktext-performance-evidence/2026-09-19-ui-clone/source-ui-clone-raw.json` (SHA-256 `e5e4d0f1caac372bcd3578af94e1f94f5b2f218c3f8936bacebff58f437e37b5`). The run output was `1 passed (46.9s)`; typecheck and both instrumented and restored production builds succeeded.

| Per recorded insert (ms) | Median | p95 | Calls/key |
| --- | ---: | ---: | ---: |
| `APPLY_WORKSPACE_PROJECTION` overall | 123.1 | 145.0 | 1 |
| Snapshot deepClone / freeze | 4.0 / 0.3 | 5.5 / 0.5 | 1 each |
| Projection deepClone / freeze | 0.4 / 0.1 | 0.6 / 0.2 | 1 each |
| Tab fields deepClone / freeze | — | — | 16 fields each |
| Current-file fields deepClone / freeze | — | — | 16 fields each |
| All tab + current-file field deepClone / freeze | 5.2 / 0.2 | 6.3 / 0.4 | 32 each |
| Non-overlapping deepClone total / freeze total | 9.8 / 0.6 | 12.3 / 0.9 | 34 each |
| Non-overlapping clone + freeze total | 10.7 | 13.0 | 68 spans |
| Markdown `reportSource` overall | 128.3 | 151.3 | 1 |
| Cursor-only `reportSource` overall | 0.0 | 0.1 | 1 |
| Trusted keydown to visible frame | 254.8 | 304.7 | 1 |

Tab/current-file markdown deepClone medians were 2.1/2.5 ms (p95 3.2/3.5); history deepClone was at timer resolution (~0 ms). The per-sample non-overlapping clone+freeze total was a median 8.40% of `APPLY_WORKSPACE_PROJECTION` and 8.01% of markdown `reportSource` (p95 9.99% and 9.56%). The predeclared interpretation was to compare this share of synchronous markdown-report time, not impose an arbitrary speed pass/fail threshold. In this fixture, UI clone+freeze is measurable but not the main synchronous cost.

All `performance.now()` intervals are synchronous elapsed time, not strict CPU self-time. `APPLY_WORKSPACE_PROJECTION` is inside markdown `reportSource`, and clone/freeze spans are inside `APPLY_WORKSPACE_PROJECTION`; these inclusive parents must not be added to their children. The visible-frame metric includes scheduling/rendering and is only experiential context. Out-of-window snapshot reads and size checks between samples may affect GC/cache state, so this is not an A/B comparison with earlier latency runs. The result does not establish the share for multiple tabs or larger portable history. The diagnosing-bugs feedback loop was the trusted-key test; fix and green-regression phases did not apply because the request was measurement only.
