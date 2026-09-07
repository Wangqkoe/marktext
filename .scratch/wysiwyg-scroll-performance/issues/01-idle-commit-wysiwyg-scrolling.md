# 01: Idle-commit WYSIWYG scrolling without Outline churn

**What to build:** Make continuous WYSIWYG scrolling follow Chromium's native motion immediately while keeping high-frequency Live Scroll Position changes local to the current View. After roughly 150 ms without another native scroll event, converge the workspace's Committed Scroll Position once, without publishing per-frame projections or rebuilding Outline content, so long heading-heavy documents remain responsive and the final reading position remains available during the current session.

**Blocked by:** None (can start immediately)

**Status:** implemented

- [x] Mouse-wheel, touchpad-equivalent, and scrollbar-equivalent input update the visible WYSIWYG surface immediately through native Chromium scrolling, with no added interpolation, inertia, or smooth-scroll behavior.
- [x] During a continuous burst of native scrolling, Live Scroll Position changes without publishing a workspace projection or changing Committed Scroll Position for each event or animation frame.
- [x] After approximately 150 ms with no newer native scroll event, only the latest finite Live Scroll Position becomes the View's Committed Scroll Position.
- [x] A newer native scroll event replaces the pending candidate and restarts the idle boundary, so an intermediate position is never committed after a later one has been observed.
- [x] Committing a position equal to the current Committed Scroll Position is a no-op and produces no workspace notification.
- [x] Scroll-only convergence does not rebuild or replace TOC-derived Outline data or nodes, whether the Outline tab is visible or hidden.
- [x] Actual heading text or heading-structure changes still refresh the Outline correctly; pure scrolling, cursor movement, and selection changes do not.
- [x] A deterministic real-renderer test proves visible scrolling occurs during the burst, workspace projection and Outline remain stable during it, and exactly the final position converges after idle.
- [x] A reproducible heading-heavy WYSIWYG fixture and measurement entry point are added for later installed-build performance validation.
- [x] Existing content, history, navigation, and current-session position behavior remain correct outside the scroll-only path.

## Evidence

- RED: the focused idle-burst unit test failed on the baseline because the first renderer frame reported `40` instead of keeping the burst local.
- RED: the projection-mirror/store test failed because a scroll-only projection replaced deeply equal `listToc` data.
- GREEN: `scroll-report-frequency.spec.ts` and `workspace-projection-mirror.spec.ts` pass (26 tests), including finite-value filtering, same-value no-op, latest-candidate idle commit, bounded retry, lease/fence safety, persistence isolation, TOC reference stability, and heading-change refresh.
- GREEN: `renderer-scroll-performance.spec.ts` passes against the fixed 400-heading fixture. Across a multi-frame burst, DOM `scrollTop` reaches the final value while workspace revision and Committed Scroll Position remain unchanged; after 200 ms exactly one revision converges, and the visible Outline node identity remains stable.
- GREEN: WYSIWYG TOC and Source TOC navigation regressions pass. The unchanged `scroll-up-arrow.spec.ts` baseline still fails before this ticket's reporting assertions (`ArrowDown` leaves `scrollTop` at `0`); the specification records it as out of scope.
- Full desktop unit run: 77 files and 1,033 tests pass (1 skipped); the only failing file is unchanged `source-code-image-action.spec.ts`, whose 10 cases all stop in their extracted setup with `ReferenceError: computed is not defined`. It is unrelated to the scroll/TOC diff and is recorded rather than repaired in ticket 01.
- Measurement entry and installed-build limits are documented in `docs/testing/desktop-scroll-profile.md`; physical touchpad/thumb and installed-build `<= 5%` validation remain later acceptance work, not claims made by this ticket.
