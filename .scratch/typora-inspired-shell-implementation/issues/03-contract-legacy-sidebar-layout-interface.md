# 03: Contract the legacy sidebar layout interface

**What to build:** Complete the layout-state migration by moving every remaining shell caller to the canonical interface and deleting the legacy runtime concepts. Persisted legacy snapshots may still be read at the compatibility seam, but no live renderer path may create an empty sidebar view, a partial-collapse state or the old layout naming.

**Blocked by:** 02: Replace the activity rail with a full sidebar.

**Status:** ready-for-agent

- [ ] Menu commands, project opening, folder search, editor bootstrap and buffered restoration use the canonical shell layout interface.
- [ ] New buffered state writes canonical sidebar view, visibility, tab visibility and width fields.
- [ ] The compatibility reader remains able to restore legacy snapshots deterministically.
- [ ] Legacy layout names do not escape the compatibility reader into live shell state.
- [ ] No renderer action can create an empty selected sidebar view or a 45px rail state.
- [ ] Generic arbitrary layout mutation is removed from callers in favor of intention-revealing transitions.
- [ ] Sidebar and tab menu checkmarks update exactly once per user-visible transition and agree with rendered state.
- [ ] Disabling session-layout restoration still avoids forcing the sidebar open in a new window.
- [ ] Unit and end-to-end persistence tests cover restart with every sidebar view, hidden sidebar, widened sidebar and a legacy empty-view snapshot.
- [ ] A repository search confirms that obsolete runtime sidebar-collapse semantics have been removed.
- [ ] Type checking and the complete layout-related test set pass after the old interface is contracted.

