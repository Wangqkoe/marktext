# T07 evidence: Opened Files scale pressure

Date: 2026-09-07

Application/source baseline: `303dfa39b84b5bffedd9271b27cefbf34be66753`

Bulk harness: `433090a587e45428aa6421d57953a79cf57b1148`

Input harness after readiness repair: `2e354d79cb383ffd56e0be87fcd1e9cc8e96ab69`

## Outcome

1. **Ready-batch scale pressure remains real.** The comparable completion milestone is now named **document-ready** everywhere: the workspace facade snapshot contains exactly the requested Document count. Exact 20/100/150 ready batches reached both the requested Documents and Opened Files rows in all nine trials. Median document-ready time was 580.9 / 5,277.6 / 8,942.6 ms. This shows no hard ready-batch capacity ceiling through 150, but the 150-file trials were noisy (5.64–16.37 s).
2. **Startup delivery remains a separate reliability problem.** With exact startup inputs, 20 files completed in 1/3 trials and 100 files in 0/3, although every main-process send and watcher request occurred. Ready-batch completion therefore does not excuse startup loss.
3. **The Pinia facade/projection consumer is a material contributor, not a complete cause.** Detaching it reduced median 100-file document-ready time from 6,232.4 to 4,598.1 ms (-26.2%) and removed `deepClone$2` and `inertControllerFacadeFile` from the leading profile entries. However, hiding the Opened Files list reduced the same milestone to 4,771.2 ms (-23.4%). This rerun no longer supports ruling out row rendering as a material contributor or ranking it below the Pinia path.
4. **Native wheel input passed independently.** All three settled 100-floor trials moved the real Opened Files container to 2,723–2,779 px with zero workspace revisions and no frame gap over 50 ms. Physical scrollbar-thumb automation remained **Unavailable**. Programmatic `scrollTop` positioning is only a diagnostic and remains `NotApplicableToInputAcceptance`.

No production code or production test changed.

## Red-capable feedback loop

[`profile-opened-files-bulk.ts`](../profile-opened-files-bulk.ts) creates exact files, waits for renderer/menu readiness, starts CPU profiling immediately before the real main-process `app-open-files-by-id` action, and stops on the same workspace-snapshot document-ready milestone for every scenario. It retains partial results and records failures.

With `OPENED_FILES_FEEDBACK_ASSERT=1`, the command exits nonzero if an exact count is incomplete or if the 100-file median document-ready latency per requested file exceeds 1.5 times the lower-count median per file.

| Exact set | Trial document-ready times | Median |
| ---: | ---: | ---: |
| 20 | 671.0 / 404.0 / 639.0 ms | 639.0 ms |
| 100 | 6,565.3 / 7,062.7 / 4,979.3 ms | 6,565.3 ms |

Five times as many files took 10.27 times as long. Normalized slowdown was 2.05, above the fixed 1.5 boundary, so [`raw-feedback.json`](./07-opened-files-scale-pressure.raw-feedback.json) records `feedbackAssessment.verdict = "RED"`, `execution.status = "Failed"`, and exit code 1 after all six exact trials completed. This is the intended red-capable signal.

## Reproducible measurement identity

Every final raw file records its exact PowerShell command and environment, execution status/exit code, limitations, source SHA, harness SHA, pre-run dirty state, bundle hash, launcher and Electron executable hashes, and runtime-read versions.

| Identity field | Recorded value |
| --- | --- |
| Application/source SHA | `303dfa39b84b5bffedd9271b27cefbf34be66753` |
| Bulk harness SHA | `433090a587e45428aa6421d57953a79cf57b1148` |
| Final input harness SHA | `2e354d79cb383ffd56e0be87fcd1e9cc8e96ab69` |
| Pre-run working tree | clean (`isDirty = false`) for every final raw |
| Application bundle | `packages/desktop/out`, 878 files, 23,994,819 bytes, manifest SHA-256 `107034fcec4bf0529076a26f63dc02335322904c59262623a57d6813a74be211` |
| Electron executable | `node_modules/electron/dist/electron.exe`, SHA-256 `75217fc3770295a1fbf0a2f3f88e59a4a71bdbccce9c7624dd7dd520b484a5be` |
| Runtime versions | Electron 42.1.0; Node 24.15.0; Chromium 148.0.7778.97 (read from the running Electron main process) |
| Harness Node | v24.18.0 |
| Host | Windows 11 Pro 10.0.26200 x64; Intel Core i7-10700; 16 logical processors; 34,060,939,264 bytes RAM |
| Viewport | configured 1280×720; actual viewport/container geometry retained per trial |

The source SHA and harness SHA are deliberately separate. The bundle identity is content-derived rather than inferred from either SHA. All four bulk raws used the first clean harness commit; the input harness needed one readiness-order repair after a fully recorded failed attempt and therefore has its own clean commit.

## Exact scale and capacity boundary

[`raw-ready-batch.json`](./07-opened-files-scale-pressure.raw-ready-batch.json) records a passed execution (exit 0):

| Exact requested set | Trial document-ready times | Median document-ready | Median total working set | Median renderer working set | Exact Documents/rows |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 324.6 / 580.9 / 595.1 ms | 580.9 ms | 462.7 MiB | 167.7 MiB | 3/3 |
| 100 | 5,277.6 / 5,682.7 / 5,157.1 ms | 5,277.6 ms | 723.9 MiB | 391.9 MiB | 3/3 |
| 150 | 8,942.6 / 16,368.4 / 5,635.4 ms | 8,942.6 ms | 796.1 MiB | 452.8 MiB | 3/3 |

All nine final structures contained exactly the requested workspace Document count and row count, and all main probes recorded exactly the requested sends and watcher requests. At 100 and 150, sampled Electron-process CPU did not show a measured-process ceiling and there were no renderer errors or crashes. These are per-process metrics, not total host utilization, so they cannot rule out host contention. The large 150-file spread is retained as uncertainty rather than normalized away.

The superseded `raw-10-100-partial.json` and `raw-scroll-repeat.json` remain historical only. They used spare paths and a count floor and do not establish exact capacity.

## Startup delivery boundary

[`raw-startup-handoff.json`](./07-opened-files-scale-pressure.raw-startup-handoff.json) records a passed measurement command (exit 0) and the following product result:

| Requested | Final Documents/rows by trial | Main open-tab sends | Watcher requests | Exact trials |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 20 / 18 / 19 | 20 / 20 / 20 | 20 / 20 / 20 | 1/3 |
| 100 | 98 / 99 / 99 | 100 / 100 / 100 | 100 / 100 / 100 | 0/3 |

The main `openTabs` loop reads files and `_doOpenTab` emits a watcher request followed by `mt::open-new-tab` without renderer acknowledgement (`main/windows/editor.ts:384-411`, `712-726`). The renderer installs the `mt::open-new-tab` listener and asynchronously starts one workspace `open-document` command per message (`renderer/src/store/editor.ts:1122-1133`, `1538-1568`).

The probe wraps `webContents.send`; it proves the main send call, not renderer receipt. Exact ready-batch success keeps the supported localization at the main-send → renderer-listener/application readiness boundary. A receive/ack counter is still required to assign the loss more narrowly.

## Same-milestone causal probes

All comparisons in [`raw-hypotheses.json`](./07-opened-files-scale-pressure.raw-hypotheses.json) use exact 100-file ready batches, three trials, the same readiness boundary, and the same workspace-snapshot **document-ready** milestone.

| Scenario / falsifiable probe | Trial document-ready times | Median | Change vs baseline | Final rows | Median peak working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 4,257.2 / 6,332.7 / 6,232.4 ms | 6,232.4 ms | — | 100 / 100 / 100 | 576.3 MiB |
| list-hidden: row work is material if hiding it improves completion | 4,426.5 / 4,771.2 / 5,094.2 ms | 4,771.2 ms | -23.4% | 0 / 0 / 0 | 584.9 MiB |
| tiny-content: Markdown/history payload dominates if a one-H1 file improves completion | 2,889.4 / 5,724.1 / 6,077.6 ms | 5,724.1 ms | -8.2% | 100 / 100 / 100 | 562.3 MiB |
| projection-detached: Pinia consumer is material if detaching it improves completion | 4,260.0 / 5,253.8 / 4,598.1 ms | 4,598.1 ms | -26.2% | 1 / 1 / 1 | 553.9 MiB |
| watchers-disabled: watcher setup dominates if bypassing it improves completion | 8,417.2 / 5,715.3 / 5,901.8 ms | 5,901.8 ms | -5.3% | 100 / 100 / 100 | 574.8 MiB |

`list-hidden` and `projection-detached` intentionally do not materialize the normal row set. Their completion is document-ready only. They must not be relabelled or directly interpreted as row-ready improvements. The table supports two bounded observations:

- The Pinia consumer is material to workspace document completion in this run: detachment improved the common milestone, aggregate profile samples fell from 26,981 to 20,332, and `deepClone$2`/`inertControllerFacadeFile` disappeared from leading entries.
- Hiding the list improved the same milestone by a similar amount while the Pinia functions remained leading. The three-trial data cannot distinguish row/render work from timing variance strongly enough to rank it against the Pinia path. The prior “Opened Files DOM is not dominant” conclusion is withdrawn.

Tiny content and watcher bypass did not produce a comparable median improvement, so neither is supported as dominant at this fixture scale. Exact 150 completion and lack of renderer errors reject an observed hard capacity or measured-process memory ceiling through 150, but do not prove spare host capacity.

## Profile and code attribution

During baseline 100-file batches, aggregate leading entries included `structuredClone` (14.0%), `deepClone$2` (12.0%), `clone` (7.4%), and `inertControllerFacadeFile` (5.6%). With the list hidden, the same Pinia-related functions remained leading. With the Pinia projection consumer detached, `deepClone$2` and `inertControllerFacadeFile` were absent from leading entries while `structuredClone`, `clone`, `snapshotForRecord`, and other work remained.

The code shape is consistent with, but does not quantify, the profile:

- `WorkspaceController.execute()` serializes commands through `operationTail` (`workspace/controller.ts:182-184`, `529-545`), with one commit/notification per applied open.
- `WorkspaceProjectionMirror` obtains a full facade snapshot on each controller notification (`workspace/projectionMirror.ts:16-21`).
- `APPLY_WORKSPACE_PROJECTION` deep-clones facade/projection data and rebuilds tab/TOC compatibility state (`store/editor.ts:316-345`).
- `editorWithTabs/index.vue` has a second snapshot consumer (`components/editorWithTabs/index.vue:428-430`) that remains after the Pinia mirror is detached.
- Opened Files renders one component per item in a native `overflow: auto` container (`sideBar/tree.vue:54-61`, `572-575`). Static inspection finds no region wheel handler. The new list-hidden timing means DOM/render work is no longer ruled out by measurement.
- Every settled normal trial materialized one `.editor-component` and zero Source CodeMirror editors; there is no evidence of one hidden editor engine per Document.

The exact shares among command serialization, facade creation, Pinia clone/rebuild, the second snapshot consumer, Vue row rendering, structured clone/IPC, garbage collection, and host contention remain unknown.

## Native input and WYSIWYG independence

[`raw-input.json`](./07-opened-files-scale-pressure.raw-input.json) uses ten spare real files only to reach a settled 100-row floor after the documented startup race. It is input evidence, not capacity evidence.

| Trial | Actual rows | Actual viewport | Container | Wheel final position | Idle / wheel p95 | Wheel gaps >50 ms | Workspace revision | Physical thumb |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 108 | 1280×720 | 246×273 | 2,751 px | 33.3 / 33.2 ms | 0% | 0 | Unavailable |
| 2 | 109 | 1280×720 | 246×273 | 2,779 px | 33.2 / 33.1 ms | 0% | 0 | Unavailable |
| 3 | 107 | 1280×720 | 246×273 | 2,723 px | 33.6 / 33.4 ms | 0% | 0 | Unavailable |

`wheel.status` is `Passed` in all trials because real Playwright mouse-wheel input moved the hovered container without changing workspace revision. The right-edge pointer gesture left `scrollTop = 0`, so `scrollbarThumb.status` is `Unavailable`, not passed. Programmatic positioning reached the maximum with revision delta zero, but is explicitly `NotApplicableToInputAcceptance`.

The Opened Files wheel profiles do not contain the workspace facade/projection functions, and list scrolling never changes workspace revision. This remains independent from WYSIWYG scroll-report acceptance; there is no evidence for a shared scroll runtime.

## Findings by confidence

### Confirmed

- Exact ready-batch document completion and working set rise sharply from 20 to 100 to 150.
- No hard ready-batch capacity ceiling was observed through exactly 150 Documents and rows.
- Startup can plateau short after all main sends/watcher requests; ready-batch delivery avoids that loss in these measurements.
- Detaching the Pinia facade/projection consumer materially improves the common document-ready milestone and removes its leading profile functions, but does not explain the remaining 4.6 seconds.
- Native wheel input passes at the 100-row floor without workspace revisions; physical thumb automation is unavailable.
- Only one active editor engine is materialized.

### Ruled out as dominant in these probes

- Standard-fixture Markdown payload length.
- Main-process watcher registration.
- A hard 100- or 150-document ready-batch capacity boundary.
- A shared native-scroll/WYSIWYG bottleneck.

### Unknown or limited

- Whether Opened Files row/render work is independently material; the new list-hidden improvement prevents ruling it out, but three noisy trials do not isolate its share.
- The exact event lost between startup send and renderer application.
- The exact share of every remaining bulk-open stage and total host contention.
- Physical scrollbar-thumb and touchpad acceptance.
- Installed-package, Linux/macOS, and exact capacity above 150 behavior.

## Severity and separate follow-up seams

**Medium / P2 overall.** Startup completeness is a blocking acceptance criterion for any bulk-open repair but remains non-blocking for WYSIWYG scroll-performance acceptance. Bulk-open latency is reproducible at a realistic power-user scale and reaches a median 8.9 seconds at 150 in this run, with one 16.4-second trial, while the workspace stayed stable and native list wheel scrolling remained usable after settling.

Two separate repair specifications remain warranted:

1. **Startup delivery reliability:** add a renderer-ready delivery/ack boundary (or equivalent queue). Exact 20/100 sets with no spare files must produce an acknowledgement and exactly the requested Documents/rows.
2. **Bulk-open projection/render pressure:** instrument the existing controller-commit → projection/render consumers before choosing a repair. Preserve serialization, persistence, watcher coverage, selection, Document/View ownership, dirty Markdown/history, save/crash-draft safety, and native scrolling. The retained feedback command must become GREEN without weakening 1.5, while exact 150 completion remains intact.

Non-goals remain speculative virtualization, a shared scroll runtime, content truncation, hidden-editor retention, persistence redesign, Source large-document work, and unrelated cleanup. List virtualization is not justified by this investigation alone; the rerun says only that list work can no longer be ruled out.

## Raw evidence and execution status

| Raw | Command status | Purpose / limitation |
| --- | --- | --- |
| [`raw-feedback.json`](./07-opened-files-scale-pressure.raw-feedback.json) | Failed, exit 1 (intentional RED assertion after 6/6 exact trials) | 20/100 feedback loop |
| [`raw-ready-batch.json`](./07-opened-files-scale-pressure.raw-ready-batch.json) | Passed, exit 0 | exact 20/100/150 capacity and resource evidence |
| [`raw-startup-handoff.json`](./07-opened-files-scale-pressure.raw-startup-handoff.json) | Passed, exit 0 | startup delivery plateau; command pass does not mean exact product completion |
| [`raw-hypotheses.json`](./07-opened-files-scale-pressure.raw-hypotheses.json) | Passed, exit 0 | five one-variable, same document-ready milestone probes |
| [`raw-input.json`](./07-opened-files-scale-pressure.raw-input.json) | Passed, exit 0 | wheel pass; physical thumb unavailable; programmatic diagnostic only |
| [`raw-input-initial-failure.json`](./07-opened-files-scale-pressure.raw-input-initial-failure.json) | Failed, exit 1 | runtime-version read raced navigation before trial 1; retained rather than overwritten |

The initial input failure was repaired only by moving the runtime-version read after editor/menu readiness in harness commit `2e354d79cb383ffd56e0be87fcd1e9cc8e96ab69`; the final input run then passed from a clean tree.

## Exact raw reproduction commands

Run from the repository root. Each final raw also embeds its own command verbatim.

Feedback (expected command exit 1 while RED):

```powershell
$env:OPENED_FILES_APPLICATION_SOURCE_SHA='303dfa39b84b5bffedd9271b27cefbf34be66753'; $env:OPENED_FILES_COUNTS='20,100'; $env:OPENED_FILES_TRIALS='3'; $env:OPENED_FILES_SCENARIOS='baseline'; $env:OPENED_FILES_DELIVERY='ready-batch'; $env:OPENED_FILES_FEEDBACK_ASSERT='1'; $env:OPENED_FILES_OUTPUT='.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-feedback.json'; pnpm exec tsx '.scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts'
```

Exact ready batch:

```powershell
$env:OPENED_FILES_APPLICATION_SOURCE_SHA='303dfa39b84b5bffedd9271b27cefbf34be66753'; $env:OPENED_FILES_COUNTS='20,100,150'; $env:OPENED_FILES_TRIALS='3'; $env:OPENED_FILES_SCENARIOS='baseline'; $env:OPENED_FILES_DELIVERY='ready-batch'; $env:OPENED_FILES_FEEDBACK_ASSERT='0'; $env:OPENED_FILES_OUTPUT='.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-ready-batch.json'; pnpm exec tsx '.scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts'
```

Startup handoff:

```powershell
$env:OPENED_FILES_APPLICATION_SOURCE_SHA='303dfa39b84b5bffedd9271b27cefbf34be66753'; $env:OPENED_FILES_COUNTS='20,100'; $env:OPENED_FILES_TRIALS='3'; $env:OPENED_FILES_SCENARIOS='baseline'; $env:OPENED_FILES_DELIVERY='startup'; $env:OPENED_FILES_FEEDBACK_ASSERT='0'; $env:OPENED_FILES_OUTPUT='.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-startup-handoff.json'; pnpm exec tsx '.scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts'
```

Hypotheses:

```powershell
$env:OPENED_FILES_APPLICATION_SOURCE_SHA='303dfa39b84b5bffedd9271b27cefbf34be66753'; $env:OPENED_FILES_COUNTS='100'; $env:OPENED_FILES_TRIALS='3'; $env:OPENED_FILES_SCENARIOS='baseline,list-hidden,tiny-content,projection-detached,watchers-disabled'; $env:OPENED_FILES_DELIVERY='ready-batch'; $env:OPENED_FILES_FEEDBACK_ASSERT='0'; $env:OPENED_FILES_OUTPUT='.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-hypotheses.json'; pnpm exec tsx '.scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts'
```

Final native input:

```powershell
$env:OPENED_FILES_APPLICATION_SOURCE_SHA='303dfa39b84b5bffedd9271b27cefbf34be66753'; $env:OPENED_FILES_COUNTS='100'; $env:OPENED_FILES_TRIALS='3'; $env:OPENED_FILES_OUTPUT='.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-input.json'; pnpm exec tsx '.scratch/wysiwyg-scroll-performance/profile-opened-files-scale.ts'
```

## Install, build, lint, and typecheck status

| Check | Status | Exit | Exact command | Notes |
| --- | --- | ---: | --- | --- |
| install | Passed | 0 | `pnpm install --frozen-lockfile` | lockfile current; postinstall completed; pnpm printed an ignored-build-script warning for `uiohook-napi` |
| build | Passed | 0 | `pnpm --dir packages/desktop build` | production Electron/Vite bundle created; Vite printed non-fatal dynamic/static import chunk warnings |
| lint | Passed | 0 | `pnpm exec eslint .scratch/wysiwyg-scroll-performance/opened-files-evidence-identity.ts .scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts .scratch/wysiwyg-scroll-performance/profile-opened-files-scale.ts` | only the repository module-type performance warning |
| typecheck | Passed | 0 | `pnpm --dir packages/desktop typecheck` | `vue-tsc --noEmit -p tsconfig.json` |

One pre-install lint attempt failed with exit 1 because `eslint` was not yet installed (`'eslint' is not recognized`). It was an ordering/setup failure, not omitted; the exact final lint command above passed after the frozen-lockfile install.

One pre-final combined validation attempt reached `git diff --check` after lint and typecheck passed, then failed with exit 2 on three Markdown hard-break trailing spaces in this file. Those spaces were removed; the same diff check then passed as the final acceptance check.
