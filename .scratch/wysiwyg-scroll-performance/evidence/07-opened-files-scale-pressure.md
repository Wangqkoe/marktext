# Ticket 07 — Opened Files scale-pressure investigation

- Status: complete (diagnosis only; no production fix)
- Baseline: `27fb95338bffb0d0eb692ec32d1a8c4423809629`
- Branch: `codex/wysiwyg-scroll-07-opened-files-investigation`
- Recorded: 2026-09-06 America/Los_Angeles

## Outcome

The reproducible 100-plus-document cost is **workspace scale**, not native scrolling in the Opened files region. Reaching a settled window became materially slower and more memory-intensive as real documents increased: the median row-ready time grew from 2.3 s at 18–20 observed documents to 8.9 s at 107–110 and 15.8 s at 156–159; renderer working set grew from 166 MiB to 445 MiB and 527 MiB. Bulk startup also intermittently settled without entries for one to four explicit file paths; this investigation did not instrument the main-to-renderer handoff deeply enough to assign that loss to a specific message boundary.

Once settled, the Opened files region itself remained responsive. In all three corrected 100-floor and all three 150-floor trials, single-direction native wheel input moved the region by about 2,700 px and 4,100 px respectively, its p95 frame gap stayed at the calibrated headless cadence (31.6–31.7 ms), no gap exceeded 50 ms, no renderer error occurred, and the workspace revision delta was zero. Direct native-container positioning produced the same zero-revision result. Removing every Opened Files row while retaining every workspace document did not consistently improve a forced workspace-projection workload.

CPU profiles instead place the repeated work in full-workspace snapshot/projection paths: `controllerFacadeFile`/`inertControllerFacadeFile`, `deepClone`, `structuredClone`, `snapshotForRecord`, and garbage collection. These functions remained hot after the Opened Files DOM was unmounted. This evidence does **not** support list virtualization or a shared scrolling runtime.

## Environment and isolation

- Windows 11 Pro 10.0.26200, x64
- Intel Core i7-10700, 8 cores / 16 logical processors, 31.7 GiB RAM
- Electron 42.1.0, Node 24.18.0, pnpm 10.33.4, PowerShell 7.6.5
- Production `electron-vite build`, headless Electron renderer, 1280×720 viewport
- Every trial used a newly generated `C:\m7-*` root containing a separate `p` user-data profile and `c` corpus. The application was closed and the exact temporary root removed after each trial.
- No installed/user MarkText profile, running user window, or user document was read or modified.

The first build attempt failed because dependencies had not been installed (`electron-vite` was missing). `pnpm install --frozen-lockfile` used the locked dependency graph, after which the production build passed. The dependency preparation did not change tracked source files.

## Deterministic corpus and procedure

The retained runner is [`profile-opened-files-scale.ts`](../profile-opened-files-scale.ts). Each generated Markdown file is 6,129 bytes and contains one H1 followed by 40 plain paragraphs; it has no image, diagram, math, or remote-resource work. The CLI receives the corpus folder and every child Markdown path, causing one real folder-backed editor window to create real file-backed Documents and Opened Files entries.

The nominal scale floors were 10, 50, 100, and 150. Because bulk startup sometimes loses early open-tab IPC messages, each trial supplied ten spare real files and recorded both the target and actual settled count. A run was accepted only after it reached the scale floor. Each accepted state then waited one additional second before measurement.

For every trial the runner recorded:

1. time until all required real rows existed and time after the settled delay;
2. workspace Document count, Opened Files DOM rows, materialized editor count, process working sets, and renderer errors;
3. calibrated idle rAF gaps;
4. 40 native wheel operations over `.opened-files-list` plus a sampled CPU profile;
5. a headless physical scrollbar-thumb drag attempt and a deterministic direct update of the native container's scroll offset;
6. 40 frame-separated WYSIWYG scroll reports to induce real workspace commits, first with Opened Files rows mounted and then with the preference disabled so all those rows were unmounted while Documents remained live;
7. CPU profiles for both projection runs.

Raw data:

- [`07-opened-files-scale-pressure.raw-10-100-partial.json`](./07-opened-files-scale-pressure.raw-10-100-partial.json): three 10/50/100 baseline trials; marked partial because the original long-path launch could not start the 150 trial through `electron.cmd`.
- [`07-opened-files-scale-pressure.raw-scroll-repeat.json`](./07-opened-files-scale-pressure.raw-scroll-repeat.json): corrected single-direction wheel/direct-position data and three complete trials each at 100 and 150.

## Measurements

The table uses the three trials selected for each row: the first raw file for 10/50, and the corrected repeat for 100/150. Counts show every actual settled value, not the nominal label. Memory is sampled after the settled delay. The host's calibrated idle cadence is about 31–34 ms (roughly 30–32 Hz), so comparisons use the recorded idle cadence and retain the contract's `>50 ms` gap count.

| Scale floor | Actual Documents / rows | Median row-ready | Median settled | Median total working set | Median renderer working set | Idle p95 | Opened Files wheel p95 | Wheel `>50 ms` median | Wheel workspace revision |
| ----------: | ----------------------- | ---------------: | -------------: | -----------------------: | --------------------------: | -------: | ---------------------: | --------------------: | ------------------------ |
|          10 | 19 / 20 / 18            |           2.26 s |         3.26 s |                  468 MiB |                     166 MiB |  33.5 ms |                33.1 ms |                    0% | 0 / 0 / 0                |
|          50 | 60 / 58 / 60            |           3.93 s |         4.94 s |                  597 MiB |                     271 MiB |  33.8 ms |                33.2 ms |                    0% | 0 / 0 / 0                |
|         100 | 107 / 110 / 108         |           8.90 s |         9.90 s |                  808 MiB |                     445 MiB |  31.7 ms |                31.6 ms |                    0% | 0 / 0 / 0                |
|         150 | 156 / 159 / 158         |          15.84 s |        16.85 s |                  906 MiB |                     527 MiB |  31.6 ms |                31.7 ms |                    0% | 0 / 0 / 0                |

At 100 and 150, every corrected wheel trial moved to the bottom range (2,683–2,767 px and 4,055–4,139 px). Directly positioning the same native container reached exactly the same recorded maximum, had p95 31.6–31.7 ms, had zero `>50 ms` gaps, and changed workspace revision by zero in all six trials.

The automated mouse attempt did not grip Chromium's physical scrollbar thumb in headless mode: all six corrected trials remained at `scrollTop = 0`. It is retained as a negative automation result, not reported as physical-thumb acceptance. The direct-offset result verifies the container path but cannot substitute for a physical-device thumb test.

### Projection/DOM causal comparison

The 40-report projection workload completed in the following medians:

|   Scale | Rows mounted | Rows unmounted; Documents retained |    Difference |
| ------: | -----------: | ---------------------------------: | ------------: |
|   18–20 |     1,349 ms |                           1,323 ms | +2.0% mounted |
|   58–60 |     1,361 ms |                           1,322 ms | +3.0% mounted |
| 107–110 |     1,344 ms |                           1,264 ms | +6.3% mounted |
| 156–159 |     1,622 ms |                           1,612 ms | +0.6% mounted |

Trial direction was not consistent: in corrected 100/150 results, one 100 trial and one 150 trial were faster mounted than unmounted. The retained ordering is always mounted then unmounted because attempting to re-enable the region mid-trial once failed to remount within 30 seconds. Therefore warm-cache/order effects remain a limitation. The reliable conclusion is only that unmounting rows does not remove the dominant cost; the data is insufficient to assign a smaller percentage to row DOM or its per-row subscription.

All Documents remained in the workspace when the rows were unmounted, and the production DOM contained one `.editor-component` and zero Source editors in every run. This rules out 100+ simultaneously materialized hidden editor engines. It does not rule out background per-Document state, watchers, persistence bookkeeping, or projection subscribers.

## Code and profile attribution

- The region renders one Vue component for every filtered item with no virtualization at `tree.vue:58`, and the native list owns `overflow: auto` at `tree.vue:574`. Static inventory finds no scroll or wheel handler in `tree.vue` or `treeOpenedTab.vue`.
- Each row obtains the editor store and a `currentFile` ref at `treeOpenedTab.vue:28-30`, so row-level reactive invalidation is plausible, but DOM removal did not consistently reduce the measured projection workload.
- Every controller commit causes `WorkspaceProjectionMirror` to call `getFacadeSnapshot()` and notify its listener (`projectionMirror.ts:16-20`). `getFacadeSnapshot()` maps every View and includes Markdown, portable history, cursor, selection, TOC, and status (`controller.ts:868-895`).
- `editorStore.APPLY_WORKSPACE_PROJECTION()` then deep-clones that full facade, deep-clones its projection, rebuilds the entire focused-pane tab array and index, and rebuilds TOC trees (`editor.ts:316-345`).
- `pane.vue:86-88` derives pane files by running `documents.find(...)` for every pane tab, an O(N²) lookup shape when that computed value is invalidated.
- Production composition separately subscribes DocumentIO and crash-draft synchronization to every runtime commit (`singlePaneComposition.ts:121`, `312-328`, `693-725`); both obtain or scan all document snapshots even when most documents are inactive.
- At 100, the aggregated projection CPU samples were led by `inertControllerFacadeFile`, `deepClone`, `structuredClone`, `snapshotFor`, and GC with rows mounted; the same clone/snapshot functions remained dominant with rows unmounted. At 150, `controllerFacadeFile`, `deepClone`, `structuredClone`, and `snapshotForRecord` led both variants. Opened Files wheel profiles, by contrast, were overwhelmingly `(idle)`/`(program)` with only hit-testing samples and no workspace projection functions.

## Findings by confidence

### Confirmed

- Startup/setup latency and renderer/total working set increase materially between about 20, 60, 110, and 158 real open Documents.
- The settled product renders one active WYSIWYG editor, not one hidden editor per open Document.
- Native Opened Files wheel scrolling is smooth relative to calibrated idle cadence at 100+ and does not publish a workspace revision.
- Direct changes of the Opened Files native scroll offset likewise do not publish workspace state.
- WYSIWYG scroll reports do enter the workspace projection path, and their cost grows at high Document counts; Opened Files scrolling itself does not enter that path.
- Full-facade snapshotting/cloning, focused-pane descriptor reconstruction, and whole-workspace subscribers remain active when the Opened Files DOM is removed.
- CLI batch startup is unstable under this high fan-out method: ten spare files produced only 7–10 spare settled entries, and earlier trials finished up to two entries short with only one spare.

### Ruled out for the observed settled scrolling result

- A shared Chromium/native-scroll frame ceiling specific to Opened Files.
- The WYSIWYG scroll-report handler being invoked by Opened Files wheel/direct scrolling.
- Simultaneous materialization of a background editor engine for every open Document.
- List DOM scale as the dominant source of forced projection cost.
- A justification for speculative list virtualization or a shared runtime scroll engine.

### Unknown or limited

- Physical scrollbar-thumb behavior and physical touchpad behavior; headless automation could not validate them.
- Exact time shares among facade construction, the second Pinia deep clone, O(N²) pane-file mapping, DocumentIO synchronization, crash-draft scanning, main-process file watchers, and garbage collection.
- Whether row component subscriptions contribute a small incremental cost; the mounted/unmounted ordering and noise do not support a precise claim.
- Whether ordinary sequential UI opening drops requests like the high-fan-out CLI startup path.
- Installed-package behavior and Linux/macOS behavior; this run used a production development build on Windows only.
- A hard memory ceiling above 159 settled Documents; 159 completed without renderer errors, but continuing higher would add little causal confidence and more host pressure.

## Severity

**Medium / P2, non-blocking for the WYSIWYG scroll-performance acceptance.** The issue is reproducible at a realistic power-user scale and creates 9–17 second setup time plus roughly 0.8–0.9 GiB aggregate application working set. It also exposes a possible bulk-open reliability problem. However, the window remained stable through 159 Documents, renderer errors stayed at zero, and the Opened files region remained responsive once settled. No data loss, crash, or unusable settled scrolling was observed.

## Smallest supported remediation seam

The narrowest evidence-backed seam is the **workspace commit → facade/projection consumer boundary**, not the Opened Files overflow container. A follow-up should first prevent unrelated View-only commits from rebuilding and cloning all document content and from waking whole-document subscribers without a relevant document/ownership change. Within that seam, measurements should separately counter:

1. `WorkspaceController.getFacadeSnapshot()` full-document construction;
2. `editorStore.APPLY_WORKSPACE_PROJECTION()` full-facade clone and descriptor/TOC rebuild;
3. `paneFiles` tab-to-document lookup shape;
4. DocumentIO and crash-draft all-document scans.

The repair should choose the smallest of these that accounts for the measured latency. It must preserve Document/View ownership, dirty content, portable history, save/crash-draft safety, file watchers, and current native scroll semantics.

## Follow-up recommendation

A focused repair specification is warranted for **100+ Opened Files workspace capacity**, independent of the current WYSIWYG acceptance. Suggested user-visible scope:

- opening an acknowledged deterministic set must yield the complete set of Opened Files entries;
- at 100 real Documents, setup and ordinary workspace interactions must not degrade superlinearly relative to a 20-document baseline;
- Opened Files native wheel/direct scrolling must remain at calibrated idle cadence with `>50 ms` gap rate no greater than 5% and workspace revision delta zero;
- a non-content View update must not clone every Document's Markdown/history, rebuild unchanged TOC, or issue unchanged DocumentIO work;
- memory and per-commit work must be reported at 20/50/100/150 with the same corpus and three-trial medians.

Recommended non-goals: list virtualization without new evidence, a shared scrolling runtime, changing Chromium input physics, changing persistence semantics, keeping hidden editors alive, or folding Source large-document capacity into this work.

## Commands run

```powershell
pnpm install --frozen-lockfile
pnpm --dir packages/desktop build
pnpm exec tsx .scratch/wysiwyg-scroll-performance/profile-opened-files-scale.ts
```

The runner was also invoked with bounded `OPENED_FILES_COUNTS`, `OPENED_FILES_TRIALS`, and `OPENED_FILES_OUTPUT` values for smoke, corrected 100/150 repeats, and setup-boundary diagnosis. No production source was changed.

## Verification

- Passed: production `pnpm --dir packages/desktop build`.
- Passed: `pnpm --dir packages/desktop typecheck`.
- Passed: Prettier check and ESLint for the retained runner.
- Passed: focused production renderer scroll E2E, 3/3.
- Full Vitest: 77 test files passed, 1 failed; 1,030 tests passed, 10 failed, 1 skipped. All ten failures are the existing `test/unit/specs/source-code-image-action.spec.ts` loader failing before its assertions with `ReferenceError: computed is not defined` at line 53. An isolated rerun reproduced the same 10/10 failures. Ticket 07 changes no production or test code, so this is recorded as a non-blocking baseline item rather than expanded into an unrelated repair.
