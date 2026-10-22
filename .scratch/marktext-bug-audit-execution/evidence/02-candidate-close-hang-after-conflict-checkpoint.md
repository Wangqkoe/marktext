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
- The hook did not record crash-draft responses (`durable`, `reason`), only the requests.

## Close path in the renderer

- On "Don't Save", `PaneEditorComposition` calls `syncCrashDraft()` and then `resolveCrashDraft(documentId, 'discard')`. If no crash-draft receipt is held for the document, `resolveCrashDraft` returns `false` and the close returns `failed` without sending `discard` (`packages/desktop/src/renderer/src/workspace/singlePaneComposition.ts:633-638`, `:840-857`). That matches the hung runs' "checkpoint, then nothing", but it does not explain why no receipt was held.

## Unhooked probe (2026-10-22 08:58–09:01 -07:00)

- Build: `E:/mt-wt/docio`, `pnpm run build:unpack` after the rebase onto `b3bde16b`; product code equals `main` at `b3bde16b`. No other e2e process ran.
- Method: a throwaway Playwright spec (not committed) wrapped the main-process `mt::workspace::crash-draft` handler through `ipcMain._invokeHandlers` from `app.evaluate`. It could delay `checkpoint` responses and appended every request and response to a log file. Flow: auto-save at 100 ms, append edit A, wait until A is on disk, raise the auto-save delay to 10 s, append edit B, optionally write an external change and wait 3 s for the conflict observation, then close the window answering "Don't Save" and count windows after 8 s.
- Results (one run per variant):

| Checkpoint delay | External change | Window closed | `saved` sent after the checkpoint of unsaved edit B? |
|---|---|---|---|
| 0 ms | no | yes | no (`saved` followed the rev 3 checkpoint; B was rev 4) |
| 0 ms | yes | yes | **yes** (rev 4 checkpoint at 427 ms, `saved` at 457 ms) |
| 1500 ms | no | yes | **yes** (rev 4 checkpoint at 3329 ms, `saved` at 3365 ms) |
| 1500 ms | yes | yes | **yes** (rev 4 checkpoint at 3355 ms, `saved` at 3390 ms) |

- Every response in all four variants was `durable: true`, except one `mark-clean` that returned `unresolved crash drafts remain`. After the wrongly targeted `saved`, a checkpoint of the same revision (rev 4) was accepted as durable (at 3047 ms and 6055 ms in the external-change variants), and at close a rev 5 checkpoint and `discard` both succeeded.

## Correction to the earlier inference

- This record previously inferred that a checkpoint of an already-tombstoned revision is refused as stale, so the renderer holds no receipt and "Don't Save" cannot complete. The probe refutes that: same-revision checkpoints after the tombstone were durable, and the window closed in every variant. That inference is withdrawn.
- The close hang seen in the hooked runs remains unexplained and was **not reproduced** without the hook. Untested candidates: close handling while the document's DocumentIO `conflict` flag is set, or timing that the hook's IPC wrapping introduces. Its link to the full-suite `Worker teardown timeout` entries is also unverified.

## Finding: a save can tombstone the crash draft of a newer, unsaved edit

- Mechanism (from code, confirmed by the probe's request order):
  - After a durable save, `PaneEditorComposition.execute` calls `resolveCrashDraft(documentId)` with the default `saved` action.
  - `resolveCrashDraft` first awaits the whole crash-draft queue (`crashDraftTail`) and only then reads the document's current receipt (`singlePaneComposition.ts:840-842`).
  - A checkpoint for a later edit that was queued meanwhile lands first and replaces that receipt. The `saved` disposition is therefore sent for the newer revision, whose content was never saved. The main process tombstones it, because `acknowledgeSave` only checks that the receipt's revision is the latest one on record (`packages/desktop/src/main/crashDraftRecovery/index.ts:138-144`).
  - The renderer then deletes the document's receipt.
- Observed frequency: 3 of 4 probe runs, including 1 of 2 runs with no injected delay.
- Effect (inference): from the wrong `saved` until the next durable checkpoint, the unsaved edit has no live crash draft. In the probe that gap lasted 1.6–2.6 s. It ended at a same-revision checkpoint triggered by the conflict observation, or at the close-time rev 5 checkpoint. In normal use it ends at the next runtime update that triggers a checkpoint, such as the next edit. A crash inside the gap would lose that edit from crash recovery. The document on disk and in the editor is unaffected.
- Classification: candidate product defect in crash-draft bookkeeping, severity unassigned; narrow window, crash-recovery data only.

## Next actions (not started; each needs the user's decision)

1. Crash-draft race: bind the disposition to the saved revision. Read the receipt for the revision that was saved, or skip the `saved` disposition when the current receipt is newer than the save. Add a renderer unit test that lands a newer checkpoint between a durable save and `resolveCrashDraft`.
2. Close hang: reproduce without the hook. For example, close while the document is in the DocumentIO conflict state with a checkpoint written after the conflict observation, and trace the close path if it hangs.
3. Until then, a failure that reports only a test timeout plus `Worker teardown timeout` after closing a dirty document should be checked against this record first.
