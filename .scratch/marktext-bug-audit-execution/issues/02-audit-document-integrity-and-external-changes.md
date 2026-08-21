# 02: Audit document integrity and external file changes

**What to build:** Produce trustworthy evidence that ordinary saved documents, source/WYSIWYG transitions and external file changes preserve user content on the Windows baseline, or produce fully classified candidate records for each observed failure.

**Blocked by:** 01: Establish audit fixtures, evidence records and regression baselines.

**Status:** ready-for-agent

- [ ] W1 runs with F2 under E1 from fresh isolated state: open, render, WYSIWYG edit, source edit, return, undo/redo, save, compare disk content and reload.
- [ ] Assertions cover serialized content, disk bytes where the line-ending contract requires them, dirty/saved state and absence of unexpected renderer/process errors.
- [ ] W3 runs with F3 under E1 and covers its Unicode path, CRLF behavior, relative image reference, auto-save and configured delay.
- [ ] External modification is exercised separately while the current tab is clean and while it contains unsaved changes, with both application state and disk outcome recorded.
- [ ] Existing related round-trip, source-mode, save, watcher and external-reload coverage is run as supporting prior art.
- [ ] Every anomaly receives a candidate record and an immediate disposition or a bounded isolation plan; deterministic candidates use 2/2 and intermittent candidates use no more than ten attempts.
- [ ] Screenshots, if any, remain supplementary to disk, process, DOM or application-state evidence.
- [ ] Original and tracked fixtures are restored exactly after the run.
- [ ] If a P0 is strongly evidenced or the fifth product defect is confirmed, remaining exploration stops and the early handoff condition is recorded.
- [ ] Audit artifacts and any harness changes are committed locally and are not pushed to GitHub.
