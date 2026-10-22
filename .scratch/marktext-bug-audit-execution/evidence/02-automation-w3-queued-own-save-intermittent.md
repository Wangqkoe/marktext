# Candidate evidence record: `W3-QUEUED-OWN-SAVE-INTERMITTENT`

## Identity and environment

- Observed at (local date/time and timezone): 2026-10-21 08:30–19:54 -07:00, triaging the daily-plan item "`audit-document-integrity:303` fails intermittently in the full suite; 5 isolated reruns pass".
- Target: `packages/desktop/test/e2e/audit-document-integrity.spec.ts:303`, "queued own-save events do not interrupt a newer pending auto-save" (added by `6e4b113c`; see [02-p2-queued-own-save-event-order.md](02-p2-queued-own-save-event-order.md)).
- Tested build: `packages/desktop/out/` built 2026-10-21 08:34 by `pnpm run build:unpack` on `230dc862` (branch `codex/upstream-commonmark-parse`). It does not contain `0a2eb858` or later. The commits since then (`0a2eb858`..`9e8bca00`) touch only `packages/muya/src/` parser code and docs, not the watcher, DocumentIO or this spec.
- OS and runtime: Windows 11 Pro 10.0.26200; Electron `42.1.0`; Playwright desktop config (`workers: 1`).
- Repository constraint: no source, test or config file was modified. All diagnostics ran from the session scratchpad.

## Diagnostic method

- Playwright `--trace` cannot record these specs: they launch Electron through `_electron.launch` in `helpers.ts`, outside the test fixtures. Playwright also deletes `NODE_OPTIONS` before it spawns Electron.
- Workaround: on Windows, `getElectronPath()` resolves `node_modules/.bin/electron.cmd` against the current directory. So Playwright was started from a scratch directory that contained a wrapper `electron.cmd`. The wrapper set `NODE_OPTIONS=--require hook.cjs` and then called the real shim. Inside the Electron main process, the hook:
  - appended `-v -v -v`, which turns on the watcher's existing raw-event logging;
  - timestamped main-process console output into a per-profile log;
  - wrapped `ipcMain.emit`, `ipcMain.handle` and `webContents.send`, logging file/save/document channels and the `W3-*` markers in each payload.
- Caveat: the hook wraps IPC, so hooked runs may not have the same timing as unhooked ones.
- The scripts (`hook.cjs`, `run.ps1`, `loop.ps1`, `nohook*.ps1`) live in the session scratchpad and are not durable. Recreate them from this description if needed.

## Results for the target test

| Run (2026-10-21, -07:00) | Mode | 303 result | Position in run | Duration |
|---|---|---|---|---|
| Smoke ×5 (08:36–08:39) | hooked, 303 only | 5/5 passed after the hook was fixed | — | 6.4–7.0 s |
| `full-1` 08:39–09:00 | hooked, full suite | passed | test 12 | 6.4 s |
| `full-2` 09:00–09:19 | hooked, full suite | passed | test 12 | 6.5 s |
| `full-3` 09:19–09:39 | hooked, full suite | passed | test 12 | 6.3 s |
| `nohook-full` 19:32–19:54 | unhooked, full suite | passed | test 12 | 6.6 s |

- 303 did not fail in 4 full-suite rounds or 7 isolated runs (5 hooked smoke runs plus 2 earlier runs where the hook was not yet active). No failing assertion or failure-time log was captured.
- 303 is the 12th test of the serial suite and starts about one minute in. That rules out the idea that it fails only "late in the suite under load". It also argues against a dependence on earlier specs, since only 11 tests run before it.
- No prior failure artifact survives. `packages/desktop/test-results/.last-run.json` recorded `passed` before this triage started.

## Finding: the test now exercises a superseded path

- Every hooked run, isolated or full, shows the same sequence. Saves A and B land about 200 ms apart. About 1.2 s after B, the main process sends `mt::update-file` with type `change` and markers `[W3-QUEUED-SAVE-A, W3-QUEUED-SAVE-B]`. The legacy watcher's own-save recognition (`Watcher._shouldIgnoreEvent`, `watcher.ts:553`) therefore fails deterministically for this file. This is not intermittent.
- The test still passes because the renderer drops that message: `LISTEN_FOR_FILE_CHANGE` returns early when `workspaceFor(this)` is bound (`editor.ts:2256`). Since `74671f3d` ("auto-save workspace documents") and `bffd1616` ("reload workspace documents changed on disk"), workspace documents save and observe disk changes through DocumentIO / `FileObservationHub` (`fileObservation.ts`). Saves are not registered through `windowManager`'s `ignoreChangedEvent` for this path.
- In `FileObservationHub`, a guarded save and watcher-event handling run on the same per-file `serialize` queue. A successful save sets `lastObservedDiskRevision` to the landed hash before it returns (`fileObservation.ts:288-368`), and a watcher event whose disk hash equals that revision is skipped (`fileObservation.ts:433-457`). A static read finds no timing window equivalent to the legacy watcher race.
- Consequence (inference, not tested): 303 asserts the legacy watcher contract its name describes, but a pass no longer proves that contract holds. A failure does not necessarily point at DocumentIO either. Its assertions (no `.editor-notifications`, C reaches disk) are only indirectly tied to the code that now decides own-save versus external change.

## Retracted hypothesis

- Before the runs, I guessed that the full suite stretched timing until B landed between chokidar emitting A's event and `_shouldIgnoreEvent` reading the file, so B's own event looked external. That mechanism belongs to the legacy watcher, which no longer gates workspace documents. Given the DocumentIO serialization above, the guess is withdrawn.

## Other intermittent failures observed (not 303)

Run totals: `full-1` 443 passed / 6 failed / 11 skipped; `full-2` 444 / 5 / 11; `full-3` 445 / 4 / 11; `nohook-full` 445 / 4 / 11 plus one `Worker teardown timeout`. The isolated unhooked rerun (19:24–19:28: seven spec files, `--repeat-each=3`) gave 87 passed / 3 failed, plus one `Worker teardown timeout`.

| Test | Hooked full ×3 | Unhooked isolated ×3 | Unhooked full ×1 |
|---|---|---|---|
| `concise-titlebar.spec.ts:17` | 2 failed | 3/3 passed | passed |
| `toc-scroll.spec.ts:141` and `:171` | 2 failed | 3/3 passed | passed |
| `workspace-transfer-target-window-close.spec.ts:67` | 2 failed | 3/3 passed | passed |
| `editor-input.spec.ts:38` | 1 failed | 3/3 passed | passed |
| `details-disclosure.spec.ts:233` | 2 timed out (30 s) | 1 timed out | passed |
| `workspace-details-composition.spec.ts:22` | 2 timed out (30 s) | 1 timed out | passed |
| `issue-5344-image-content-hash.spec.ts:76` | 2 failed (`insertImageFromPath` link stays `""`) | 1 failed, same assertion | failed, same assertion |
| `audit-document-integrity.spec.ts:247` | 3/3 passed | not run | timed out (60 s, no step-level detail) |
| `details-disclosure.spec.ts:141` | 3/3 passed | 3/3 passed | failed (`.mu-preview-tools li.item.edit` not visible) |
| `split-workspace.spec.ts:234` | 3/3 passed | not run | failed |

- Confound: both unhooked runs (19:24–19:28 and 19:32–19:54) overlapped another session's `external-reload-undo` recheck. Per [the upstream review log](../../../docs/upstream-review/2026-10-19-upstream-develop.md) that recheck ran `--repeat-each=30` with 8 parallel workers, between commits `0f0ac272` (19:23) and `9e8bca00` (19:56). Failures that appeared only in the unhooked runs may therefore be load-induced. The hooked-versus-unhooked comparison is not a controlled experiment. Whether other e2e work overlapped the hooked runs (08:39–09:39) was not checked.
- Tests that failed without the hook: `details-disclosure:233`, `workspace-details-composition:22` and `issue-5344:76` all failed with the same assertion or timeout in hooked and unhooked runs. That is enough to say they are intermittent independent of the hook, though possibly made worse by load.
- Tests that failed only under the hook (`concise-titlebar:17`, `toc-scroll:141/171`, `window-close:67`, `editor-input:38`): unresolved. The hook's IPC wrapping and spec order are both plausible causes, and one confounded unhooked round cannot separate them.
- Side note: the upstream review log line for that recheck says the build matched HEAD (`0f0ac272`). The `out/` directory present at the time was this triage's 08:34 build of `230dc862`, which does not contain `0a2eb858`. Its effect on the `external-reload-undo` recheck is probably small but has not been verified.

## Classification

- 303: intermittent failure **not reproduced** (0 failures in 4 full rounds and 7 isolated runs); cause unknown. The test's coverage target has drifted to a superseded path. Automation/test-design issue; no product severity assigned.
- Legacy watcher misfire for workspace documents: confirmed and deterministic, currently harmless because the renderer discards it. Dead-path cleanup candidate; no severity.
- Other intermittent failures: automation/inconclusive; see the confound above.

## Next actions (not started; each needs the user's decision)

1. Redesign 303, and probably 247, to assert DocumentIO behaviour directly, for example the DocumentIO conflict/reload notification or the absence of a main-process conflict for own saves, instead of relying on the legacy watcher contract.
2. Decide whether to remove or document the legacy `ignoreChangedEvent` path for workspace documents.
3. Triage the intermittent e2e set in a dedicated session with no concurrent e2e load. Run at least two clean unhooked full rounds before attributing anything to the hook.
4. If 303 fails again before step 1, recreate the hook described above and collect the main-process log for that run.
