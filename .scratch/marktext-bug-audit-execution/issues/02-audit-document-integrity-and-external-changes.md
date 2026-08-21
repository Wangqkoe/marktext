# 02: Audit document integrity and external file changes

**What to build:** Produce trustworthy evidence that ordinary saved documents, source/WYSIWYG transitions and external file changes preserve user content on the Windows baseline, or produce fully classified candidate records for each observed failure.

**Blocked by:** 01: Establish audit fixtures, evidence records and regression baselines.

**Status:** resolved

- [x] W1 runs with F2 under E1 from fresh isolated state: open, render, WYSIWYG edit, source edit, return, undo/redo, save, compare disk content and reload.
- [x] Assertions cover serialized content, disk bytes where the line-ending contract requires them, dirty/saved state and absence of unexpected renderer/process errors.
- [x] W3 runs with F3 under E1 and covers its Unicode path, CRLF behavior, relative image reference, auto-save and configured delay.
- [x] External modification is exercised separately while the current tab is clean and while it contains unsaved changes, with both application state and disk outcome recorded.
- [x] Existing related round-trip, source-mode, save, watcher and external-reload coverage is run as supporting prior art.
- [x] Every anomaly receives a candidate record and an immediate disposition or a bounded isolation plan; deterministic candidates use 2/2 and intermittent candidates use no more than ten attempts.
- [x] Screenshots, if any, remain supplementary to disk, process, DOM or application-state evidence.
- [x] Original and tracked fixtures are restored exactly after the run.
- [x] If a P0 is strongly evidenced or the fifth product defect is confirmed, remaining exploration stops and the early handoff condition is recorded.
- [x] Audit artifacts and any harness changes are committed locally and are not pushed to GitHub.

## Resolution

- W1 and the ordinary W3 controls pass in `audit-document-integrity.spec.ts`; supporting prior art passes 19/19.
- W3 exposed a deterministic P0: an external write immediately after auto-save was swallowed as MarkText's own watcher event, then overwritten by the next auto-save. The minimized regression failed 2/2 before repair.
- Emergency repair `26b09ea6` makes own-save suppression content-aware and adds both unit boundary coverage and an Electron disk-outcome regression. The minimized regression passes 2/2 after repair.
- Discovery stopped immediately after P0 confirmation. Tickets 03–05 are not explored under the early-stop rule; the frontier moves to the emergency review ticket and then consolidation.
- Full unit tests pass 769 with 1 skipped. Two full E2E runs each passed the P0 regression and 249 other tests, skipped 4, and exposed the same unrelated intermittent find-navigation candidate; that P2 is recorded and deferred rather than repaired in this ticket.
