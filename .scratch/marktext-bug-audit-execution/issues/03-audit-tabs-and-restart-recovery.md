# 03: Audit tabs, unsaved documents and restart recovery

**What to build:** Demonstrate that a user can work across multiple tabs, close with unsaved content, restart and recover the intended document state, or produce ticket-ready evidence for every confirmed failure.

**Blocked by:** 02: Audit document integrity and external file changes.

**Status:** ready-for-agent

**Current frontier:** This is the sole current frontier. The former P0 emergency pause has been withdrawn; begin this ticket from its documented clean state without reopening the accepted P0/02A watcher work.

- [ ] W2 starts with F1 under E1 and uses the designated shared user-data directory only for this persistence flow.
- [ ] Two tabs retain independent content, dirty/saved state, caret, scroll and undo/redo behavior across switching.
- [ ] Closing and relaunching with unsaved content produces the documented recovery or protection behavior without silent loss.
- [ ] Restored source-mode, tab-bar and startup preferences agree with rendered state and applicable menu state.
- [ ] Save As uses a controlled destination, the resulting file content matches the active document, and reopening the saved file produces the same content.
- [ ] Existing tab, cursor/history, layout-persistence and source-mode persistence coverage is run as supporting prior art.
- [ ] Every anomaly is recorded and classified under the approved confirmation thresholds and evidence rules.
- [ ] A strongly evidenced P0 or fifth confirmed product defect triggers the documented early handoff instead of further exploration.
- [ ] No original user document is modified, and all changes remain in unpushed local commits.
