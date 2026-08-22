# 03: Audit tabs, unsaved documents and restart recovery

**What to build:** Demonstrate that a user can work across multiple tabs, close with unsaved content, restart and recover the intended document state, or produce ticket-ready evidence for every confirmed failure.

**Blocked by:** 02: Audit document integrity and external file changes.

**Status:** resolved

**Current frontier:** Resolved on the documented clean state without reopening the accepted P0/02A watcher work. Ticket 04 is unblocked by the evidence below; this ticket did not start it.

- [x] W2 starts with F1 under E1 and uses the designated shared user-data directory only for this persistence flow.
- [x] Two tabs retain independent content, dirty/saved state, caret, scroll and undo/redo behavior across switching.
- [x] Closing and relaunching with unsaved content produces the documented recovery or protection behavior without silent loss.
- [x] Restored source-mode, tab-bar and startup preferences agree with rendered state and applicable menu state.
- [x] Save As uses a controlled destination, the resulting file content matches the active document, and reopening the saved file produces the same content.
- [x] Existing tab, cursor/history, layout-persistence and source-mode persistence coverage is run as supporting prior art.
- [x] Every anomaly is recorded and classified under the approved confirmation thresholds and evidence rules.
- [x] No strongly evidenced P0 or fifth confirmed product defect occurred; early handoff was not triggered.
- [x] No original user document is modified, and all changes remain in unpushed local commits.

## Resolution

- W2 evidence and the dedicated 3/3 Electron audit are in [`03-w2-results.md`](../evidence/03-w2-results.md).
- No new product defect was confirmed. The only supporting-prior-art failure is the pre-existing LF-only negative fixture mutation, recorded as a duplicate/baseline harness issue in [`03-duplicate-lf-only-disposition-test.md`](../evidence/03-duplicate-lf-only-disposition-test.md); it does not reopen Ticket 01 or count against the finding cap.
- Ticket 04 is unblocked, but is not part of this ticket.
