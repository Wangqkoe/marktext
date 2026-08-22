# 02A: Independently review and accept the emergency auto-save/external-change repair

**What to review:** Verify that local repair `26b09ea6` prevents an external write made immediately after MarkText auto-save from being mistaken for MarkText's own watcher event and overwritten by the user's next auto-save, without regressing ordinary save suppression, CRLF preservation, external clean reload or dirty-conflict behavior.

**Blocked by:** 02: Audit document integrity and external file changes.

**Status:** resolved

## Minimal emergency specification

The save path must identify the exact bytes MarkText wrote. The watcher may suppress a matching own-save event only while the current disk bytes still match that saved content. If another process has replaced the bytes, the event must reach the renderer so a clean tab reloads and a dirty tab enters conflict handling. The repair must not change the existing CRLF/encoding write contract or weaken atomic saves.

- [x] A minimized Electron regression fails for the recorded P0 reason before product modification and passes 2/2 after repair.
- [x] Unit tests prove that identical saved bytes are ignored and externally changed bytes are not ignored.
- [x] W1 and ordinary W3 controls pass, including Unicode path, CRLF, relative image, auto-save, clean reload and dirty conflict.
- [x] Directly related prior-art E2E tests pass 19/19.
- [x] Desktop type checking and the production build pass.
- [x] Full unit tests pass after review remediation: 772 passed, 1 skipped. One unrelated theme test timed out once under parallel load and then passed 5/5 in isolation; the complete suite passed when rerun alone.
- [ ] Full Electron E2E is green. After review remediation, 250 tests passed and 4 were skipped; the only two failures are the separately recorded, deferred find-navigation P2 cases.
- [x] Touched-file lint has zero findings; the only output is Node's root configuration module-type warning.
- [x] Independent Standards + Spec review confirms the persistence, file-sync and IPC repair after required remediation.
- [x] Implementation is committed locally as `26b09ea6` and is not pushed to GitHub.
- [x] Review remediation is committed locally as `6e4b113c` and is not pushed to GitHub.

## Review focus

- Confirm the SHA-256 contract is computed from the exact encoded bytes passed to the atomic writer.
- Confirm an external write cannot satisfy or consume the own-save suppression entry merely because it occurs inside the time window.
- Check event ordering, entry consumption, cloud-drive/stat fallback and failure behavior when the watched file cannot be read.
- Treat the deferred find-navigation candidate as out of scope unless evidence connects it to this repair.

## Initial independent review and required remediation

The Standards and Spec reviews were performed independently against fixed point `463df5d1`.

### Standards axis

- No documented coding-standard violation or serious maintainability issue was found.
- Low-impact observation: the original `isOwnSaveEvent` name described a verified event even though the time/stat window produced only a candidate. The required queue repair naturally made this distinction explicit as `isOwnSaveCandidate`; this was not treated as a separate reason to change product code.
- Low-impact observation: the three audit E2E cases repeat launch/cleanup lifecycle setup. Extracting a test helper may improve maintenance later, but changing stable audit harness code is deferred.

### Spec axis

- Serious finding: `_shouldIgnoreEvent` removed the first eligible entry before content verification and returned `false` on its first hash mismatch. With rapid/coalesced saves, an older queued hash could therefore prevent a newer matching save from being recognized. The resulting false external-change notification could cancel a pending auto-save.
- Low-impact observation: the full E2E suite is not completely green only because of the already recorded, unrelated find-navigation P2. It remains deferred under the approved review policy and must not be reported as passing.

### Diagnosis and remediation evidence

- A minimized unit regression failed deterministically before the repair because an older mismatched hash prevented a newer queued hash from matching.
- A user-level Electron regression failed 2/2 before the repair: one run showed a false external-change notification and one run left the second auto-save absent from disk.
- The watcher now scans all eligible queued entries, retains active mismatches for a later event, removes expired entries, and consumes the matching entry plus only older superseded entries. A matching older event preserves newer entries for out-of-order delivery.
- The minimized watcher unit target passes 4/4.
- The original P0 regression and the queued-save regression pass 4/4 over two repeats.
- The complete audit and directly related prior-art Electron set passes 23/23.
- Desktop type checking and production build pass.
- Full unit tests pass: 772 passed, 1 skipped.
- Full Electron E2E result is exactly 250 passed, 4 skipped, 2 known/deferred find-navigation P2 failures.

## First post-remediation review and concurrency repair

Both independent reviewers identified the same remaining serious race: Chokidar/EventEmitter does not await asynchronous listeners, so two same-file checks could overlap at `readFile`. The first check could splice the queue while the second retained a stale index and returned `false`, forwarding an own-save event as an external change.

- A deterministic concurrent unit regression failed before this repair with `[true, false]` instead of `[true, true]`.
- Checks are now serialized per window and pathname. Each event reads and consumes a consistent queue state, while events for unrelated files remain independent.
- The concurrent regression passes and proves both results are `true` with a maximum of one active disk read.
- The watcher unit target passes 5/5; the complete unit suite passes 772 tests with 1 skipped.
- The original P0 and queued-save regressions pass 8/8 across four parallel workers.
- The final full Electron suite passes 250 tests with 4 skipped; only the two known/deferred find-navigation P2 cases fail.
- A separate W1 audit automation case intermittently truncates synthetic `keyboard.type` input or restores focus at the wrong location. It passed in the final full suite but failed in isolated/related repetitions; there is no connection to the watcher modules or confirmed manual product defect, so it is recorded and deferred as automation/inconclusive evidence.

### Deferred low-impact review observations

- Repeated audit E2E launch/cleanup scaffolding may be extracted later.
- The non-polling cloud-drive/stat fallback and read-failure fail-safe behavior are not directly unit-tested. Static review confirms both branches forward rather than suppress uncertain events; additional branch coverage is deferred.
- The known find-navigation P2 remains unchanged.
- The W1 synthetic keyboard-input instability remains an automation/inconclusive candidate; no product change is authorized from that evidence.

## Final independent re-review

### Standards axis

- No serious findings remain.
- The per-window/per-path gate is FIFO, always released from `finally`, does not collide on valid Windows paths, and leaves unrelated paths independent. Tail identity prevents an earlier check from deleting a newer waiter.
- LF-only formatting and final newlines are compliant; `git diff --check` is clean and the repository's local-only/no-push constraint was followed.
- Additional exception-release, close-during-flight and unrelated-path-parallel unit tests are maintenance hardening only and are deferred.

### Spec axis

- No serious findings remain.
- The exact encoded bytes passed to atomic write remain the source of the saved-content hash. External different bytes cannot match, uncertain stat/read failures are forwarded, and active/matching queue entries have the required retention and consumption order.
- CRLF, encoding and atomic-write contracts are unchanged.
- Missing direct branch tests for the stat fallback and read failure are recorded as low-impact coverage work and deferred.

Ticket 02A is accepted with the explicit full-suite exception for the known find-navigation P2. The W1 synthetic-input automation candidate and all other low-impact review observations remain recorded for later work.
