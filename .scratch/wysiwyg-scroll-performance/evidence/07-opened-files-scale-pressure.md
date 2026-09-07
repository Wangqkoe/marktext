# Ticket 07 — Opened Files scale-pressure investigation

- Status: complete (diagnosis only; no production fix)
- Baseline: `d9c97636b6830dc1d57b8e7af56695f377e698fe`
- Branch: `codex/wysiwyg-scroll-07-opened-files-investigation-repair`
- Recorded: 2026-09-07 America/Los_Angeles

## Outcome

Two independent effects were reproduced and separated.

1. **Ready-batch scale pressure is real.** After the renderer and menu were ready, an exact 20-file set became visible in a three-trial median of 316.7 ms, 100 files in 4,792.3 ms, and 150 files in 10,738.2 ms. Every trial reached exactly 20/20, 100/100, or 150/150 Documents and Opened Files rows, with no renderer or console errors. This establishes no hard capacity boundary through 150 files under the measured ready-batch path, but it shows strongly superlinear row-ready latency and growing memory.
2. **Bulk-startup missing entries are a delivery-readiness race, not a 100- or 150-document capacity ceiling.** The main process issued every requested `mt::open-new-tab` send and every watcher request, yet startup trials sometimes settled at 17–19 of 20 or 98 of 100 after a three-second no-progress boundary. Sending the same exact set only after renderer/menu readiness reached the complete set in every 20/100/150 trial. The evidence localizes loss to the main-send → renderer-listener/application boundary during startup; it does not prove which event inside that boundary drops the message.

The Opened Files list DOM is not the dominant setup cost. Hiding the list before a 100-file batch changed median row-ready latency from 4,748.8 ms to 4,688.8 ms (-1.3%). Detaching the Pinia workspace-facade projection consumer reduced it to 3,690.3 ms (-22.3%) and removed `deepClone$2`/`inertControllerFacadeFile` from the leading profile entries. That proves the Pinia projection consumer is a material contributor, not that it explains the remaining 3.7 seconds or that one function is the sole cause. File watchers, fixture content length at this scale, and general memory exhaustion were not supported as dominant causes by the bounded probes.

Settled native wheel scrolling passed independently: all three 100-floor trials moved the real Opened Files container to 2,751–2,807 px, matched the 31.6–31.7 ms calibrated idle cadence, had no frame gap over 50 ms, and published zero workspace revisions. The automated physical scrollbar-thumb gesture did not move Chromium's overlay/native thumb and is explicitly **Unavailable**, not passed. Programmatic `scrollTop` positioning is retained only as a container-scrollability and revision-isolation diagnostic; it is not treated as direct scrollbar input.

## Red-capable feedback loop

The retained [`profile-opened-files-bulk.ts`](../profile-opened-files-bulk.ts) creates an exact file set, waits for renderer/menu readiness, starts CPU profiling immediately before emitting the real `app-open-files-by-id` production action, records progress/resource samples until the exact set arrives, and preserves partial results on every trial.

With `OPENED_FILES_FEEDBACK_ASSERT=1`, the runner exits nonzero when either exact count is incomplete or the 100-file median latency per file is more than 1.5 times the lower-count median latency per file. The 50% allowance prevents ordinary noise from defining failure while still enforcing the proposed “no superlinear degradation” contract.

The final three-trial feedback run was RED:

| Exact set |          Trial row-ready times |     Median |
| --------: | -----------------------------: | ---------: |
|        20 |       633.9 / 650.6 / 586.7 ms |   633.9 ms |
|       100 | 5,949.8 / 4,714.9 / 5,339.2 ms | 5,339.2 ms |

Five times as many files took 8.42 times as long; normalized slowdown was 1.68, above the 1.5 feedback boundary. The raw result records `feedbackAssessment.verdict = "RED"` in [`raw-feedback.json`](./07-opened-files-scale-pressure.raw-feedback.json). A performance repair can run the identical command and must turn this verdict GREEN without relaxing the policy.

## Environment, fixture, and isolation

- Baseline SHA: `d9c97636b6830dc1d57b8e7af56695f377e698fe`
- Build: production `electron-vite` output, unpackaged Playwright-controlled Electron window
- Windows 11 Pro 10.0.26200, x64
- Intel Core i7-10700, 16 logical processors, 34,060,939,264 bytes RAM
- Node v24.18.0, Electron 42.1.0
- Configured content viewport: 1280×720; every raw trial also records the actual viewport and Opened Files container dimensions
- Standard fixture: exactly 6,129 bytes per file, one H1 plus 40 plain paragraphs, no images, diagrams, math, or remote resources
- Tiny-content probe: one H1 and one trailing newline
- Each trial used a new validated `C:\m7b-*` or `C:\m7-*` root with an isolated user-data profile and corpus. The application was closed and only that validated temporary root was recursively removed. No user profile or user document was read or modified.

The production build was generated before measurement. Profiling covers the actual batch-processing interval, not a later settled-only action. Per-trial samples include observed Documents/rows, renderer and aggregate Electron process CPU, total working set, settled per-process metrics, CPU-profile nodes, delivery counters, errors, and geometry.

## Exact scale and capacity boundary

This table comes from [`raw-ready-batch.json`](./07-opened-files-scale-pressure.raw-ready-batch.json). It is a separate capture from the feedback run, which explains normal host-to-host timing variation.

| Exact requested set |            Trial row-ready times | Median row-ready | Median settled total working set | Median settled renderer working set | Exact arrivals |
| ------------------: | -------------------------------: | ---------------: | -------------------------------: | ----------------------------------: | -------------: |
|                  20 |         315.0 / 321.9 / 316.7 ms |         316.7 ms |                        466.2 MiB |                           167.6 MiB |            3/3 |
|                 100 |   4,792.3 / 4,276.1 / 5,468.6 ms |       4,792.3 ms |                        722.9 MiB |                           391.3 MiB |            3/3 |
|                 150 | 9,024.8 / 11,904.7 / 10,738.2 ms |      10,738.2 ms |                        799.4 MiB |                           451.4 MiB |            3/3 |

All nine final structures contained exactly the requested workspace Document count and row count, and all nine main probes recorded exactly the requested send and watcher counts. At 100 and 150, sampled aggregate Electron CPU peaked around 12–13% and renderer CPU around 7–8% in the median trial; no error or crash occurred. These process percentages do not measure total host utilization, so they are used only to reject an obvious measured-process saturation or memory-ceiling claim, not to claim spare host capacity.

The prior `raw-10-100-partial.json` and `raw-scroll-repeat.json` passed ten spare paths, stopped after reaching only a count floor, and waited one additional second. They remain historical input/profile records but are superseded for exact scaling and capacity conclusions. In particular, their 156–159 settled rows did not prove an exact 150/160 boundary, and their “spare loss” could not distinguish startup delivery loss from the count-floor stopping rule.

## Startup delivery boundary

[`raw-startup-handoff.json`](./07-opened-files-scale-pressure.raw-startup-handoff.json) uses exact sets and waits until exact completion or a three-second no-progress plateau:

| Requested | Final Documents/rows by trial | Main open-tab sends | Watcher requests | Exact trials |
| --------: | ----------------------------: | ------------------: | ---------------: | -----------: |
|        20 |                  19 / 20 / 17 |        20 / 20 / 20 |     20 / 20 / 20 |          1/3 |
|       100 |                98 / 100 / 100 |     100 / 100 / 100 |  100 / 100 / 100 |          2/3 |

The main `openTabs` loop reads each file asynchronously and `_doOpenTab` emits a watcher request and then `mt::open-new-tab` without renderer acknowledgement (`main/windows/editor.ts:384-411`, `712-726`). The renderer installs its `mt::open-new-tab` listener in `LISTEN_FOR_NEW_TAB` and asynchronously starts one workspace `open-document` command per message (`renderer/src/store/editor.ts:1122-1133`, `1538-1568`).

Because the counter wraps `webContents.send`, the startup raw proves the main send call happened, not renderer receipt. Ready-batch exact success makes listener/application readiness the supported boundary-level explanation. A renderer receive/ack counter would be needed to assign the loss more narrowly.

## Falsifiable causal probes

All ready-batch comparisons used exact 100-file sets, three trials, the same window readiness boundary, and one changed variable. Results are in [`raw-hypotheses.json`](./07-opened-files-scale-pressure.raw-hypotheses.json).

| Hypothesis shown before testing                                         | One-variable prediction                                                                  |                                                 Median row-ready | Median peak sampled working set | Result                                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------: | ------------------------------: | --------------------------------------------------------------------------------------------------------------------- |
| H1: per-document commits wake the full Pinia facade/projection consumer | Detaching only that consumer improves latency; merely hiding rows does not               |      baseline 4,748.8 ms; detached 3,690.3 ms; hidden 4,688.8 ms |       575.9 / 560.1 / 586.7 MiB | Supported as a material 22.3% contributor; not a complete cause                                                       |
| H2: missing entries are a startup readiness race, not capacity          | Exact ready-batch sets complete; startup sometimes plateaus short despite all main sends |     ready-batch 20/100/150: 3/3 exact; startup 20: 1/3, 100: 2/3 |              recorded per trial | Supported at the main-send → renderer-listener/application boundary                                                   |
| H3: Markdown/history payload size dominates                             | One-H1 files materially reduce row-ready latency                                         |                           tiny 6,118.2 ms vs baseline 4,748.8 ms |              569.9 vs 575.9 MiB | Refuted as dominant at the standard 6,129-byte fixture scale; memory difference was small and latency did not improve |
| H4: main-process file watcher setup dominates                           | Bypassing only the isolated trial's watcher handler improves latency and main pressure   |                                4,982.8 ms vs baseline 4,748.8 ms |              573.5 vs 575.9 MiB | Refuted as dominant in this Windows run                                                                               |
| H5: general measured-process CPU/RAM exhaustion dominates               | Local renderer interventions do not help and errors/working-set ceiling appear           | projection detach improved 22.3%; no errors; exact 150 completed |                 see scale table | Not supported as the primary boundary; unmeasured host contention remains a source of timing noise                    |

The `watchers-disabled` probe counts all 100 requests and then bypasses their normal listener only inside the disposable test process. No production code or persistent preference is changed.

## Profile and code attribution

During the actual baseline 100-file batch, aggregated leading CPU-profile functions included `structuredClone` (14.5% of all samples), `deepClone$2` (12.1%), `clone` (8.1%), and `inertControllerFacadeFile` (5.9%). Hiding the list left the same functions leading. After detaching only the Pinia projection consumer, `deepClone$2` and `inertControllerFacadeFile` no longer appeared in the top entries and aggregate samples fell from 29,200 to 18,239, while `structuredClone`, `clone`, `snapshotForRecord`, and other work remained.

The code shape matches, but does not by itself quantify, the profile:

- `WorkspaceController.execute()` serializes commands through `operationTail` (`workspace/controller.ts:182-184`, `529-545`). Each applied open commits and notifies subscribers.
- `WorkspaceProjectionMirror` obtains a new full facade snapshot on every controller notification (`workspace/projectionMirror.ts:16-21`).
- `APPLY_WORKSPACE_PROJECTION` deep-clones the facade and projection and rebuilds tab descriptors and TOC compatibility state (`store/editor.ts:316-345`).
- `editorWithTabs/index.vue` separately subscribes and calls `getFacadeSnapshot()` again (`components/editorWithTabs/index.vue:428-430`). This consumer remains after the Pinia mirror is detached and is one reason the detached probe cannot identify a complete repair.
- The Opened Files region renders one component per item and owns a native `overflow: auto` container (`sideBar/tree.vue:54-61`, `572-575`). Static inspection finds no region scroll/wheel handler. Each row reads `currentFile` (`treeOpenedTab.vue:28-33`), but hiding every row before the batch did not improve setup latency.
- Every settled trial materialized one `.editor-component` and zero Source CodeMirror editors, ruling out one hidden editor engine per open Document.

These observations support repeated full-workspace facade/projection work as one confirmed contributor. They do **not** isolate exact time shares among command serialization, facade creation, the Pinia clone/rebuild, the second component snapshot, Vue rendering, structured clone/IPC, and garbage collection.

## Native input and WYSIWYG independence

[`raw-input.json`](./07-opened-files-scale-pressure.raw-input.json) supplies ten spare real files only to reach a 100-row settled input floor after the separately documented startup race. It does not supply capacity evidence.

| Trial | Actual rows | Actual viewport | Container | Native wheel final position | Idle / wheel p95 | `>50 ms` wheel gaps | Workspace revision | Physical thumb |
| ----: | ----------: | --------------: | --------: | --------------------------: | ---------------: | ------------------: | -----------------: | :------------- |
|     1 |         108 |        1280×720 |   246×273 |                    2,751 px |   31.6 / 31.7 ms |                  0% |                  0 | Unavailable    |
|     2 |         110 |        1280×720 |   246×273 |                    2,807 px |   31.6 / 31.7 ms |                  0% |                  0 | Unavailable    |
|     3 |         110 |        1280×720 |   246×273 |                    2,807 px |   31.7 / 31.8 ms |                  0% |                  0 | Unavailable    |

`wheel.status` is `Passed` in all trials because real Playwright mouse-wheel input moved the hovered container and workspace revision stayed unchanged. The right-edge pointer drag left `scrollTop = 0` in all trials, so `scrollbarThumb.status` is `Unavailable`. The separately named `programmaticContainerPositioning` reached the same maximum and had revision delta zero, but its status is `NotApplicableToInputAcceptance`.

The Opened Files native wheel profile was idle/program/hit-testing work and did not contain the workspace facade/projection functions. Opened Files scrolling never changed workspace revision. Therefore this investigation remains independent from WYSIWYG scroll-report acceptance and provides no evidence for a shared scroll runtime.

## Findings by confidence

### Confirmed

- Exact ready-batch setup latency and working set grow sharply from 20 to 100 to 150 real Documents.
- No hard ready-batch capacity ceiling was observed through exactly 150 Documents.
- Startup can lose entries after every main send and watcher request has occurred; ready-batch delivery removes the loss in the measured runs.
- The Pinia facade/projection consumer is a material contributor to 100-file setup latency, while the Opened Files DOM is not the dominant contributor.
- Native wheel scrolling is smooth relative to calibrated idle cadence at the 100-row floor and does not enter the workspace revision/WYSIWYG report path.
- Only one active editor engine is materialized.

### Ruled out as dominant in these probes

- Opened Files row DOM scale.
- Main-process watcher registration.
- Standard-fixture Markdown payload length.
- A hard 100- or 150-document capacity boundary on the ready-batch path.
- A shared native-scroll/WYSIWYG bottleneck.
- A justification for speculative list virtualization or a shared scrolling runtime.

### Unknown or limited

- The exact event lost between startup `webContents.send` and renderer application; renderer receipt/ack was not instrumented.
- The exact share of the remaining 3.7-second detached-projection latency.
- Physical scrollbar-thumb and touchpad acceptance; the automated thumb was unavailable.
- Installed-package behavior, Linux/macOS behavior, and a hard capacity ceiling above 150 exact Documents.
- Total host CPU contention. Raw CPU percentages are Electron process metrics, not a system-wide utilization trace.

## Severity

**Medium / P2 overall, with startup completeness as a blocking acceptance criterion for any bulk-open repair; non-blocking for the WYSIWYG scroll-performance acceptance.** Explicit startup file arguments sometimes did not materialize even though every main send ran, but this harness did not reproduce saved-content loss or prove the same loss in ordinary sequential UI opening. The performance issue is reproducible at a realistic power-user scale, reaches roughly 4.8–10.7 seconds in the exact scale run, and grows settled working set to roughly 0.72–0.80 GiB, but the workspace remained stable and native list scrolling remained usable after settling.

## Narrow follow-up recommendation

A repair specification is warranted, with two separately accepted seams:

1. **Startup delivery reliability:** introduce a renderer-ready delivery/ack boundary (or equivalent queue) so an acknowledged exact file set produces exactly that set of workspace Documents and Opened Files rows. The repair test must use exact 20/100 sets, no spare files, and fail on any missing renderer acknowledgement or row.
2. **Bulk-open projection pressure:** measure and reduce redundant full-facade/projection delivery at the existing controller-commit → renderer-consumer seam during a bulk open. The first implementation should preserve controller serialization and persistence semantics while coalescing or avoiding unchanged intermediate compatibility projections only if new counters prove that choice. The retained feedback command must become GREEN at its fixed 1.5 normalized boundary, and exact 150 completion must remain intact.

Required invariants are Document/View ownership, dirty Markdown and portable history, save/crash-draft safety, watcher coverage, selected-tab semantics, and native scrolling. Non-goals are Opened Files virtualization without new evidence, a shared scroll runtime, content truncation, hidden-editor retention, persistence redesign, Source large-document work, and unrelated cleanup.

## Raw evidence

- [`07-opened-files-scale-pressure.raw-feedback.json`](./07-opened-files-scale-pressure.raw-feedback.json) — final red feedback loop, exact 20/100, three trials
- [`07-opened-files-scale-pressure.raw-ready-batch.json`](./07-opened-files-scale-pressure.raw-ready-batch.json) — exact 20/100/150 scale and capacity, three trials
- [`07-opened-files-scale-pressure.raw-startup-handoff.json`](./07-opened-files-scale-pressure.raw-startup-handoff.json) — exact startup delivery counters and plateau boundary
- [`07-opened-files-scale-pressure.raw-hypotheses.json`](./07-opened-files-scale-pressure.raw-hypotheses.json) — five one-variable causal comparisons and load-phase CPU profiles
- [`07-opened-files-scale-pressure.raw-input.json`](./07-opened-files-scale-pressure.raw-input.json) — native wheel, unavailable physical thumb, programmatic diagnostic, actual viewport/container
- `raw-10-100-partial.json` and `raw-scroll-repeat.json` — superseded historical captures retained for auditability

## Commands and verification

```powershell
pnpm install --frozen-lockfile
pnpm --dir packages/desktop build
pnpm exec eslint .scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts .scratch/wysiwyg-scroll-performance/profile-opened-files-scale.ts
pnpm --dir packages/desktop typecheck

$env:OPENED_FILES_COUNTS='20,100'
$env:OPENED_FILES_TRIALS='3'
$env:OPENED_FILES_SCENARIOS='baseline'
$env:OPENED_FILES_DELIVERY='ready-batch'
$env:OPENED_FILES_FEEDBACK_ASSERT='1'
$env:OPENED_FILES_OUTPUT='.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-feedback.json'
pnpm exec tsx .scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts
```

The final feedback command intentionally exits nonzero while the reproduced performance issue is RED. No production source, production test, virtualization, persistence path, or shared scroll runtime was changed.
