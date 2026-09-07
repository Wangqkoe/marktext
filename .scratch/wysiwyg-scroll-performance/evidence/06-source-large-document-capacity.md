# Ticket 06: Source large-document capacity investigation

- Status: **investigating**; automated causal work complete, physical scrollbar-thumb validation pending manual execution
- Required starting baseline and measured HEAD: `175cf2e5e4a45b8c574a2b097725e5eb6a575976`
- Branch: `codex/wysiwyg-scroll-06-source-investigation-repair-2`
- Timing matrix recorded: 2026-09-07 America/Los_Angeles (`2026-09-07T08:05:30.454Z`)
- Paired CPU profile recorded: 2026-09-07 America/Los_Angeles (`2026-09-07T08:31:57.262Z`)
- Application/runtime: MarkText `0.20.0-rc.1`, local production Electron build, Electron `42.1.0`, Node `v24.18.0`, pnpm `10.33.4`
- Machine: Windows 11 Pro `10.0.26200`, Intel Core i7-10700, 16 logical processors, 32 GiB RAM, x64
- Measured geometry in every completed trial: window outer `1216x808`, layout/visual viewport `1200x800`, device scale factor `1`, Source container client box `1188x746`
- Durable artifacts: [harness](../source-large-document-capacity.cjs), [timing/intervention raw results](06-source-large-document-capacity.raw.json), and [paired CPU-profile raw results](06-source-large-document-capacity.profile.raw.json)

## Outcome

The production Source path at a 10,000-line disk fixture is **usable but degraded (P2/moderate)**. Across three isolated baselines, the median populated-WYSIWYG open was 3.84 s and the independently measured Source-trigger-to-first-accepted-and-visible-input readiness was 3.91 s. The first trusted `keydown` to visible mutation median was 119 ms. The median renderer working-set increase was 314 MiB. Real Playwright wheel input moved the Source surface, but eight 600 px pulses took a median 1.40 s.

The production Source path at a 50,000-line disk fixture is **unavailable for ordinary interactive use (P1/high capacity defect)**. The median populated-WYSIWYG open was 23.02 s and the separate Source-trigger-to-first-accepted-and-visible readiness was 24.82 s. The first trusted `keydown` to visible mutation median was 599 ms. The median renderer working-set increase was 1,511 MiB and the median post-input working set was 2,268 MiB. Eight real wheel pulses took a median 7.36 s. Every baseline completed without a renderer crash or observed data loss, so this is not P0.

The investigation now has a causal account rather than a correlation-only account:

1. Changing only `viewportMargin` from `Infinity` to `10` in a CodeMirror initialization hook did not change full materialization or readiness at either scale.
2. Holding that finite margin constant and changing only CodeMirror height/viewport ownership reduced 50k rendered Source lines from 51,000 to 27, Source readiness from the 24.82 s baseline median to 12.30 s, Source-entry layout-plus-style time from a 8.13 s baseline median to 1.75 s, renderer working-set growth from a 1,511 MiB median to 386 MiB, and eight-wheel-pulse time from 7.36 s to 0.90 s.
3. In a separate 50k CPU-profile pair, CodeMirror `updateHeightsInViewport` fell from 5.233 s of Source-entry self samples to 0.031 s under the bounded viewport intervention. The remaining dominant named function was Muya `InlineRenderer._collectReferenceDefinitions`, at 5.071 s in baseline and 4.079 s under the intervention.
4. Removing the production Source `change` and `cursorActivity` handlers before the first real 50k keydown reduced renderer keydown-to-visible time from a 599 ms baseline median to 288 ms, keydown-to-observed-CodeMirror-change from 113 ms to 24 ms, input task time from 1.405 s to 0.854 s, and input `ScriptDuration` from 0.448 s to 0.303 s. Those handlers are an important input cost, not the Source-entry cause.

The smallest promising remediation boundary is therefore two explicit seams, not an assumed universal scroll engine: Source layout/viewport ownership in `sourceCode.vue`, and the full-state reference-definition collection called by `InlineRenderer.patch`. A production proposal must preserve Source scroll/TOC/cursor semantics and must prove whether reference definitions can be cached or collected once per document update. The disposable interventions do not themselves constitute a production fix.

The ticket remains open because this environment cannot credibly convert protocol-generated pointer events into evidence about a human physically grabbing the OS/Chromium scrollbar thumb. That row is marked **Unavailable / Pending manual** below; it is not reported as passed.

## Pre-registered falsifiable hypotheses

The hypotheses were recorded before the interventions and retained in both raw artifacts.

| ID  | Prediction                                                                                                                                                                               | Result                                                                                                                                                                                                                                | Evidence classification                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| H1  | If full-height CodeMirror materialization dominates Source entry, a pre-commit finite viewport policy will sharply reduce readiness, rendered nodes, memory, and wheel cost.             | Partly confirmed and narrowed. Finite margin alone was inert; finite margin plus fixed viewport ownership produced the predicted large reductions.                                                                                    | Observed intervention; causal inference is limited to the combined Source layout policy. |
| H2  | If Source `change`/`cursorActivity` full-text synchronization dominates first input, removing those handlers before the first keydown will sharply reduce input latency and script time. | Confirmed as an important secondary input cost: 50k visible latency fell 52%, change observation 79%, task time 39%, and script time 32%. It did not materially reduce Source-entry time.                                             | Observed intervention.                                                                   |
| H3  | If style/layout dominates, `LayoutDuration + RecalcStyleDuration` will exceed `ScriptDuration` and scale from 10k to 50k.                                                                | Confirmed for the classified DevTools counters: baseline median layout+style grew from 1.68 s to 8.13 s. CPU profiling additionally identified CodeMirror height updates and DOM primitives. A larger residual task category remains. | Observed profile/counters; residual attribution remains partly unknown.                  |
| H4  | If disk loading/initial Markdown parsing dominates total time-to-use, pre-Source readiness will account for most scale growth; otherwise Source-local work will remain separately large. | Disk/open work and Source work are both large: medians are 23.02 s and 24.82 s at 50k. Source timing begins only after populated WYSIWYG plus cadence sampling, so its cost is not disk read or initial open parsing.                 | Observed stage boundary; detailed pre-Source parsing partition remains unknown.          |

## Fixture, isolation, and measurement method

Each UTF-8/LF fixture contains exactly N nonblank lines. Every line whose one-based number is `1 mod 100` is a unique ATX H1; every other line is unique fixed-shape plain text. There are no images, diagrams, math blocks, or unusually long lines.

| Disk fixture |     Bytes | Headings | Body lines | SHA-256                                                            |
| ------------ | --------: | -------: | ---------: | ------------------------------------------------------------------ |
| 10,000 lines |   776,900 |      100 |      9,900 | `8d7a4d0903a787926d979af4f2082155134cb631bc7b6827c14cad141dc95dfd` |
| 50,000 lines | 3,884,500 |      500 |     49,500 | `cb6d15f95facb7396b6fa010ba0cc9c6ab13890e10e8e72a61132be46d2beeeb` |

Every trial created a unique OS-temporary root containing one uniquely named fixture and one uniquely named `--user-data-dir`. No fixture, profile, or trial root was reused. The raw results retain every basename, fixture digest, build and measurement commands, exact baseline SHA, application/runtime, OS build, CPU/RAM, measured viewport, timeout, and cleanup result.

The production timing matrix ran, per scale, three baseline trials and one trial for each intervention:

- `finite-viewport-init-hook`: before Source construction completes, set CodeMirror `viewportMargin` to `10` while retaining production `height:auto` and outer `.source-code` scrolling;
- `finite-viewport-plus-fixed-height`: hold the first intervention constant and add a trial-only `height:100%`, moving the live viewport to the CodeMirror scroller; and
- `without-source-sync-handlers`: after Source mounts but before cursor preparation and the first keydown, remove the one production `change` and one production `cursorActivity` listener, then attach the measurement listener.

No production source, preference, or user data was changed by any intervention.

### Readiness boundary

Before the Source command, the harness installs a renderer `MutationObserver`, an optional CodeMirror init hook, and the readiness state. One **single 150,000 ms total deadline** begins immediately before invoking the real Source menu command. It covers Source component creation, CodeMirror construction, focus/cursor preparation, the first `page.keyboard.press`, CodeMirror change-state observation, and visible first-line DOM mutation. The primary readiness value ends only when both the CodeMirror value and visible line contain the typed marker. Renderer evidence retains the trusted `keydown`, change timestamp, visible timestamp, and accepted state separately.

The pre-Source phase likewise has one **120,000 ms total deadline** from Electron launch through a populated WYSIWYG editor; it is not two serial 45 s waits described as one 45 s limit. Other explicit bounds are 30,000 ms for wheel, 15,000 ms for courtesy close, 15,000 ms for post-kill process exit, and ten deletion attempts separated by 500 ms.

### Main-thread attribution

Chromium DevTools Performance counters were differenced separately around Source entry and first input. They retain `TaskDuration`, `ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`, `ThreadTime`, and layout/style counts. The paired 50k diagnostic artifact additionally uses the DevTools V8 CPU profiler at a 1,000 µs interval in separate Source-entry and first-input windows; raw samples are aggregated by call frame.

`TaskDuration - ScriptDuration - LayoutDuration - RecalcStyleDuration` is reported as an unclassified renderer-task residual, not mislabeled as paint or garbage collection. CPU-profile `(garbage collector)` samples are retained separately. The profile is used for attribution, not for acceptance timing, because profiling adds overhead.

### Commands

```powershell
pnpm install --frozen-lockfile
pnpm --filter marktext build
node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs
node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs --cpu-profile --profile-pair
```

## Baseline timing matrix

| Measure                                              | 10k T1 | 10k T2 | 10k T3 |  50k T1 |  50k T2 |  50k T3 |
| ---------------------------------------------------- | -----: | -----: | -----: | ------: | ------: | ------: |
| Launch → populated WYSIWYG (ms)                      |  3,837 |  4,103 |  3,793 |  23,016 |  22,465 |  23,963 |
| Source trigger → input armed (ms)                    |  3,257 |  3,584 |  3,403 |  21,522 |  23,114 |  21,861 |
| Source trigger → first accepted + visible (ms)       |  3,721 |  4,024 |  3,909 |  24,481 |  25,987 |  24,818 |
| Renderer `keydown` → CodeMirror change observed (ms) |     37 |     23 |     23 |     138 |     100 |     113 |
| Renderer `keydown` → visible mutation (ms)           |    154 |    119 |    112 |     636 |     550 |     599 |
| Actual CodeMirror lines                              | 10,200 | 10,200 | 10,200 |  51,000 |  51,000 |  51,000 |
| Rendered `.CodeMirror-line` nodes                    | 10,200 | 10,200 | 10,200 |  51,000 |  51,000 |  51,000 |
| Total DOM elements                                   | 73,116 | 73,116 | 73,116 | 363,516 | 363,516 | 363,516 |
| Renderer working set before Source (MiB)             |    447 |    443 |    460 |     748 |     757 |     795 |
| Renderer working set after first input (MiB)         |    761 |    756 |    784 |   3,058 |   2,268 |   2,208 |
| Renderer working-set increase (MiB)                  |    314 |    313 |    324 |   2,310 |   1,511 |   1,413 |
| Source-entry task time (s)                           |  3.453 |  3.785 |  3.683 |  22.774 |  24.107 |  23.027 |
| Source-entry layout + style time (s)                 |  1.468 |  1.675 |  1.689 |   8.129 |   8.463 |   7.920 |
| Source-entry unclassified task residual (s)          |  1.984 |  2.109 |  1.993 |  14.643 |  15.642 |  15.105 |
| First wheel → first moved scroll (ms)                |     75 |     83 |     93 |     422 |     271 |     423 |
| Eight wheel pulses elapsed (ms)                      |  1,189 |  1,396 |  1,398 |   7,252 |   9,294 |   7,357 |

Opening through the production WYSIWYG path adds two Source lines per heading, hence 10,200 and 51,000 actual CodeMirror lines. Every wheel trial observed 8/8 renderer wheel events with `isTrusted=true`, 8 scroll events, and movement from `scrollTop=0` to `4800`; the defect is response latency rather than inability to reach a new offset.

## Causal intervention results

| Scale / variant                    | Source → accepted + visible | Rendered Source lines | Total DOM | Renderer WS after input |  WS delta | Source task | Layout + style | Wheel first move | 8 pulses |
| ---------------------------------- | --------------------------: | --------------------: | --------: | ----------------------: | --------: | ----------: | -------------: | ---------------: | -------: |
| 10k baseline median                |                    3,909 ms |                10,200 |    73,116 |                 761 MiB |   314 MiB |     3.683 s |        1.675 s |            83 ms | 1,396 ms |
| 10k finite margin only             |                    4,297 ms |                10,200 |    73,116 |                 798 MiB |   350 MiB |     3.977 s |        1.764 s |            88 ms | 1,241 ms |
| 10k finite margin + fixed viewport |                    1,434 ms |                    27 |    21,954 |                 456 MiB |    -7 MiB |     1.348 s |        0.402 s |            36 ms |   746 ms |
| 50k baseline median                |                   24,818 ms |                51,000 |   363,516 |               2,268 MiB | 1,511 MiB |    23.027 s |        8.129 s |           422 ms | 7,357 ms |
| 50k finite margin only             |                   25,028 ms |                51,000 |   363,516 |               2,261 MiB | 1,481 MiB |    23.194 s |        8.324 s |           301 ms | 7,167 ms |
| 50k finite margin + fixed viewport |                   12,303 ms |                    27 |   107,154 |               1,248 MiB |   386 MiB |    11.768 s |        1.751 s |            90 ms |   895 ms |

The finite-margin-only result rules out a one-option production repair. CodeMirror has `viewportMargin=10`, but production `height:auto` makes its visible height approximately the full document, so all lines remain in its viewport. The fixed-height comparison changes the viewport ownership while holding the finite margin constant; it proves that the current full-height/outer-scroll policy is a major cause. It is not direct approval to replace the production scroll owner because Source TOC, cursor placement, external reload scroll preservation, and saved view state currently use the outer container.

### CPU profile: dominant named Source-entry work

| 50k Source-entry profile                                        |          Baseline | Finite margin + fixed viewport |
| --------------------------------------------------------------- | ----------------: | -----------------------------: |
| Source trigger → accepted + visible                             |         27,302 ms |                      11,527 ms |
| Source-entry profile window                                     |         25,285 ms |                      11,177 ms |
| `CodeMirror.updateHeightsInViewport` self samples               |  5,233 ms (20.7%) |                   31 ms (0.3%) |
| `Muya InlineRenderer._collectReferenceDefinitions` self samples |  5,071 ms (20.1%) |               4,079 ms (36.5%) |
| Named DOM primitive self samples                                | at least 2,816 ms |                at least 635 ms |
| Garbage-collector self samples                                  |            690 ms |                         379 ms |

`updateHeightsInViewport` is the largest named baseline function and disappears when full materialization is removed. `_collectReferenceDefinitions` becomes the largest named residual. Code inspection shows every `InlineRenderer.patch` calls `_collectReferenceDefinitions`, which recursively scans the whole Muya JSON state before tokenizing the block. The profile proves that this full-state scan is active during the Source-entry window and costs about 4–5 s at 50k. It does not yet prove whether the safe repair is caching, invalidation, or avoiding WYSIWYG patches during mode handoff.

### First-input handler intervention

| Scale | Baseline median `keydown` → change | No-handlers | Baseline median `keydown` → visible | No-handlers | Baseline input task | No-handlers | Baseline input script | No-handlers |
| ----- | ---------------------------------: | ----------: | ----------------------------------: | ----------: | ------------------: | ----------: | --------------------: | ----------: |
| 10k   |                              23 ms |       10 ms |                              119 ms |       75 ms |             0.190 s |     0.128 s |               0.067 s |     0.051 s |
| 50k   |                             113 ms |       24 ms |                              599 ms |      288 ms |             1.405 s |     0.854 s |               0.448 s |     0.303 s |

The intervention removed exactly one production `change` and one `cursorActivity` handler. Source-entry time remained baseline-like (4.30 s at 10k; 23.82 s at 50k), so these handlers do not explain construction. They do explain a material portion of first-input delay. The production handlers call `getMarkdownAndCursor`, `getValue`, `getWordCount`, and `composition.reportSource`; the profiler retains `wordCount` and CodeMirror display work in the first-input window. A production repair must retain document synchronization and status correctness rather than simply removing the handlers.

## Real wheel and pending physical thumb

The harness points at the visible Source surface and dispatches eight `page.mouse.wheel(0, 600)` inputs. It records each renderer `wheel` event, `event.isTrusted`, the actual active scroll target, scroll events, first movement, final offset, and driver elapsed time. Production uses the outer `.source-code` container; the disposable fixed-viewport intervention uses the CodeMirror scroller. All 96 timing-matrix wheel inputs were observed as trusted and every trial moved the applicable scroll target.

**Physical scrollbar thumb: Unavailable / Pending manual.** Playwright/CDP-generated pointer input cannot prove behavior of a physical mouse interacting with the OS/Chromium thumb on this host. Execute and attach the following before closing the ticket:

1. Run the same production build and open a generated 10k fixture in a fresh profile.
2. Enter Source and wait until the first typed character is visibly accepted.
3. With a physical mouse, grab the Source vertical scrollbar thumb, drag to approximately 50%, then the bottom, then the top.
4. Record continuous thumb tracking, visible content tracking, longest apparent freeze, final reachability, any crash, and any lost input.
5. Repeat three times, then repeat all steps for 50k.
6. Attach OS build, display scale, viewport, physical input device, and a timestamped screen recording.

## Cleanup evidence

Ten of twelve timing trials did not close inside the 15 s courtesy bound. For each, the harness discovered the exact seven-PID Electron tree through `Win32_Process`, captured the `taskkill.exe /PID <root> /T /F` result, required exit status `0`, and polled every discovered PID until none existed. All ten forced kills returned `0` and all PID polls passed. Their profile directories encountered immediate EPERM once and were removed on bounded attempt 2. The two handler-intervention trials closed normally and their profiles were removed on attempt 1. Every fixture and trial root was verified absent. The paired CPU-profile trials followed the same verified cleanup path.

If process verification or any bounded deletion fails, the raw result records `abort-before-next-trial`, retains the uniquely isolated temporary root, and the harness throws before starting another trial. No failed cleanup occurred in these runs.

## Evidence classification

### Observed

- The 50k defect repeats across three isolated production profiles in both pre-Source and Source-only stages.
- Production Source fully materializes all 10,200/51,000 CodeMirror lines and grows DOM, memory, first-input latency, and wheel latency with scale.
- Finite `viewportMargin` alone is inert under `height:auto`; finite margin plus a bounded CodeMirror viewport halves 50k Source readiness, removes nearly all Source line nodes, reduces layout/style work by about 78%, and sharply reduces memory and wheel cost.
- The largest named baseline Source-entry CPU function is CodeMirror `updateHeightsInViewport`; the largest named residual after bounded materialization is Muya `_collectReferenceDefinitions`.
- Production Source synchronization handlers materially increase first-input latency but do not cause Source construction latency.
- Source-only timing begins after populated WYSIWYG readiness and therefore excludes initial disk reading/open parsing. Pre-Source and Source-only medians are independently large at 50k.
- The production Source path does not execute the WYSIWYG scroll-to-workspace report handler; Source wheel events target its own outer container.

### Inference

- The current full-height CodeMirror/outer-scroll materialization policy is a confirmed major Source-entry cause, but not the sole cause.
- The next Source repair design should prototype a finite CodeMirror viewport behind the existing Source scroll/TOC interface, rather than treating `viewportMargin` as a standalone fix or creating a shared scroll engine.
- The residual 4–5 s full-state reference-definition scan supports a second, independent seam at `InlineRenderer.patch`/reference-definition invalidation. It warrants a focused correctness-preserving prototype before implementation selection.
- P1/high at 50k and P2/moderate at 10k follow from repeatable time-to-use, input, wheel, and memory impact rather than a crash or data-loss claim.

### Unknown / not accepted

- Whether a production finite viewport can preserve outer Source scroll state, TOC navigation, cursor/selection placement, external reload restoration, undo/redo, and exact Markdown round-trip without changing semantics.
- Whether `_collectReferenceDefinitions` should be cached, invalidated once per document update, or avoided during Source handoff; the profile names the work but does not prove the safe design.
- The remaining DevTools unclassified task time is not partitioned into paint, browser-native DOM work, and other engine work. GC is sampled but not a dominant named function.
- Initial filesystem read, Markdown-to-Muya parsing, model construction, and first WYSIWYG rendering remain grouped inside the pre-Source phase.
- Physical scrollbar-thumb behavior is pending manual validation. Installed-package, Linux, and macOS behavior are also unmeasured.

## Follow-up repair boundary

A repair specification is warranted, but production implementation remains out of this investigation. The smallest evidence-supported sequence is:

1. Prototype finite Source materialization at the `sourceCode.vue` layout/scroll-owner seam while keeping one authoritative live/committed scroll position and all existing Source behaviors.
2. Add a focused Muya benchmark proving how often `_collectReferenceDefinitions` runs during Source handoff, then test one correctness-preserving cache/invalidation or skip boundary.
3. Coalesce Source content/status reporting without weakening shared-document, dirty-state, word-count, cursor, history, or save semantics.
4. Run the pending physical-thumb matrix and attach its evidence.

The eventual acceptance matrix should require on this reference machine:

- Source trigger through first accepted and visible input at or below 2 s for 10k and 15 s for 50k, using one total bounded measurement;
- renderer keydown-to-visible at or below 100 ms for 10k and 400 ms for 50k;
- first trusted wheel movement at or below 100 ms and eight 600 px pulses within 1 s;
- renderer working-set growth from pre-Source at or below 512 MiB; and
- unchanged TOC navigation, cursor/selection, undo/redo, external reload scroll restoration, Source/WYSIWYG transitions, saving, shared views, and exact Markdown round-trip.

No WYSIWYG scroll-report change, universal scroll engine, custom wheel physics, persistence migration, speculative framework, or unrelated refactor belongs in this ticket. Ticket 06 remains **investigating** until the physical-thumb row is executed and attached.
