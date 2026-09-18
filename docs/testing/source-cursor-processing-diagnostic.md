# Source cursor processing diagnostic

Date: 2026-09-18

Baseline: `59351d00a85e484ae8ada6baefa24caf9c15b97c`

## Decision

Removing the full-document read and word count from `cursorActivity` is not enough to remove the
large-document delay. For the 9,309-line fixture, `getValue()` took about 1 ms and word counting
took about 6 ms per cursor movement, while `reportSource` and its synchronous downstream work took
about 105–123 ms. A cursor-only `reportSource(scope, { cursor })` still took about 104–106 ms.

The useful next candidate, if this area is changed, is to retain the latest Source cursor locally
and publish it only through an existing flush/handoff boundary. The composition already treats
Source scroll position this way. This diagnostic did not implement or validate that design.

## Method

- One full Electron production build from the fixed baseline plus temporary timing
  instrumentation.
- Two generated UTF-8 fixtures: 81 lines / 2,471 bytes and 9,309 lines / 626,129 bytes. The large
  fixture has headings, inline HTML, details blocks, links, comments, and a table.
- One fresh Electron application and user-data directory for each fixture/variant group.
- Three real trusted keyboard operations at a fixed visible position with no scrolling:
  `ArrowRight`, `Shift+ArrowRight`, and insertion of one character.
- Five unrecorded warmups and 30 recorded operations per action and group.
- Visible latency starts in the trusted `keydown` capture listener and ends on the first animation
  frame where the CodeMirror model and the current-line DOM caret, selection, or text agree.
- Synchronous timing splits `getValue`, cursor conversion, word count, `reportSource` plus its
  downstream synchronous work, the whole save, and the whole event handler. Nested component times
  are not added to event totals.

The three variants were:

- `baseline`: current production behavior.
- `skip-save`: retain the UI caret report but skip the workspace save from `cursorActivity`. This is
  an upper-bound intervention because workspace cursor synchronization is lost.
- `cursor-report`: report only the converted cursor through `reportSource`; this preserves workspace
  synchronization but avoids the full Markdown read and word count.

All medians and p95 values below describe repeated operations in one measurement session. They do
not establish between-session variance or a durable performance budget.

## Results

### 9,309-line fixture: visible response

| Action | Variant | Median | p95 |
| --- | --- | ---: | ---: |
| Arrow | baseline | 139.9 ms | 168.0 ms |
| Arrow | skip-save upper bound | 23.0 ms | 55.7 ms |
| Arrow | cursor-only report | 125.2 ms | 152.6 ms |
| Shift selection | baseline | 224.1 ms | 263.4 ms |
| Shift selection | skip-save upper bound | 103.7 ms | 170.0 ms |
| Shift selection | cursor-only report | 188.1 ms | 247.9 ms |
| Insert | baseline | 235.1 ms | 256.5 ms |
| Insert | skip-save upper bound | 258.7 ms | 376.7 ms |
| Insert | cursor-only report | 266.3 ms | 431.7 ms |

The cursor-only report improved the within-session Arrow median by 14.7 ms and Shift-selection
median by 36.0 ms relative to their separate baseline session. Insertion did not improve across
these independent sessions. The latter comparison is affected by variation in the one remaining
full `change` report and must not be read as a regression caused by the cursor intervention.

### 9,309-line fixture: synchronous processing medians

| Action / variant | Processing total | `getValue` | Word count | `reportSource` downstream |
| --- | ---: | ---: | ---: | ---: |
| Arrow / baseline | 119.5 ms | 1.0 ms | 5.7 ms | 112.9 ms |
| Arrow / cursor-only report | 104.4 ms | 0.0 ms | 0.0 ms | 104.4 ms |
| Shift selection / baseline | 129.7 ms | 1.0 ms | 6.3 ms | 122.7 ms |
| Shift selection / cursor-only report | 105.6 ms | 0.0 ms | 0.0 ms | 105.5 ms |
| Insert / baseline | 131.7 ms | 2.1 ms | 11.3 ms | 118.5 ms |
| Insert / cursor-only report | 143.8 ms | 1.1 ms | 6.4 ms | 136.6 ms |

A pure cursor movement emitted one `cursorActivity` event and one full save in the baseline. One
insert emitted one `change` and one `cursorActivity`, causing two full saves. In the baseline insert
sample, the `change` save had a 124.9 ms median, while the subsequent `cursorActivity` save had a
7.3 ms median because the document content was already current. Thus removing the duplicate cursor
save can save a few milliseconds for typing, but it does not address the full report required by
the actual content change.

### Small fixture control

On the 81-line fixture, baseline visible medians were 5.8 ms for Arrow, 5.8 ms for Shift selection,
and 8.1 ms for insertion. Baseline synchronous processing medians were 1.8 ms, 1.3 ms, and 1.7 ms.
This confirms that the measured path scales with document size and that the harness does not impose
the large-fixture delay by itself.

## Hypotheses

1. If the full-document read and word count dominate, the cursor-only report should remove most of
   the delay. Falsified: together they accounted for about 7 ms, while the candidate retained more
   than 100 ms of reporting work.
2. If workspace publication dominates, the cursor-only report will remain expensive, while skipping
   workspace publication will remove most of the Arrow delay. Supported for pure cursor movement.
3. If cursor rendering and selection layout are also material, skip-save will leave more cost for
   Shift selection than for Arrow. Supported: the skip-save medians were 103.7 ms and 23.0 ms,
   respectively.

## Limits

- This was one bounded measurement run on one machine.
- Each group used a fresh application profile, so differences between variant groups include session
  variation. The internal call split gives the stronger attribution signal.
- No 50k-line run was performed because the 9,309-line result was already decisive.
- Shared-history and multi-pane paths were not exercised.
- The instrumentation and interventions were diagnostic only and were removed from the final product
  source.

Raw results and the generated summary are stored in
`E:\Program Files\Marktext-performance-evidence\2026-09-18-source-cursor\`.

## Reproduction

From the repository root, apply
`docs/testing/source-cursor-processing-instrumentation.patch`, build the desktop application, then
run:

```powershell
$env:MARKTEXT_SOURCE_CURSOR_PERF = '1'
$env:MARKTEXT_SOURCE_CURSOR_PERF_OUT = 'E:\Program Files\Marktext-performance-evidence\2026-09-18-source-cursor\raw'
$env:MARKTEXT_SOURCE_CURSOR_PERF_REPETITIONS = '30'
pnpm --filter marktext exec playwright test --config=test/e2e/playwright.config.ts test/e2e/source-cursor-perf.spec.ts
node packages/desktop/test/e2e/source-cursor-perf-analyze.cjs `
  'E:\Program Files\Marktext-performance-evidence\2026-09-18-source-cursor\raw\all-results.json' `
  'E:\Program Files\Marktext-performance-evidence\2026-09-18-source-cursor\summary.json'
```

The final branch leaves the product source uninstrumented. The patch is intentionally retained only
as a diagnostic artifact.
