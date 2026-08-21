# 03: Contract the legacy sidebar layout interface

**What to build:** Complete the layout-state migration by moving every remaining shell caller to the canonical interface and deleting the legacy runtime concepts. Persisted legacy snapshots may still be read at the compatibility seam, but no live renderer path may create an empty sidebar view, a partial-collapse state or the old layout naming.

**Blocked by:** 02: Replace the activity rail with a full sidebar.

**Status:** resolved

Resolution evidence: implementation `7c8b80b9`, the compatibility-only legacy references in `layout.ts`, `layout-state.spec.ts`, `layout-persistence.spec.ts`, and the final Ticket 07 verification recorded in [the acceptance results](../07-acceptance-results.md).

- [x] Menu commands, project opening, folder search, editor bootstrap and buffered restoration use the canonical shell layout interface.
- [x] New buffered state writes canonical sidebar view, visibility, tab visibility and width fields.
- [x] The compatibility reader remains able to restore legacy snapshots deterministically.
- [x] Legacy layout names do not escape the compatibility reader into live shell state.
- [x] No renderer action can create an empty selected sidebar view or a 45px rail state.
- [x] Generic arbitrary layout mutation is removed from callers in favor of intention-revealing transitions.
- [x] Sidebar and tab menu checkmarks update exactly once per user-visible transition and agree with rendered state.
- [x] Disabling session-layout restoration still avoids forcing the sidebar open in a new window.
- [x] Unit and end-to-end persistence tests cover restart with every sidebar view, hidden sidebar, widened sidebar and a legacy empty-view snapshot.
- [x] A repository search confirms that obsolete runtime sidebar-collapse semantics have been removed.
- [x] Type checking and the complete layout-related test set pass after the old interface is contracted.
