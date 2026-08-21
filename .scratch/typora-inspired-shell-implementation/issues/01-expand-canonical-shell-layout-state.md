# 01: Expand canonical shell layout state

**What to build:** Introduce a canonical, type-safe shell layout state alongside the legacy layout interface so later tickets can replace the activity rail without breaking current windows, commands or restored sessions. The expanded state must distinguish complete-sidebar visibility from the selected Files, Search or Outline view, normalize width consistently, and accept both new and legacy persisted snapshots while the old callers still operate.

**Blocked by:** None (can start immediately).

**Status:** resolved

Resolution evidence: implementation `0690f5da`, review fixes `9b87cfff` and `d057462c`, `layout-state.spec.ts`, and the final Ticket 07 verification recorded in [the acceptance results](../07-acceptance-results.md).

- [x] Canonical state represents sidebar visibility, selected sidebar view, sidebar width and tab-bar visibility as independent values.
- [x] The selected sidebar view only accepts Files, Search or Outline; an empty view is not valid canonical state.
- [x] Valid stored widths of at least 220px are preserved, finite smaller widths become 220px, and missing or invalid widths use 255px.
- [x] New-format snapshots restore all canonical values without changing them unexpectedly.
- [x] Legacy Files, Search and Outline values map directly, while empty, missing and unknown legacy views map to Files.
- [x] Legacy visibility and tab-bar fields remain readable during the expand phase.
- [x] Existing commands, menu checkmarks, project opening, folder search and window restoration continue to behave as before this ticket.
- [x] Pure unit tests cover normalization and every new/legacy snapshot mapping through the canonical layout interface.
- [x] The application type-checks and existing layout-related tests remain green.
