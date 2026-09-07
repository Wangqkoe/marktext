# 02: Capture final scroll across View transitions

**What to build:** Preserve the user's latest visible WYSIWYG position when a View changes pane, tab, or editing mode before the idle boundary has elapsed. Each transition must capture the outgoing surface at the command boundary; Split Right starts the new right-side View at that captured position while leaving the original View in place, and the two resulting Views then scroll independently.

**Blocked by:** 01: Idle-commit WYSIWYG scrolling without Outline churn

**Status:** implemented

- [x] Switching away from a tab immediately after scrolling captures the outgoing surface's latest Live Scroll Position before the next View is activated.
- [x] Returning to the tab during the same application session restores the captured final position rather than the last idle-committed intermediate position.
- [x] Switching between WYSIWYG and Source captures the outgoing surface before mode replacement and uses a deterministic, current View position for the transition.
- [x] Split Right captures the source View when the command executes and opens the right-side View at that latest visible position while the original tab remains on the left.
- [x] After Split Right completes, left and right Views own independent Live Scroll Position and Committed Scroll Position values; scrolling either side does not move or overwrite the other.
- [x] Move to Left and Move to Right capture the moved View before the pane transition and preserve its latest visible reading position in the destination pane.
- [x] Each transition invalidates or supersedes any earlier pending idle candidate so it cannot later restore an obsolete position.
- [x] Real pane-composition coverage exercises tab switching, mode switching, Split Right, Move to Left, and Move to Right through their user-facing commands.
- [x] Transition capture does not add custom scroll physics or alter the established tab, pane, or mode-switching semantics beyond position continuity.

## Evidence

- RED: the WYSIWYG-to-Source command test captured workspace `scrollTop: 900`, but the new Source surface still displayed `0`.
- RED: the Source-to-WYSIWYG command test left Source at `600`, but the replacement View and WYSIWYG surface restored the older `0`.
- RED: Split Right captured the original left View at `800`, but the newly mounted right View's normalization flush overwrote its inherited position with pre-restore DOM `0`.
- GREEN: `view-modes.spec.ts` covers both mode directions through `sourceCodeModeMenuItem`; Source keeps scroll-only observations local until the existing pane command flushes them.
- GREEN: `tab-switch-cursor.spec.ts` proves an immediate switch captures the final Live Scroll Position instead of the older idle-committed value, restores it on return, and does not admit a later obsolete callback.
- GREEN: `split-workspace.spec.ts` exercises the real `Split Right`, `Move to Right`, and `Move to Left` context-menu commands, including inherited initial position and independent left/right Live and Committed positions.
- Regression: five related unit files pass (88 tests), the renderer scroll-performance E2E passes (3 tests), typecheck and production build pass, and changed-file lint has no errors. The full desktop unit run has 77 files / 1,033 tests passing and the unchanged `source-code-image-action.spec.ts` setup failure (`computed is not defined`) recorded by ticket 01; the combined pane/tab/mode E2E run has 23 tests passing and one skipped, with only the unchanged dirty-undo describe timing out in `afterAll app.close()` after its assertions pass.
- Out of scope and not claimed here: Move to New Window, close/window-close, unmount/refresh concurrency hardening (ticket 03); TOC/search/typewriter animation completion (ticket 04); installed-build, physical touchpad/thumb, and cross-platform validation (ticket 05).
