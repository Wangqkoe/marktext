# Ticket 06: Source large-document capacity investigation

- Status: completed investigation; no production fix
- Baseline: `27fb95338bffb0d0eb692ec32d1a8c4423809629`
- Branch: `codex/wysiwyg-scroll-06-source-investigation`
- Recorded: 2026-09-06 America/Los_Angeles (`2026-09-07T05:49:54.019Z`)
- Application/runtime: MarkText `0.20.0-rc.1`, local production Electron build, Electron `42.1.0`, Node `v24.18.0`, pnpm `10.33.4`
- Machine: Windows 11 Pro `10.0.26200`, Intel Core i7-10700 (8 cores/16 logical processors), 32 GiB RAM, x64, headless 1280x720 renderer
- Durable artifacts: [reproduction harness](../source-large-document-capacity.cjs) and [raw results](06-source-large-document-capacity.raw.json)

## Outcome

Source at a 10,000-line disk fixture is **usable but degraded (P2/moderate)**. All three fresh-profile trials entered Source and accepted visible input, but Source entry took a median 3.16 s, visible input took a median 189 ms, renderer working set rose to a median 762 MiB, and the scroll probe contained 11/60, 16/60, and 33/60 frame gaps over 50 ms.

Source at a 50,000-line disk fixture is **unavailable for ordinary interactive use (P1/high capacity defect)**. Source entry took 20.31-27.09 s, visible input took 1.06-1.72 s, renderer working set after Source entry was 2.08-2.51 GiB, and both completed scroll trials had 60/60 gaps over 50 ms. The third trial hit the explicit 30 s scroll-probe capacity limit before completing 60 requested animation frames. There was no renderer crash or observed data loss, so this is not P0.

The confirmed bottleneck is independent of WYSIWYG scroll reporting. Source fully materializes every CodeMirror line under an outer scrolling element and has no native scroll-to-workspace report handler. The evidence does not support a shared runtime scrolling engine.

## Fixture and method

The harness generates UTF-8/LF files with exactly N nonblank lines. Every line whose one-based number is `1 mod 100` is a unique ATX H1; every other line is unique fixed-shape plain text. This gives a representative 1% heading mix without images, diagrams, math, or unusually long lines.

| Disk fixture |     Bytes | Headings | Body lines | SHA-256                                                            |
| ------------ | --------: | -------: | ---------: | ------------------------------------------------------------------ |
| 10,000 lines |   776,900 |      100 |      9,900 | `8d7a4d0903a787926d979af4f2082155134cb631bc7b6827c14cad141dc95dfd` |
| 50,000 lines | 3,884,500 |      500 |     49,500 | `cb6d15f95facb7396b6fa010ba0cc9c6ab13890e10e8e72a61132be46d2beeeb` |

Each trial used a new OS-temporary fixture directory and a new `--user-data-dir`; no existing MarkText profile or user document was opened. The checked-out production renderer was built first. Each scale ran three times. The harness separately measured:

1. process launch through populated WYSIWYG readiness;
2. idle requestAnimationFrame cadence before Source;
3. Source menu activation through a live CodeMirror instance;
4. CodeMirror and DOM materialization counts plus Electron process memory;
5. one real keyboard insertion at the first visible line through visible CodeMirror text;
6. 60 requestAnimationFrame-driven outer-container scroll steps; and
7. a diagnostic-only `viewportMargin=10` intervention, followed by recounting and repeat input/scroll probes.

Reproduce from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter marktext build
node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs
```

Launch was bounded at 45 s, editor readiness at 45 s, Source entry at 120 s, input at 20 s, and scrolling at 30 s. A timeout is retained as a capacity result. The headless renderer's idle cadence was about 31-33 ms rather than 16.7 ms; nevertheless the fixed 50 ms classification remained discriminating because each 1.5 s pre-Source idle sample had only one gap over 50 ms.

Opening the disk fixture through the production WYSIWYG path caused the Source value to contain exactly two additional lines per heading: 10,200 and 51,000 CodeMirror lines. The investigation reports both disk fixture scale and actual Source scale rather than hiding this normalization. In the raw JSON, the baseline `viewportMargin` appears as `null` because JavaScript JSON serialization converts numeric `Infinity` to `null`; the production source and harness establish that this baseline value was `Infinity`, and future harness runs serialize it explicitly as `"Infinity"`.

## Results

| Measure                                  | 10k trial 1 | 10k trial 2 | 10k trial 3 | 50k trial 1 | 50k trial 2 |     50k trial 3 |
| ---------------------------------------- | ----------: | ----------: | ----------: | ----------: | ----------: | --------------: |
| Open through WYSIWYG ready (ms)          |       5,975 |       4,118 |       3,829 |      21,550 |      25,616 |          20,839 |
| Enter Source (ms)                        |       4,400 |       3,157 |       3,108 |      20,308 |      27,086 |          22,335 |
| Actual CodeMirror lines                  |      10,200 |      10,200 |      10,200 |      51,000 |      51,000 |          51,000 |
| Rendered `.CodeMirror-line` nodes        |      10,200 |      10,200 |      10,200 |      51,000 |      51,000 |          51,000 |
| Total DOM elements                       |      73,117 |      73,117 |      73,117 |     363,517 |     363,517 |         363,517 |
| Renderer working set before Source (MiB) |         443 |         464 |         464 |         750 |         796 |             792 |
| Renderer working set after Source (MiB)  |         731 |         766 |         762 |       2,570 |       2,128 |           2,133 |
| Input to visible update (ms)             |         189 |         193 |         177 |       1,057 |       1,720 |           1,381 |
| Source idle median gap (ms)              |        31.2 |        31.2 |        31.2 |        33.0 |        32.6 |            32.6 |
| Scroll probe elapsed (ms)                |       2,559 |       3,127 |       2,333 |      14,528 |      16,494 | >30,000 timeout |
| Scroll median gap (ms)                   |        31.4 |        62.1 |        31.3 |       230.2 |       260.0 |         timeout |
| Scroll gaps >50 ms                       |       16/60 |       33/60 |       11/60 |       60/60 |       60/60 |         timeout |

All requested positions were applied in each completed probe; the failure is response cadence, not an incorrect final scroll range. Source idle itself also degraded at 50k: 5-6 gaps over 50 ms per roughly 1.5 s sample, compared with one at pre-Source idle.

Electron did not close within the harness's 15 s courtesy bound after these extreme DOM trials, so the harness terminated only its own exact process tree. The Windows profile lock then outlived the immediate delete attempt; this cleanup limitation is retained in every raw trial. After all measurements, process inspection found no old benchmark process, and the seven exact benchmark directories (under 5 MiB total) were deleted. It does not affect the recorded timings, but it is additional lifecycle pressure worth rechecking in a repair specification.

## Causal account

### Confirmed

- `sourceCode.vue` configures CodeMirror 5 with `viewportMargin: Infinity`; CSS gives `.source-code` `overflow:auto` while `.CodeMirror` is `height:auto`. The measured result is exact full-line DOM materialization at both scales: 10,200/10,200 and 51,000/51,000 rendered lines, with DOM and memory growing approximately linearly.
- Changing only `viewportMargin` to 10 at runtime did not remove any rendered line in any completed intervention. With the current outer-scroll/auto-height ownership, a one-option change is not a viable repair and does not establish working virtualization.
- The 50k renderer added roughly 1.3-1.8 GiB working set on Source entry and every completed scroll frame exceeded 50 ms. This directly ties the capacity failure to Source materialization/layout scale.
- Document loading and WYSIWYG construction also scale: median readiness increased from 4.12 s at 10k to 21.55 s at 50k before Source was requested. Source then imposed a separate median 22.33 s transition, so neither file I/O alone nor Source alone accounts for total time-to-use.
- Source has no native scroll listener that reports scroll position to workspace. The WYSIWYG handler is in `editor.vue`; the Source probe exercises `.source-code`. The Source failure therefore does not share the confirmed WYSIWYG scroll-report causal chain.

### Ruled out

- Cold start alone: the problem repeated across three fresh profiles at each scale, while exact timings varied but scale separation persisted.
- Page height alone with otherwise idle rendering: pre-Source and Source idle cadence are far better than the active 50k scroll cadence, and all 50k active-scroll samples exceeded 50 ms.
- A silent crash as the primary limit: all three 50k trials reached Source and accepted visible input; the failure is extreme latency/capacity, including one explicit bounded scroll timeout.
- `viewportMargin: Infinity` as an isolated flag that can simply become `10`: the intervention left all DOM lines materialized because scrolling and height ownership also need to change.

### Remaining uncertainty

- The single-key input probe is consistent with another whole-document path: each `change` and `cursorActivity` calls `getValue`, derives cursor context, computes whole-document word count, and reports Source state. This likely contributes to the 5-9x input-latency increase, but no safe diagnostic intervention disabled those pieces separately, so their individual costs are not proven.
- The benchmark does not partition WYSIWYG readiness among filesystem read, Markdown parse, Muya model construction, rendering, and heading normalization.
- The probe used deterministic direct scroll positions on animation frames, not physical mouse-wheel, touchpad, or scrollbar-thumb input. This is appropriate for isolating renderer capacity but does not establish physical-input behavior.
- Headless Windows results do not establish installed-package, Linux, or macOS performance. Peak memory samples are process working sets, not heap attribution profiles.
- The finite viewport intervention occurred after full materialization and did not recover virtualization, so it does not quantify the benefit of a correctly integrated CodeMirror-owned viewport.

## Smallest promising remediation seam

Create a bounded Source-capacity specification around `sourceCode.vue` and the existing `sourceModeToc`/scroll-preservation adapters. Its first prototype should give CodeMirror ownership of a finite-height scrolling viewport (or an equivalent editor-native virtualization seam), retain a finite viewport margin, and adapt Source TOC jump and scroll restoration to that owner. It must prove that rendered line nodes stay bounded independently of document length before any production migration.

In a separate measured step, profile Source change handling and remove only confirmed redundant full-document work from the input-critical path. Do not combine this with WYSIWYG scroll commits or create a universal scroll runtime.

Recommended user-visible acceptance for the follow-up specification:

- 10k and 50k fixtures enter Source within explicit, calibrated bounds on the reference machine, with 50k no longer spending tens of seconds in Source entry.
- Rendered Source line/DOM count remains viewport-bounded rather than proportional to total lines.
- Renderer memory stays within a defined delta from pre-Source state and does not approach the measured 2+ GiB working set at 50k.
- A visible character edit and wheel/thumb scrolling remain responsive under calibrated latency/frame-gap thresholds, with no bounded-timeout result.
- TOC navigation, cursor placement, selection, undo/redo, external reload scroll preservation, Source/WYSIWYG transitions, saving, and exact Markdown round-trip remain correct.
- No new WYSIWYG behavior, shared scroll engine, custom wheel physics, persistence semantics, or unrelated renderer refactor is in scope.

This evidence warrants that follow-up repair specification. It does not warrant an implementation choice beyond the bounded Source scroll/viewport seam, and this ticket makes no production change.
