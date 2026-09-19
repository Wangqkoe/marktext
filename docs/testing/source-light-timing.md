# Source lightweight-display diagnostic, 2026-09-19

This is a bounded measurement, not a product change or an accepted optimization. It compares CodeMirror 5 Source construction with the current options against disabling **only** `styleActiveLine` or **only** `lineWrapping`. Line numbers, `markdown-math` syntax mode and `viewportMargin: Infinity` remain enabled. The diagnostic hook is archived as [source-light-instrumentation.patch](source-light-instrumentation.patch) and is **not** present in the final product source.

## Setup and signal

- Base commit: `1dde81b11f1f84d4d848f5138e9b7b954e792e6f`; local worktree/branch: `codex/source-light-measure`. Production `electron-vite build`, real Electron and Playwright trusted key/wheel events. A separate app/profile/Source construction was used for each variant, never `setOption` after construction.
- Fixture is the same generated document as `source-cursor-response-perf.spec.ts`: 9,309 CodeMirror lines, 626,129 UTF-8 bytes, 300 report entries plus 300 table rows. The test asserts these sizes, the effective options, CodeMirror/workspace markdown equality before and after, and visible cursor/selection/text after trusted `ArrowRight`, `Shift+ArrowRight` and `x`. Inserts are removed between samples.
- Three warmups and ten recorded samples per key action. Key latency starts at the renderer's trusted `keydown` capture and ends on the first `requestAnimationFrame` poll finding the expected model state and visible cursor/selection/text. Thus it is *keydown-to-visible-state poll*, not a hardware-to-photon latency. The key target is line 2, a short line; long-line editing under no-wrap was **not** tested.
- Source-ready has **one observation per variant**: from a renderer timestamp just before the test invokes the Source menu action, through menu IPC, CodeMirror creation, exact fixture value becoming available and two `requestAnimationFrame` callbacks. It includes test/menu dispatch overhead; one observation cannot establish a stable entry-time speedup.
- Wheel is a separate small probe: trusted `page.mouse.wheel(0, 500)` over `.source-code`, from trusted wheel event to the first animation-frame observation of a larger outer `.source-code.scrollTop`. It is **first scrollTop-change latency**, not continuous scrolling frame rate, completion of a whole scroll gesture, or long-frame incidence. The first off-wrap process timed out this outer-container probe and produced no result file; a bounded second process passed, with all 10 recorded wheel samples moving the outer scrollTop from 0 to 500. The transient cause and CodeMirror inner scroller were not inspected; this does not establish a scrolling regression.

## Results (milliseconds)

Values are median of 10 recorded samples; `p95` here is the largest of 10 (nearest-rank). The one-shot Source-ready value is shown without a percentile. Raw JSON is in `E:/Program Files/Marktext-performance-evidence/2026-09-19-source-light/`.

| Variant | Effective wrap / active | Source ready once | Arrow median / p95 | Shift-selection median / p95 | Insert median / p95 | Wheel first-change median / p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| baseline | on / on | 2799.9 | 28.75 / 47.9 | 100.2 / 127.2 | 250.4 / 362.8 | 58.45 / 78.4 |
| off-active | on / off | 3768.5 | 33.85 / 47.3 | 35.8 / 53.6 | 297.3 / 370.0 | 68.75 / 89.7 |
| off-wrap | off / on | 2944.9 | 23.75 / 36.1 | 126.35 / 151.0 | 327.0 / 414.2 | 103.1 / 234.4 |

The off-active group showed a substantially lower shift-selection median in this run, but arrow/insert did not improve. Off-wrap showed no consistent key-response gain and a slower insert median. The measurements do **not** justify a general Source performance improvement claim for either option. Source-ready observations are especially too sparse to infer causality. A more controlled repeated-session experiment would be needed before a product decision, but was intentionally outside this bounded diagnostic.

Disabling wrapping changes reading behavior: long lines require horizontal scrolling and can be harder to follow. This experiment does not accept that tradeoff. TOC navigation, RTL text and full feature behavior were not validated, so neither intervention is a product proposal. No viewport virtualization, CodeMirror 6 migration, `content-visibility`, line-number removal or syntax-highlighting removal was attempted.

## Reproduction and cleanup

From the worktree root, apply the archived diagnostic-only patch to the base source, build, then run one variant per command in isolation:

```powershell
git apply docs/testing/source-light-instrumentation.patch
pnpm --filter marktext typecheck
pnpm --filter marktext build
$env:MARKTEXT_SOURCE_LIGHT_VARIANT='baseline'
$env:MARKTEXT_SOURCE_LIGHT_OUT='E:/Program Files/Marktext-performance-evidence/2026-09-19-source-light/baseline.json'
pnpm --filter marktext exec playwright test --config=test/e2e/playwright.config.ts test/e2e/source-light-timing.spec.ts --workers=1
```

Repeat the last three lines with `off-active` and `off-wrap` and corresponding output names. The three formal runs passed except that the first off-wrap run failed only in the wheel assertion; the final diagnostic test records an outer-wheel no-change as `latencyMs: null` and exits that segment, preserving key evidence. We performed one bounded off-wrap rerun with this behavior; it passed. After measurement, remove only the diagnostic hook and rebuild without it. The committed test and patch are reproduction assets, not an enabled production setting.
