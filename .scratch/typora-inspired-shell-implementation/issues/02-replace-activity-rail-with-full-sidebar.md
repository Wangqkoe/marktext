# 02: Replace the activity rail with a full sidebar

**What to build:** Replace the activity rail plus content pane with one complete docked sidebar that exposes Files and Outline as text navigation, Search as a visible control, and Settings at the bottom. Users must be able to hide the entire pane, restore the same view and width, and switch views without an active-view click unexpectedly collapsing anything.

**Blocked by:** 01: Expand canonical shell layout state.

**Status:** resolved

Resolution evidence: implementation `ca04daf9`, review fix `6302e62f`, `layout-toggles.spec.ts`, `issue-2421-sidebar-state.spec.ts`, and the final Ticket 07 verification recorded in [the acceptance results](../07-acceptance-results.md).

- [x] No persistent activity rail is rendered when the sidebar is visible.
- [x] Hiding the sidebar makes its occupied width exactly 0px; no icon strip remains.
- [x] Restoring the sidebar returns the previous Files, Search or Outline view and the previous valid width.
- [x] Files and Outline appear as top-level text navigation and Search remains directly discoverable.
- [x] Selecting a sidebar view while hidden opens the full sidebar directly to that view.
- [x] Selecting the already active view is a no-op rather than a hide or collapse action.
- [x] The Settings control remains pinned at the bottom and opens the existing Preferences window.
- [x] Sidebar resizing enforces the 220px minimum and commits the stored width once when the interaction ends.
- [x] Hiding and restoring the sidebar preserves relevant tree expansion, Outline expansion and Search state.
- [x] Existing project navigation, Outline navigation, project search and sidebar context actions remain functional.
- [x] End-to-end coverage replaces icon-strip assertions with complete hide/show, view-selection, width-preservation and local-state assertions.
- [x] The Preferences window itself is visually and functionally unchanged.
