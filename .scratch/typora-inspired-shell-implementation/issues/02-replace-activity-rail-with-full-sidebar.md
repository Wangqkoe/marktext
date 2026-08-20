# 02: Replace the activity rail with a full sidebar

**What to build:** Replace the activity rail plus content pane with one complete docked sidebar that exposes Files and Outline as text navigation, Search as a visible control, and Settings at the bottom. Users must be able to hide the entire pane, restore the same view and width, and switch views without an active-view click unexpectedly collapsing anything.

**Blocked by:** 01: Expand canonical shell layout state.

**Status:** ready-for-agent

- [ ] No persistent activity rail is rendered when the sidebar is visible.
- [ ] Hiding the sidebar makes its occupied width exactly 0px; no icon strip remains.
- [ ] Restoring the sidebar returns the previous Files, Search or Outline view and the previous valid width.
- [ ] Files and Outline appear as top-level text navigation and Search remains directly discoverable.
- [ ] Selecting a sidebar view while hidden opens the full sidebar directly to that view.
- [ ] Selecting the already active view is a no-op rather than a hide or collapse action.
- [ ] The Settings control remains pinned at the bottom and opens the existing Preferences window.
- [ ] Sidebar resizing enforces the 220px minimum and commits the stored width once when the interaction ends.
- [ ] Hiding and restoring the sidebar preserves relevant tree expansion, Outline expansion and Search state.
- [ ] Existing project navigation, Outline navigation, project search and sidebar context actions remain functional.
- [ ] End-to-end coverage replaces icon-strip assertions with complete hide/show, view-selection, width-preservation and local-state assertions.
- [ ] The Preferences window itself is visually and functionally unchanged.

