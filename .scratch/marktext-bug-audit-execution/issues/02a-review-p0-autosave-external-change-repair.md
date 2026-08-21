# 02A: Independently review and accept the emergency auto-save/external-change repair

**What to review:** Verify that local repair `26b09ea6` prevents an external write made immediately after MarkText auto-save from being mistaken for MarkText's own watcher event and overwritten by the user's next auto-save, without regressing ordinary save suppression, CRLF preservation, external clean reload or dirty-conflict behavior.

**Blocked by:** 02: Audit document integrity and external file changes.

**Status:** review-required

## Minimal emergency specification

The save path must identify the exact bytes MarkText wrote. The watcher may suppress a matching own-save event only while the current disk bytes still match that saved content. If another process has replaced the bytes, the event must reach the renderer so a clean tab reloads and a dirty tab enters conflict handling. The repair must not change the existing CRLF/encoding write contract or weaken atomic saves.

- [x] A minimized Electron regression fails for the recorded P0 reason before product modification and passes 2/2 after repair.
- [x] Unit tests prove that identical saved bytes are ignored and externally changed bytes are not ignored.
- [x] W1 and ordinary W3 controls pass, including Unicode path, CRLF, relative image, auto-save, clean reload and dirty conflict.
- [x] Directly related prior-art E2E tests pass 19/19.
- [x] Desktop type checking and the production build pass.
- [x] Full unit tests pass: 769 passed, 1 skipped.
- [ ] Full Electron E2E is green. Two runs passed the P0 regression and 249 other tests with 4 skipped, but the separately recorded find-navigation P2 failed under full parallel load.
- [x] Touched-file lint has zero errors; eight pre-existing non-null-assertion warnings remain unchanged.
- [ ] Independent Standards + Spec review confirms the persistence, file-sync and IPC repair or identifies required remediation.
- [x] Implementation is committed locally as `26b09ea6` and is not pushed to GitHub.

## Review focus

- Confirm the SHA-256 contract is computed from the exact encoded bytes passed to the atomic writer.
- Confirm an external write cannot satisfy or consume the own-save suppression entry merely because it occurs inside the time window.
- Check event ordering, entry consumption, cloud-drive/stat fallback and failure behavior when the watched file cannot be read.
- Treat the deferred find-navigation candidate as out of scope unless evidence connects it to this repair.
