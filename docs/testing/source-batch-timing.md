# Source CodeMirror `changes` batching: diagnostic timing

This is a measurement, not a product change. Baseline: `1dde81b11f1f84d4d848f5138e9b7b954e792e6f`. The product listener remains `change` after this run. The only candidate difference was that the same `saveContent` call was made from CodeMirror's operation-level `changes` event instead of each `change` event. No timer, debounce, deferred Markdown synchronization, or other product optimization was introduced.

The [diagnostic test](../../packages/desktop/test/e2e/source-batch-timing.spec.ts) uses the same synthetic document generator as `source-cursor-response-perf.spec.ts`, with hard assertions for 9309 lines and 626129 UTF-8 bytes. It launches an isolated temporary Electron profile, enters Source mode, presses real trusted `x` and `Tab` keys, and times keydown-to-visible text via `requestAnimationFrame`. The Tab command acts on a 20-line selection. Each variant/action had two warmups and five recorded repetitions in one session. The test checked CodeMirror and workspace Markdown after the edit, undo, redo, and final undo. All checks passed. The temporary instrumentation and A/B listener switch are preserved as [a reproducible patch](source-batch-probe.patch); they were removed from the product tree afterward, followed by a successful uninstrumented build.

| Trusted action | Listener | `change` / `changes` events | `saveContent` / `reportSource` calls | Markdown revision change | Median visible latency | Median cumulative `saveContent` | Median per-sample `saveContent − reportSource` |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Single `x` | `change` | 1 / 1 | 1 / 1 | 1 | 351.7 ms | 177.9 ms | 11.3 ms |
| Single `x` | `changes` | 1 / 1 | 1 / 1 | 1 | 268.2 ms | 153.3 ms | 7.8 ms |
| 20-line `Tab` | `change` | 12 / 1 | 12 / 12 | 1 | 332.4 ms | 222.1 ms | 92.6 ms |
| 20-line `Tab` | `changes` | 12 / 1 | 1 / 1 | 1 | 261.2 ms | 152.7 ms | 8.4 ms |

The counts above were the same in all five recorded repetitions of each group. `reportSource` returned `applied` at its boundary, but this is **not** a count of document commits or UI rebuilds: the document revision rose only once per key action in both variants. The revision column measures Markdown version changes, not internal APPLY operations. The `saveContent − reportSource` figure subtracts the nested report span *within each sample before taking the median*; its 92.6-to-8.4 ms decrease on Tab is direct evidence that repeated Markdown/cursor extraction and word-count work was removed. Cumulative `reportSource` itself was not faster in the candidate (129.8 ms baseline versus 143.2 ms candidate for Tab), so the result does not support a claim of faster report application.

For the batch action, this single controlled session observed a 71.2 ms (about 21%) lower median visible latency and 69.4 ms less cumulative `saveContent` time. This is not a guaranteed or stability-tested 21% gain. Single-character typing produced one `change` and one `changes` event either way, hence no batching mechanism to improve it; its observed 351.7-to-268.2 ms difference is confounded by fixed A-then-B order and runtime variation and must not be attributed to `changes`. The useful scope of the candidate is multi-change user operations such as selection indentation, not ordinary typing. We did not fabricate multi-`replaceRange` operations or test an unreliable batch-replace UI path.

Raw evidence is at `E:/Program Files/Marktext-performance-evidence/2026-09-19-source-batch/ab-valid.json`. An earlier `ab.json` is **invalid and excluded**: a copied generator omitted `</details>` and one blank line per entry, producing 8709 lines / 622529 bytes. It prompted the fixed fixture assertions and a complete replacement run; none of its timings enter the table.

To reproduce from the stated baseline, run these commands from the repository root (PowerShell):

```powershell
git apply docs/testing/source-batch-probe.patch
pnpm --filter marktext build
Push-Location packages/desktop
$env:MARKTEXT_SOURCE_BATCH_OUT = 'E:\Program Files\Marktext-performance-evidence\2026-09-19-source-batch\replica.json'
pnpm exec playwright test --config=test/e2e/playwright.config.ts test/e2e/source-batch-timing.spec.ts --reporter=line
Pop-Location
```

The diagnostic patch is temporary and must be reversed before any normal build or product work. Only the test, patch artifact, and this report are retained in the local repository; nothing was pushed.
