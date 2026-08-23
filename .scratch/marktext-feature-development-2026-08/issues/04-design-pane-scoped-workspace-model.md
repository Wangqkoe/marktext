# 设计 pane-scoped workspace domain model

Type: `grilling`
Status: `resolved`
Claimed by: coordination task
Blocked by: 01

## Question

Define the pane-scoped workspace model for Document, Tab, View, Pane, and FocusedPane; the boundary for decomposing the singleton editor and event bus; session persistence and migration; TOC, status, source mode, and command behavior; and enforcement of the same-document prohibition.

## Comments

- This is a high-risk shared seam because it changes editor ownership and persisted workspace state.
- The terms resolved here are canonical for this Wayfinder map.

## Answer

The canonical model is:

- **Document** is the window-local canonical editable buffer. It owns a saved path or stable untitled identity, Markdown, dirty/save state, and Undo/Redo history.
- **View** is a pane-scoped presentation of one Document. It owns cursor, selection, scroll position, and editor mode (WYSIWYG or source).
- **Tab** is the ordered handle to a View in a Pane's tab bar.
- **Pane** owns ordered Tabs, its active Tab, and one pane-scoped active editor adapter.
- **WindowWorkspace** owns one or two Panes, `FocusedPane`, and the split ratio.

Within one WindowWorkspace, each saved path has exactly one Document. Opening an already-open path focuses its existing Pane and Tab. Moving a Tab between Panes moves its View; it never duplicates the Document. Untitled Documents retain a stable, unique internal identity, so multiple untitled pages remain distinct. `Open in new window` remains a separate, window-local Document under the previously resolved cross-window contract.

`FocusedPane` routes the window title, TOC/outline, status information, caret position, word count, source-mode state, main menu, shortcuts, Undo/Redo, find, formatting, and all current-document commands. Autosave, file watching, session recovery, and external-change handling operate on every Document regardless of focus.

Each Pane isolates its editor adapter. Editor events are scoped by `paneId`/`viewId` or kept inside the workspace module; unscoped shared-editor events are not permitted. Switching a Tab flushes and refreshes only the affected Pane, leaving the other Pane's content, View state, and editor history unchanged.

Persistence restores pane count, Tab membership and order, active Tabs, `FocusedPane`, split ratio, and every View's cursor, selection, scroll position, and editor mode. Legacy sessions migrate to one Pane. If restoration partially fails, valid content survives and the workspace safely collapses to one Pane rather than failing the entire window.

Splitting a single-Pane workspace moves the current Tab to the requested target side and leaves all other Tabs in the opposite Pane. With two Panes, a Tab may only transfer between those Panes or reorder within one; no third Pane is created. An empty Pane automatically collapses. Closing all content creates a clean untitled page. Exact layout and motion behavior remain owned by the Split UI prototype.
