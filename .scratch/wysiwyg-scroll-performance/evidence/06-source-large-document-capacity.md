# Ticket 06: Source large-document capacity investigation

- Status: completed investigation after independent-review repair; no production fix
- Baseline: `1de76b8751d6d1c615235e794f1a99d7cbe4c122`
- Branch: `codex/wysiwyg-scroll-06-source-investigation-repair`
- Recorded: 2026-09-06 America/Los_Angeles (`2026-09-07T06:40:37.914Z`)
- Application/runtime: MarkText `0.20.0-rc.1`, local production Electron build, Electron `42.1.0`, Node `v24.18.0`, pnpm `10.33.4`
- Machine: Windows 11 Pro `10.0.26200`, Intel Core i7-10700 (8 cores/16 logical processors), 32 GiB RAM, x64
- Measured renderer geometry in all six trials: window outer size `1216x808`, layout and visual viewport `1200x800`, Source container client box `1188x746`, device scale factor `1`
- Durable artifacts: [reproduction harness](../source-large-document-capacity.cjs) and [raw results](06-source-large-document-capacity.raw.json)

## Outcome

Source at a 10,000-line disk fixture is **usable but degraded (P2/moderate)**. All three isolated-profile trials entered Source and accepted a first real keyboard input. Source surface creation took a median 3.68 s, the renderer-observed first `keydown` to visible first-line DOM update took a median 159 ms, renderer working set after Source creation was a median 742 MiB, and the scroll probe contained 16/60, 38/60, and 29/60 gaps over 50 ms.

Source at a 50,000-line disk fixture is **unavailable for ordinary interactive use (P1/high capacity defect)**. Source surface creation took 22.14-24.03 s, the first input update took 569-933 ms, focus/cursor preparation before that input took 1.40-2.18 s, renderer working set after Source creation was 2.18-2.62 GiB, and the three scroll probes contained 59/60, 60/60, and 60/60 gaps over 50 ms. All trials completed without a renderer crash or observed data loss, so this is not P0.

The investigation confirms a stable Source scale problem and observes full CodeMirror line materialization, large renderer-memory growth, slow first interaction, and slow scrolling together. It does **not** establish which of materialization, whole-document processing, style/layout/paint, or garbage collection is the dominant cause. The measurements therefore support correlation and capacity severity, not the prior claim that materialization/layout is a confirmed bottleneck or that virtualization is already the selected repair seam.

The Source probe does not execute the WYSIWYG scroll-to-workspace report handler. The two problems remain separate under the Scroll Performance Contract; this evidence does not support a shared runtime scrolling engine.

## Fixture and method

The harness generates UTF-8/LF files with exactly N nonblank lines. Every line whose one-based number is `1 mod 100` is a unique ATX H1; every other line is unique fixed-shape plain text. This gives a representative 1% heading mix without images, diagrams, math, or unusually long lines.

| Disk fixture |     Bytes | Headings | Body lines | SHA-256                                                            |
| ------------ | --------: | -------: | ---------: | ------------------------------------------------------------------ |
| 10,000 lines |   776,900 |      100 |      9,900 | `8d7a4d0903a787926d979af4f2082155134cb631bc7b6827c14cad141dc95dfd` |
| 50,000 lines | 3,884,500 |      500 |     49,500 | `cb6d15f95facb7396b6fa010ba0cc9c6ab13890e10e8e72a61132be46d2beeeb` |

One OS-temporary fixture directory was created for the harness run and contained one generated file per scale; all three trials at a scale opened that same immutable generated file. Each trial used a new `--user-data-dir`, so no existing MarkText profile or user document was opened. The raw artifact records the harness-run fixture-directory basename, fixture filename for every trial, and trial-scoped profile basename. The production renderer was built first, and each scale ran three times.

The harness measured in this order:

1. process launch through populated WYSIWYG readiness;
2. idle requestAnimationFrame cadence and process memory before Source;
3. Source menu activation through a live CodeMirror surface;
4. the first real Playwright keyboard input, before any environment, DOM, memory, cadence, or scroll sampling;
5. actual window, layout viewport, visual viewport, Source container, and CodeMirror geometry;
6. CodeMirror/DOM materialization counts and Electron process memory;
7. Source idle cadence and 60 requestAnimationFrame-driven outer-container scroll steps; and
8. a diagnostic-only, post-materialization `viewportMargin=10` structural probe followed only by a DOM recount.

For first-input readiness, the harness focuses CodeMirror, positions the cursor at the first line, arms a renderer-side listener and DOM observer, and then issues one real Playwright `keydown`. It records three separate values: focus/cursor preparation, Playwright driver round-trip, and renderer `keydown` to visible first-line DOM mutation. Only the last value is reported as input-to-visible readiness. Raw ordering timestamps prove that this first input precedes environment, materialization, memory, cadence, and scroll sampling.

The harness does not request or assume a viewport size. All six trials independently measured the same `1216x808` window outer size, `1200x800` layout/visual viewport, and `1188x746` Source container client box. The former `1280x720` claim was unsupported hard-coded metadata and has been removed; these measurements do not use it.

Reproduce from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter marktext build
node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs
```

Launch was bounded at 45 s, editor readiness at 45 s, Source surface creation at 120 s, first input at 20 s, and scrolling at 30 s. A timeout would be retained as a capacity result. The local Playwright-driven Electron renderer was visible to the document (`document.visibilityState="visible"`); the run did not use an installed package or physical input. Its pre-Source requestAnimationFrame median was about 32.6-33.0 ms. The fixed 50 ms classification remained useful for the 50k active-scroll comparison: pre-Source samples had zero or one gap over 50 ms, while the active 50k probes had 59-60 such gaps out of 60.

Opening the disk fixture through the production WYSIWYG path caused the Source value to contain exactly two additional lines per heading: 10,200 and 51,000 CodeMirror lines. The investigation reports both disk fixture scale and actual Source scale. Baseline `viewportMargin` is serialized explicitly as `"Infinity"` in the repaired raw artifact.

## Results

| Measure                                  | 10k trial 1 | 10k trial 2 | 10k trial 3 | 50k trial 1 | 50k trial 2 | 50k trial 3 |
| ---------------------------------------- | ----------: | ----------: | ----------: | ----------: | ----------: | ----------: |
| Open through WYSIWYG ready (ms)          |       4,332 |       4,702 |       4,559 |      22,221 |      32,137 |      35,756 |
| Source surface creation (ms)             |       4,231 |       3,553 |       3,678 |      24,025 |      22,138 |      23,213 |
| First-input preparation (ms)             |           4 |         266 |         321 |       1,397 |       1,396 |       2,182 |
| First `keydown` to visible update (ms)   |         159 |         151 |         197 |         879 |         569 |         933 |
| Playwright input round-trip (ms)         |         293 |         249 |         297 |       1,977 |       1,532 |       2,712 |
| Actual CodeMirror lines                  |      10,200 |      10,200 |      10,200 |      51,000 |      51,000 |      51,000 |
| Rendered `.CodeMirror-line` nodes        |      10,200 |      10,200 |      10,200 |      51,000 |      51,000 |      51,000 |
| Total DOM elements                       |      73,116 |      73,116 |      73,116 |     363,516 |     363,516 |     363,516 |
| Renderer working set before Source (MiB) |         489 |         439 |         461 |         932 |         780 |         800 |
| Renderer working set after Source (MiB)  |         675 |         742 |         782 |       2,228 |       2,231 |       2,681 |
| Renderer working-set increase (MiB)      |         187 |         303 |         321 |       1,297 |       1,450 |       1,881 |
| Source idle median gap (ms)              |        32.7 |        32.9 |        33.0 |        64.5 |        33.0 |        98.2 |
| Source idle gaps >50 ms                  |        4/40 |        5/40 |        4/40 |        7/13 |        7/15 |         7/9 |
| Scroll probe elapsed (ms)                |       2,475 |       3,432 |       3,014 |      22,584 |      15,413 |      21,533 |
| Scroll median gap (ms)                   |        32.9 |        65.5 |        35.5 |       362.1 |       260.6 |       327.9 |
| Scroll gaps >50 ms                       |       16/60 |       38/60 |       29/60 |       59/60 |       60/60 |       60/60 |

All 60 requested positions were applied in every trial; the observed scroll problem is response cadence, not an incorrect final scroll range. Source idle also shows substantial long gaps at 50k, so active scroll is not the only slow state.

Electron did not close within the harness's 15 s courtesy bound after any trial. The harness terminated only each exact Electron process tree, and the raw artifact retained each immediate profile-lock cleanup failure. After the full run, process inspection found zero benchmark Electron processes. The six exact trial profile directories were then individually resolved under the OS temporary root, validated by their generated prefix, and deleted; the single harness fixture directory had already been deleted. This cleanup behavior is lifecycle pressure to retain as a recorded limitation, not evidence for a Source root cause.

## Evidence classification

### Confirmed

- The 50k capacity defect is stable across three independent profiles: compared with 10k, all trials show much slower WYSIWYG readiness, Source surface creation, first interaction, and scrolling, together with much higher renderer working set. The observed user impact supports P1/high at 50k and P2/moderate at 10k.
- At the sampled post-input point, `sourceCode.vue` is configured with `viewportMargin: Infinity`; `.source-code` owns `overflow:auto`; `.CodeMirror` has `height:auto`; and rendered line count exactly equals actual CodeMirror line count at both scales. This confirms full materialization at those sampled points and near-linear DOM-count growth. It does not establish that materialization is the dominant latency cause.
- The repaired first-input probe measures the first real keyboard event after the CodeMirror surface appears, before later DOM, memory, cadence, or scroll sampling. Renderer event-to-visible time and preparation/driver costs all increase at 50k.
- WYSIWYG readiness itself also scales: its median rises from 4.56 s at 10k to 32.14 s at 50k before Source is requested. Source then adds a separate median 23.21 s transition. Total time-to-use therefore includes both pre-Source and Source costs.
- Source direct scrolling uses the outer `.source-code` container and has no native scroll listener that reports positions to workspace. It does not execute the confirmed WYSIWYG scroll-report causal chain.

### Ruled out or narrowed

- Cold start as the sole explanation: scale separation repeats across three new profiles per scale, despite timing variability within each scale.
- A silent renderer crash as the primary capacity limit: all six trials reached Source, accepted a visible input, and completed all 60 scroll positions.
- A post-materialization `viewportMargin` option flip as a one-step repair: changing only the option to `10` after full materialization leaves all 10,200 or 51,000 rendered lines in place. This result says nothing about a correctly integrated pre-construction finite viewport.
- The former `1280x720` environment description: the script never requested that size, and all repaired trials measured different window, viewport, and container dimensions.

### Remaining unknown

- No causal intervention or performance trace separates CodeMirror construction/materialization, whole-document Source processing, style/layout/paint, and garbage collection during Source entry or scrolling. Their relative contributions and any dominant bottleneck remain unknown.
- The first-input path includes CodeMirror focus/cursor activity and production `change`/`cursorActivity` handling. The repaired probe separates preparation, renderer event-to-visible time, and driver round-trip, but it does not partition `getValue`, cursor derivation, word count, workspace reporting, CodeMirror display work, layout, or GC.
- The WYSIWYG readiness measurement does not partition filesystem read, Markdown parsing, Muya model construction, rendering, heading normalization, or host scheduling.
- The finite viewport probe occurs after full materialization and is structural only. It neither estimates a virtualization benefit nor selects a CodeMirror-owned viewport as the repair seam.
- Direct requestAnimationFrame-driven scroll positions isolate renderer capacity but do not establish mouse-wheel, touchpad, or scrollbar-thumb behavior.
- These local Windows production-build results do not establish installed-package, Linux, or macOS behavior. Process working set is not a heap allocation profile, and host load was not controlled beyond per-trial profile isolation and pre-Source cadence recording.

## Smallest next step and follow-up boundary

A user-visible Source capacity repair specification is warranted by the reproducible P1 impact, but this investigation does not yet warrant an implementation choice. The smallest next diagnostic step is a bounded Source-entry and first-input main-thread profile at 10k and 50k that attributes scripting, style/layout/paint, and GC, followed by one disposable pre-construction intervention that changes only the highest-cost confirmed factor. The intervention must run before CodeMirror constructs the document and must improve the same Source-entry, readiness, memory, and scroll measures before maintainers select a production seam.

The eventual repair specification should require calibrated user-visible outcomes rather than prescribe virtualization in advance:

- 10k and 50k fixtures enter Source within explicit bounds on the reference machine, with 50k no longer taking tens of seconds.
- First `keydown` to visible update and wheel/thumb scrolling meet calibrated responsiveness thresholds without a capacity timeout.
- Renderer-memory growth stays within a defined delta from pre-Source state and does not approach the measured 2+ GiB working sets.
- TOC navigation, cursor placement, selection, undo/redo, external reload scroll preservation, Source/WYSIWYG transitions, saving, and exact Markdown round-trip remain correct.
- No new WYSIWYG behavior, shared scroll engine, custom wheel physics, persistence semantics, or unrelated renderer refactor is in scope.

This ticket supplies severity, reproducibility, corrected environment and readiness measurements, and bounded causal limits. It does not implement a production fix and does not preselect a virtualization or whole-document-processing repair.
