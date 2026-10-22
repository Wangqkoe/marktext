# Candidate evidence record: `CLOSE-HANG-AFTER-CONFLICT-CHECKPOINT`

## Identity and environment

- Observed at (local date/time and timezone): 2026-10-22 03:06–03:10 -07:00, while checking which outcome the rewritten W3 race test takes. See [02-automation-w3-queued-own-save-intermittent.md](02-automation-w3-queued-own-save-intermittent.md) for the earlier triage.
- Build: `E:/mt-wt/docio` at `2081d82e` (`test/documentio-own-save-e2e`, based on `6aee6b3c`), `pnpm run build:unpack` at 2026-10-22 00:11. The branch has since been rebased and fast-forwarded into `main` as `21430295`; only test files differ from `6aee6b3c`.
- OS and runtime: Windows 11 Pro 10.0.26200; Electron `42.1.0`; Playwright desktop config (`workers: 1`). No other e2e process ran during the observation.
- Instrumentation: a main-process `--require` hook, injected through a wrapper `electron.cmd`, that timestamps console output and logs `ipcMain.handle`/`webContents.send` traffic. Because the hook wraps IPC it may change timing, so treat the observation as hook-conditioned until reproduced without it. The method is described in the earlier record.

## Input and controlled clean state

- Test: `audit-document-integrity.spec.ts`, "an edit made before an external change is observed never overwrites it", run with `--repeat-each=5 --retries=0`.
- Sequence: open the F3 fixture with auto-save at 100 ms; auto-save a marker; write an external change; immediately append an edit in source mode. Auto-save of that edit returns `conflict`, DocumentIO then sends a `conflict` observation, and the test closes the window with `closeDiscardingChanges`, which answers the close prompt with "Don't Save".

## Expected and actual behavior

- Expected: the close prompt returns `discard`, the renderer discards the crash-recovery draft, unbinds the document, and the window closes.
- Actual: 3 of 5 runs did that. In runs 2 and 4 the window never closed; `app.close()` waited until the 60 s test timeout, followed by `Worker teardown timeout of 30000ms exceeded`.
- Main-process IPC sequence (only `mt::workspace::crash-draft`, `confirm-document-close` and `document-io` `unbind` shown):

| Run | Result | Crash-draft activity before close | After `confirm-document-close` |
|---|---|---|---|
| 1, 3, 5 | passed | last checkpoint right after the conflicting auto-save; none after the `conflict` observation | `discard` > `mark-clean` > `unbind` > `mark-clean` |
| 2, 4 | hung | an extra checkpoint about 6 ms after the `conflict` observation | one `checkpoint`, then nothing |

- `confirm-document-close` maps "Don't Save" (button 1) to `discard` (`packages/desktop/src/main/ipc/documentIO.ts:133-156`), so both groups received the same decision. The divergence is in the renderer's close handling after that decision.
- In all 5 runs DocumentIO behaved identically before close: one `durable-success` auto-save, one `conflict` auto-save, then one `conflict` observation about 0.9 s later. None of the DocumentIO assertions failed.

## Reproduction and classification

- With the hook: 2/5 hung on close.
- Without the hook: this test passed 10/10, in two `--repeat-each=5` runs before and after the rebase. The close hang was not observed there, which neither confirms nor rules it out.
- Inference (not verified): when a crash-recovery checkpoint is written for a document already in the DocumentIO conflict state, a later "Don't Save" close writes another checkpoint instead of discarding, and the close never completes. That may be the path `ecf2d2c2` ("preserve dirty document when discard is not durable") added, triggered by a discard that the conflict state makes non-durable. This may also explain the recurring `Worker teardown timeout` entries in full-suite runs, but that link is unverified.
- Severity: unassigned. If it reproduces without instrumentation, the user-visible effect would be a window that cannot be closed after choosing "Don't Save" on a conflicted document.

## Next actions (not started)

1. Reproduce without the hook: force the extra checkpoint deterministically, for example by waiting for the `conflict` observation and for a checkpoint before closing, and check whether "Don't Save" still hangs.
2. If it reproduces, trace the renderer close path from the `discard` decision through crash-draft discard to `unbind` for a document whose `conflict` flag is set, and decide whether it is a product defect.
3. Until then, `closeDiscardingChanges` in dirty-conflict e2e tests can hang a worker. A failure that reports only a test timeout plus `Worker teardown timeout` should be checked against this record first.
