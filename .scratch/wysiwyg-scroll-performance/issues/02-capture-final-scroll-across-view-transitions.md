# 02: Capture final scroll across View transitions

**What to build:** Preserve the user's latest visible WYSIWYG position when a View changes pane, tab, or editing mode before the idle boundary has elapsed. Each transition must capture the outgoing surface at the command boundary; Split Right starts the new right-side View at that captured position while leaving the original View in place, and the two resulting Views then scroll independently.

**Blocked by:** 01: Idle-commit WYSIWYG scrolling without Outline churn

**Status:** ready-for-agent

- [ ] Switching away from a tab immediately after scrolling captures the outgoing surface's latest Live Scroll Position before the next View is activated.
- [ ] Returning to the tab during the same application session restores the captured final position rather than the last idle-committed intermediate position.
- [ ] Switching between WYSIWYG and Source captures the outgoing surface before mode replacement and uses a deterministic, current View position for the transition.
- [ ] Split Right captures the source View when the command executes and opens the right-side View at that latest visible position while the original tab remains on the left.
- [ ] After Split Right completes, left and right Views own independent Live Scroll Position and Committed Scroll Position values; scrolling either side does not move or overwrite the other.
- [ ] Move to Left and Move to Right capture the moved View before the pane transition and preserve its latest visible reading position in the destination pane.
- [ ] Each transition invalidates or supersedes any earlier pending idle candidate so it cannot later restore an obsolete position.
- [ ] Real pane-composition coverage exercises tab switching, mode switching, Split Right, Move to Left, and Move to Right through their user-facing commands.
- [ ] Transition capture does not add custom scroll physics or alter the established tab, pane, or mode-switching semantics beyond position continuity.
