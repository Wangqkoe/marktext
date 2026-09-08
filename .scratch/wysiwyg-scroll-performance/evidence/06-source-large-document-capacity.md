# Ticket 06: Source large-document capacity investigation

- Status: **complete**; automated causal work and the physical scrollbar-thumb validation are recorded. The confirmed 50k P1 capacity defect remains for a follow-up implementation ticket.
- Required production-source baseline: `f15604cac0d7cc337bdb4d174157a89643854c53`
- Clean harness/measured HEAD: `3393a3ece1536344d03b156891fd1b6bae30d11c`
- Branch: `codex/wysiwyg-scroll-06-source-investigation-repair-3`
- Timing matrix recorded: 2026-09-07 America/Los_Angeles (`2026-09-07T09:48:03.585Z`)
- Paired CPU profile recorded: 2026-09-07 America/Los_Angeles (`2026-09-07T09:51:46.124Z`)
- Application/runtime: MarkText `0.20.0-rc.1`; harness Node `24.18.0`; launched Electron `42.1.0` with Chromium `148.0.7778.97` and embedded Node `24.15.0`; pnpm `10.33.4`
- Machine: Windows 11 Pro `10.0.26200`, Intel Core i7-10700, 16 logical processors, 32 GiB RAM, x64
- Measured geometry in every completed trial: window outer `1216x808`, layout/visual viewport `1200x800`, device scale factor `1`, Source container client box `1188x746`
- Durable artifacts: [harness](../source-large-document-capacity.cjs), [timing/intervention raw results](06-source-large-document-capacity.raw.json), and [paired CPU-profile raw results](06-source-large-document-capacity.profile.raw.json)

## Outcome

The production Source path at a 10,000-line disk fixture is **usable but degraded (P2/moderate)**. Across three isolated baselines, the median populated-WYSIWYG open was 3.81 s and the independently measured Source-trigger-to-first-accepted-and-visible-input readiness was 3.56 s. The first trusted `keydown` to visible mutation median was 169 ms. The median renderer working-set increase was 275 MiB. Real Playwright wheel input moved the Source surface, but eight 600 px pulses took a median 1.21 s.

The production Source path at a 50,000-line disk fixture is **unavailable for ordinary interactive use (P1/high capacity defect)**. The median populated-WYSIWYG open was 23.35 s and the separate Source-trigger-to-first-accepted-and-visible readiness was 25.82 s. The first trusted `keydown` to visible mutation median was 602 ms. The median renderer working-set increase was 1,779 MiB and the median post-input working set was 2,540 MiB. Eight real wheel pulses took a median 7.03 s. Every baseline completed without a renderer crash or observed data loss, so this is not P0.

The investigation now has a causal account rather than a correlation-only account:

1. Changing only `viewportMargin` from `Infinity` to `10` in a CodeMirror initialization hook did not change full materialization or readiness at either scale.
2. Holding that finite margin constant and changing only CodeMirror height/viewport ownership reduced 50k rendered Source lines from 51,000 to 27, Source readiness from the 25.82 s baseline median to 12.37 s, Source-entry layout-plus-style time from an 8.36 s baseline median to 2.14 s, renderer working-set growth from a 1,779 MiB median to 2 MiB, and eight-wheel-pulse time from 7.03 s to 0.85 s.
3. In a separate 50k CPU-profile pair, CodeMirror `updateHeightsInViewport` fell from 5.058 s of Source-entry self samples to 0.028 s under the bounded viewport intervention. The remaining dominant named function was Muya `InlineRenderer._collectReferenceDefinitions`, at 4.573 s in baseline and 4.313 s under the intervention.
4. Removing the production Source `change` and `cursorActivity` handlers before the first real 50k keydown reduced renderer keydown-to-visible time from a 602 ms baseline median to 279 ms, keydown-to-observed-CodeMirror-change from 108 ms to 24 ms, input task time from 1.531 s to 0.681 s, and input `ScriptDuration` from 0.469 s to 0.294 s. Those handlers are an important input cost, not the Source-entry cause.

The smallest promising remediation boundary is therefore two explicit seams, not an assumed universal scroll engine: Source layout/viewport ownership in `sourceCode.vue`, and the full-state reference-definition collection called by `InlineRenderer.patch`. A production proposal must preserve Source scroll/TOC/cursor semantics and must prove whether reference definitions can be cached or collected once per document update. The disposable interventions do not themselves constitute a production fix.

The manual physical-thumb matrix closes the investigation's evidence gap without claiming a production repair. The 10k result is acceptable. All three 50k rounds reached the requested positions without a reported crash, but the thumb remained visibly unresponsive and stalled for up to a few seconds; this confirms the existing P1 capacity defect.

## Pre-registered falsifiable hypotheses

The hypotheses were recorded before the interventions and retained in both raw artifacts.

| ID  | Prediction                                                                                                                                                                               | Result                                                                                                                                                                                                                                | Evidence classification                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| H1  | If full-height CodeMirror materialization dominates Source entry, a pre-commit finite viewport policy will sharply reduce readiness, rendered nodes, memory, and wheel cost.             | Partly confirmed and narrowed. Finite margin alone was inert; finite margin plus fixed viewport ownership produced the predicted large reductions.                                                                                    | Observed intervention; causal inference is limited to the combined Source layout policy. |
| H2  | If Source `change`/`cursorActivity` full-text synchronization dominates first input, removing those handlers before the first keydown will sharply reduce input latency and script time. | Confirmed as an important secondary input cost: 50k visible latency fell 54%, change observation 78%, task time 56%, and script time 37%. It did not materially reduce Source-entry time.                                             | Observed intervention.                                                                   |
| H3  | If style/layout dominates, `LayoutDuration + RecalcStyleDuration` will exceed `ScriptDuration` and scale from 10k to 50k.                                                                | Confirmed for the classified DevTools counters: baseline median layout+style grew from 1.43 s to 8.36 s. CPU profiling additionally identified CodeMirror height updates and DOM primitives. A larger residual task category remains. | Observed profile/counters; residual attribution remains partly unknown.                  |
| H4  | If disk loading/initial Markdown parsing dominates total time-to-use, pre-Source readiness will account for most scale growth; otherwise Source-local work will remain separately large. | Disk/open work and Source work are both large: medians are 23.35 s and 25.82 s at 50k. Source timing begins only after populated WYSIWYG plus cadence sampling, so its cost is not disk read or initial open parsing.                 | Observed stage boundary; detailed pre-Source parsing partition remains unknown.          |

## Fixture, isolation, and measurement method

Each UTF-8/LF fixture contains exactly N nonblank lines. Every line whose one-based number is `1 mod 100` is a unique ATX H1; every other line is unique fixed-shape plain text. There are no images, diagrams, math blocks, or unusually long lines.

| Disk fixture |     Bytes | Headings | Body lines | SHA-256                                                            |
| ------------ | --------: | -------: | ---------: | ------------------------------------------------------------------ |
| 10,000 lines |   776,900 |      100 |      9,900 | `8d7a4d0903a787926d979af4f2082155134cb631bc7b6827c14cad141dc95dfd` |
| 50,000 lines | 3,884,500 |      500 |     49,500 | `cb6d15f95facb7396b6fa010ba0cc9c6ab13890e10e8e72a61132be46d2beeeb` |

Every trial created a unique OS-temporary root containing one uniquely named fixture and one uniquely named `--user-data-dir`. No fixture, profile, or trial root was reused. The raw results retain every basename, fixture digest, build and measurement commands, source baseline and harness identities, application/runtime, OS build, CPU/RAM, measured viewport, timeout, and cleanup result.

### Build and artifact identity

Both final raw artifacts independently verified, before writing results, that the full repository and the declared production pathspecs were clean. `git diff --quiet f15604cac0d7cc337bdb4d174157a89643854c53 -- packages scripts package.json pnpm-lock.yaml pnpm-workspace.yaml eslint.config.js` returned status `0`, proving that the production build inputs matched the required source baseline. The clean measured HEAD and the commit that last changed the harness were both `3393a3ece1536344d03b156891fd1b6bae30d11c`; the harness file SHA-256 was `a23c3f2e6f43ecd36545378f220a4acfbda8e82620ad84c40de106f018bd7071`.

The harness actually executed `pnpm --filter marktext build` through non-interactive PowerShell for each artifact. Both executions returned status `0`; the retained stdout records the main, preload, and renderer builds, and the retained stderr contains only Vite chunking warnings. The actual Electron executable returned status `0` and `v42.1.0` for `--version`. After each build, all 878 files under `packages/desktop/out` were sorted by relative path and hashed. Both artifacts record the same manifest SHA-256: `395085853526cda9098ff3132bb596ee1cda2fe6419f895bd815d80f8cd84c77`.

The manifest includes `main/index.js` SHA-256 `ff871b2b0122c6211accb179e51ac99050289cdc20e0be509d604f2fa4fcf229`, `preload/index.js` SHA-256 `7cfa9d8d2ab2a259234390f86c330f489b03bce96186a95f59a4a1ef5534df11`, and every renderer chunk (including the measured primary renderer bundle `renderer/assets/index-DpKqBBjZ.js` SHA-256 `ed9dc734df5038484de13476f7c8bf5abe84d543a232aac4758c1c156614d4ba`). At launch, the main process itself reported Electron `42.1.0`, Chromium `148.0.7778.97`, and embedded Node `24.15.0`; the renderer user agent independently reported the same Electron and Chromium versions.

The production timing matrix ran, per scale, three baseline trials and one trial for each intervention:

- `finite-viewport-init-hook`: before Source construction completes, set CodeMirror `viewportMargin` to `10` while retaining production `height:auto` and outer `.source-code` scrolling;
- `finite-viewport-plus-fixed-height`: hold the first intervention constant and add a trial-only `height:100%`, moving the live viewport to the CodeMirror scroller; and
- `without-source-sync-handlers`: after Source mounts but before cursor preparation and the first keydown, remove the one production `change` and one production `cursorActivity` listener, then attach the measurement listener.

No production source, preference, or user data was changed by any intervention.

### Readiness boundary

Before the Source command, the harness installs a renderer `MutationObserver`, an optional CodeMirror init hook, and the readiness state. One **single 150,000 ms total deadline** begins immediately before invoking the real Source menu command. It covers Source component creation, CodeMirror construction, focus/cursor preparation, the first `page.keyboard.press`, CodeMirror change-state observation, and visible first-line DOM mutation. The primary readiness value ends only when both the CodeMirror value and visible line contain the typed marker. Renderer evidence retains the trusted `keydown`, change timestamp, visible timestamp, and accepted state separately.

The pre-Source phase likewise has one **120,000 ms total deadline** from Electron launch through a populated WYSIWYG editor; it is not two serial 45 s waits described as one 45 s limit. Other explicit bounds are 30,000 ms for wheel, 15,000 ms for the controlled Electron exit request, 15,000 ms for post-kill process exit, and ten deletion attempts separated by 500 ms.

### Main-thread attribution

Chromium DevTools Performance counters were differenced separately around Source entry and first input. They retain `TaskDuration`, `ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`, `ThreadTime`, and layout/style counts. The paired 50k diagnostic artifact additionally uses the DevTools V8 CPU profiler at a 1,000 µs interval in separate Source-entry and first-input windows; raw samples are aggregated by call frame.

`TaskDuration - ScriptDuration - LayoutDuration - RecalcStyleDuration` is reported as an unclassified renderer-task residual, not mislabeled as paint or garbage collection. CPU-profile `(garbage collector)` samples are retained separately. The profile is used for attribution, not for acceptance timing, because profiling adds overhead.

### Commands

```powershell
pnpm install --frozen-lockfile
node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs --self-test-cleanup
node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs
node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs --cpu-profile --profile-pair
```

The two measurement commands each run and record their own production build after the clean-source identity gate; no unrecorded build is substituted for the retained `out` manifest.

## Baseline timing matrix

| Measure                                              | 10k T1 | 10k T2 | 10k T3 |  50k T1 |  50k T2 |  50k T3 |
| ---------------------------------------------------- | -----: | -----: | -----: | ------: | ------: | ------: |
| Launch → populated WYSIWYG (ms)                      |  3,844 |  3,539 |  3,811 |  22,959 |  23,352 |  24,502 |
| Source trigger → input armed (ms)                    |  3,056 |  3,133 |  3,117 |  21,117 |  22,748 |  22,979 |
| Source trigger → first accepted + visible (ms)       |  3,528 |  3,636 |  3,556 |  23,892 |  25,816 |  26,034 |
| Renderer `keydown` → CodeMirror change observed (ms) |     65 |     71 |     23 |     108 |     103 |     151 |
| Renderer `keydown` → visible mutation (ms)           |    169 |    179 |    125 |     572 |     602 |     700 |
| Actual CodeMirror lines                              | 10,200 | 10,200 | 10,200 |  51,000 |  51,000 |  51,000 |
| Rendered `.CodeMirror-line` nodes                    | 10,200 | 10,200 | 10,200 |  51,000 |  51,000 |  51,000 |
| Total DOM elements                                   | 73,116 | 73,116 | 73,116 | 363,516 | 363,516 | 363,516 |
| Renderer working set before Source (MiB)             |    467 |    456 |    463 |     761 |     757 |     780 |
| Renderer working set after first input (MiB)         |    742 |    786 |    695 |   2,540 |   2,293 |   2,678 |
| Renderer working-set increase (MiB)                  |    275 |    330 |    233 |   1,779 |   1,535 |   1,898 |
| Source-entry task time (s)                           |  3.255 |  3.325 |  3.308 |  22.202 |  23.888 |  24.288 |
| Source-entry layout + style time (s)                 |  1.404 |  1.456 |  1.427 |   8.134 |   8.356 |   8.506 |
| Source-entry unclassified task residual (s)          |  1.850 |  1.868 |  1.879 |  14.065 |  15.530 |  15.779 |
| First wheel → first moved scroll (ms)                |     84 |     93 |     59 |     373 |     746 |     394 |
| Eight wheel pulses elapsed (ms)                      |  1,230 |  1,209 |  1,146 |   6,721 |  11,585 |   7,033 |

Opening through the production WYSIWYG path adds two Source lines per heading, hence 10,200 and 51,000 actual CodeMirror lines. Every wheel trial observed 8/8 renderer wheel events with `isTrusted=true`, 8 scroll events, and movement from `scrollTop=0` to `4800`; the defect is response latency rather than inability to reach a new offset.

## Causal intervention results

| Scale / variant                    | Source → accepted + visible | Rendered Source lines | Total DOM | Renderer WS after input |  WS delta | Source task | Layout + style | Wheel first move | 8 pulses |
| ---------------------------------- | --------------------------: | --------------------: | --------: | ----------------------: | --------: | ----------: | -------------: | ---------------: | -------: |
| 10k baseline median                |                    3,556 ms |                10,200 |    73,116 |                 742 MiB |   275 MiB |     3.308 s |        1.427 s |            84 ms | 1,209 ms |
| 10k finite margin only             |                    3,790 ms |                10,200 |    73,116 |                 823 MiB |   362 MiB |     3.527 s |        1.616 s |            56 ms | 1,188 ms |
| 10k finite margin + fixed viewport |                    1,355 ms |                    27 |    21,954 |                 443 MiB |   -16 MiB |     1.273 s |        0.362 s |            37 ms |   790 ms |
| 50k baseline median                |                   25,816 ms |                51,000 |   363,516 |               2,540 MiB | 1,779 MiB |    23.888 s |        8.356 s |           394 ms | 7,033 ms |
| 50k finite margin only             |                   25,492 ms |                51,000 |   363,516 |               2,471 MiB | 1,717 MiB |    23.684 s |        8.667 s |           227 ms | 7,177 ms |
| 50k finite margin + fixed viewport |                   12,371 ms |                    27 |   107,154 |                 911 MiB |     2 MiB |    11.694 s |        2.137 s |            45 ms |   846 ms |

The finite-margin-only result rules out a one-option production repair. CodeMirror has `viewportMargin=10`, but production `height:auto` makes its visible height approximately the full document, so all lines remain in its viewport. The fixed-height comparison changes the viewport ownership while holding the finite margin constant; it proves that the current full-height/outer-scroll policy is a major cause. It is not direct approval to replace the production scroll owner because Source TOC, cursor placement, external reload scroll preservation, and saved view state currently use the outer container.

### CPU profile: dominant named Source-entry work

| 50k Source-entry profile                                        |         Baseline | Finite margin + fixed viewport |
| --------------------------------------------------------------- | ---------------: | -----------------------------: |
| Source trigger → accepted + visible                             |        25,597 ms |                      11,930 ms |
| Source-entry profile window                                     |        23,406 ms |                      11,622 ms |
| `CodeMirror.updateHeightsInViewport` self samples               | 5,058 ms (21.6%) |                   28 ms (0.2%) |
| `Muya InlineRenderer._collectReferenceDefinitions` self samples | 4,573 ms (19.5%) |               4,313 ms (37.1%) |
| Listed DOM primitive self samples                               |         2,223 ms |                         647 ms |
| Garbage-collector self samples                                  |           506 ms |                         444 ms |

The listed DOM-primitive row sums `getBoundingClientRect`, `elt`, `removeChild`, `insertBefore`, and `appendChild`; it is a lower bound rather than a claim about all browser-native DOM work.

`updateHeightsInViewport` is the largest named baseline function and disappears when full materialization is removed. `_collectReferenceDefinitions` becomes the largest named residual. Code inspection shows every `InlineRenderer.patch` calls `_collectReferenceDefinitions`, which recursively scans the whole Muya JSON state before tokenizing the block. The profile proves that this full-state scan is active during the Source-entry window and costs about 4–5 s at 50k. It does not yet prove whether the safe repair is caching, invalidation, or avoiding WYSIWYG patches during mode handoff.

### First-input handler intervention

| Scale | Baseline median `keydown` → change | No-handlers | Baseline median `keydown` → visible | No-handlers | Baseline input task | No-handlers | Baseline input script | No-handlers |
| ----- | ---------------------------------: | ----------: | ----------------------------------: | ----------: | ------------------: | ----------: | --------------------: | ----------: |
| 10k   |                              65 ms |        7 ms |                              169 ms |       58 ms |             0.246 s |     0.113 s |               0.097 s |     0.042 s |
| 50k   |                             108 ms |       24 ms |                              602 ms |      279 ms |             1.531 s |     0.681 s |               0.469 s |     0.294 s |

The intervention removed exactly one production `change` and one `cursorActivity` handler. Source-entry time remained baseline-like (3.40 s at 10k; 22.51 s at 50k), so these handlers do not explain construction. They do explain a material portion of first-input delay. The production handlers call `getMarkdownAndCursor`, `getValue`, `getWordCount`, and `composition.reportSource`; the profiler retains `wordCount` and CodeMirror display work in the first-input window. A production repair must retain document synchronization and status correctness rather than simply removing the handlers.

## Real wheel and physical-thumb validation

The harness points at the visible Source surface and dispatches eight `page.mouse.wheel(0, 600)` inputs. It records each renderer `wheel` event, `event.isTrusted`, the actual active scroll target, scroll events, first movement, final offset, and driver elapsed time. Production uses the outer `.source-code` container; the disposable fixed-viewport intervention uses the CodeMirror scroller. All 96 timing-matrix wheel inputs were observed as trusted and every trial moved the applicable scroll target.

### Manual execution environment and identity

The human-operated matrix used the build worktree at `C:\Users\1407\.codex\worktrees\cb6b\Marktext`, launched from `packages\desktop`, at commit `35f93b483942f5dc4bc4d57aa932120ad23ebcb0`. That path is retained as historical execution identity; after phase cleanup, the durable checked-in report and raw evidence are below `C:\Users\1407\.codex\worktrees\d3af\Marktext\.scratch\wysiwyg-scroll-performance\evidence`, and the exact commit is recoverable from the bundle recorded in `phase-cleanup.md`. The isolated profile family was `marktext-source-manual-20260907-01`, with `profiles/10k-round-1..3` and `profiles/50k-round-1..3`. The first attempted 10k round 2 launch incorrectly used the monorepo root and failed; it is not counted as a trial. The successful retry used `10k-round-2-retry-1`. The temporary launcher was then corrected to use `packages\desktop`. For 50k round 3, PID `33824` was verified running without an early exit.

The host was Windows 11 Pro `10.0.26200` (`26200`), x64. At evidence collection, the user display registry reported `AppliedDPI=96` (nominal 100% scale), and the active display mode reported by the NVIDIA adapter was `2560x1440` at 144 Hz. Windows identified the pointing device only as `HID-compliant mouse`, Microsoft driver, status `OK`, device ID `HID\VID_046D&PID_C52B&MI_01&COL01\7&68A9055&0&0000`; the physical model was not recorded. The application viewport for these manual trials was not independently recorded and is unknown. These environment queries were collected after the trials, so they document the host state at evidence recording rather than prove that every setting remained unchanged throughout every round.

### Manual result matrix

| Fixture / round | Human-reported physical-thumb result                                                                           | Reachability and safety                                                                                               | Recording                                                                                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10k round 1     | Thumb was comparatively responsive; visible content followed it; longest stall was a fraction of a second.     | Approximately 50%, bottom, and top were all reachable; no crash and no lost input were reported.                      | `C:\Users\1407\Videos\Captures\fixture-10k.md 2026-09-07 04-12-59.mp4`; 7,776,069 bytes; modified `2026-09-07 04:13:33 -07:00`; SHA-256 `a111a6704c5a0472d66b0e5f90784a38f4fd10ce2f6c8c20c1cf25aa0246d2b2`.                                                          |
| 10k round 2     | Thumb was responsive with almost no stall.                                                                     | Approximately 50%, bottom, and top were all reachable; no crash was reported. Lost input was not reported either way. | `C:\Users\1407\Videos\Captures\fixture-10k.md 2026-09-07 04-25-22.mp4`; 9,289,415 bytes; modified `2026-09-07 04:25:47 -07:00`; SHA-256 `b810fd6c08f1df5139ebadedf47d75d956a48468815c032852025fdd06af5e78`.                                                          |
| 10k round 3     | The user reported no difference from round 2 and marked the round passed.                                      | No separate per-dimension report was made.                                                                            | The user chose not to record this round; no recording is claimed.                                                                                                                                                                                                    |
| 50k round 1     | Thumb was not very responsive and visibly stalled; stalls ranged from a fraction of a second to a few seconds. | Approximately 50%, bottom, and top were all reachable; no crash was reported. Lost input was not reported either way. | `C:\Users\1407\Videos\Captures\DESKTOP-6K8S0NK - TeamViewer 2026-09-07 21-37-11.mp4`; 57,834,054 bytes; modified `2026-09-07 06:37:40 -07:00` (the filename itself contains `21-37-11`); SHA-256 `dd4038e2c08b62ed048c7733d705a9788ff1b371c4f70729c2ea08a9cb6bdf28`. |
| 50k round 2     | The user reported the same result as round 1, with stalls of a few seconds.                                    | Other observations were reported as the same as round 1.                                                              | No recording was required or claimed.                                                                                                                                                                                                                                |
| 50k round 3     | The user reported the result was also the same as round 1.                                                     | Other observations were reported as the same as round 1.                                                              | No recording was required or claimed.                                                                                                                                                                                                                                |

The three files claimed above were present when this evidence was recorded; their byte sizes, local modification times, and SHA-256 digests were independently checked. The manual acceptance conclusion is limited to the reported observations: physical thumb behavior is acceptable at 10k, while the repeatable lack of responsiveness and multi-second stalls at 50k confirm the already-classified P1/high capacity defect. Completing this matrix closes Ticket 06 as an investigation; it does not mean the 50k product defect is fixed or accepted.

## Cleanup evidence

All twelve timing trials and both paired CPU-profile trials discovered and parsed an exact six-PID Electron tree through `Win32_Process`, successfully requested a controlled exit by destroying the isolated test window and scheduling `app.exit(0)`, and then performed two successful PID-verification stages. Every discovered PID was absent before the 15 s bound, no `taskkill` was required, every cleanup error list was empty, and every profile, fixture, and trial root was removed and verified absent on attempt 1.

Cleanup is fail-closed. Discovery command or parse failure, PID-query failure, controlled-exit timeout/error while a process remains, any nonzero/timed-out `taskkill`, or any remaining PID after the bounded final poll makes process cleanup unsuccessful. In that state path cleanup is not called, the unique trial root is retained, `abort-before-next-trial` is recorded, and the harness throws before another trial. A process that already exited is accepted only after a successful query proves that all discovered PIDs are absent. `node .scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs --self-test-cleanup` passed live Windows discovery plus injected discovery-command, parse, query, kill, timeout, natural-exit, and retained-root cases.

A pre-final smoke run against harness commit `015280658722211c8834344b9ea195f3cc6515fb` exercised the real failure path: the prior `app.close()` strategy timed out, `taskkill` returned `0`, and final verification found no PIDs, but the timeout still made cleanup fail. The harness did not start another trial and retained `C:\Users\1407\AppData\Local\Temp\marktext-source-10000-production-baseline-1-wXtpaN` with its fixture and profile. That rejected smoke result is not included in either final raw artifact.

## Evidence classification

### Observed

- The 50k defect repeats across three isolated production profiles in both pre-Source and Source-only stages.
- Production Source fully materializes all 10,200/51,000 CodeMirror lines and grows DOM, memory, first-input latency, and wheel latency with scale.
- Finite `viewportMargin` alone is inert under `height:auto`; finite margin plus a bounded CodeMirror viewport halves 50k Source readiness, removes nearly all Source line nodes, reduces layout/style work by about 74%, and sharply reduces memory and wheel cost.
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
- Installed-package, Linux, and macOS physical scrollbar-thumb behavior remains unmeasured.

## Follow-up repair boundary

A repair specification is warranted, but production implementation remains out of this investigation. The smallest evidence-supported sequence is:

1. Prototype finite Source materialization at the `sourceCode.vue` layout/scroll-owner seam while keeping one authoritative live/committed scroll position and all existing Source behaviors.
2. Add a focused Muya benchmark proving how often `_collectReferenceDefinitions` runs during Source handoff, then test one correctness-preserving cache/invalidation or skip boundary.
3. Coalesce Source content/status reporting without weakening shared-document, dirty-state, word-count, cursor, history, or save semantics.

The eventual acceptance matrix should require on this reference machine:

- Source trigger through first accepted and visible input at or below 2 s for 10k and 15 s for 50k, using one total bounded measurement;
- renderer keydown-to-visible at or below 100 ms for 10k and 400 ms for 50k;
- first trusted wheel movement at or below 100 ms and eight 600 px pulses within 1 s;
- renderer working-set growth from pre-Source at or below 512 MiB; and
- unchanged TOC navigation, cursor/selection, undo/redo, external reload scroll restoration, Source/WYSIWYG transitions, saving, shared views, and exact Markdown round-trip.

No WYSIWYG scroll-report change, universal scroll engine, custom wheel physics, persistence migration, speculative framework, or unrelated refactor belongs in this ticket. Ticket 06 is **complete** because the investigation and required evidence matrix are recorded; the confirmed 50k P1 capacity defect still requires a separate implementation ticket.
