# Files sidebar divider

- Status: implementation complete; focused automated validation passed. Windows human acceptance user-confirmed passed on 2026-09-06; Linux/macOS **Untested**.
- Baseline: `e2ba0adbc2244404e7f6e8bb7566e35715a28a68`.
- Source commit: `f93434a67bc4291d4c2facaa34c21df21b315237`.
- Test follow-up: `0ec0fbef0ea8c4cb7c246c38a9c7be46235d23ed`.
- Evidence: [implementation and validation record](../testing/files-sidebar-divider.md).
- This is a local, reversible UI layout preference. No ADR is required.

## Goal and product model

Files contains two independently sized regions:

- The **Opened files region** lists the document views currently open in the editing window.
- The **Folder tree region** presents the Folder root hierarchy, or the existing Open Folder entry point when no Folder root is attached.
- The **Sidebar divider** is the draggable boundary between them and allocates their vertical space.

The divider replaces the current fixed `112px` maximum for Opened Files with a user-controlled normalized ratio. On first use, or when no saved ratio exists, the divider is at `50%`.

The ratio applies to the Files height remaining below the Files/Outline tab bar and any visible inline search. It is not a ratio of the full Sidebar or window height.

## Interaction and persistence contract

- Pointer dragging moves the divider live in the current window.
- `pointerup` commits and persists the normalized ratio. The saved value is available after application restart and to other windows when they are subsequently created or reloaded.
- A drag cancelled by `pointercancel` restores the position from the start of that drag and does not change the saved ratio.
- Double-clicking the divider resets it to `50%` and persists that value.
- An adjustment affects only the current live window. It is not broadcast to other windows that are already open.
- The divider has a thin visual rule and an approximately `5px` pointer hit target. Hover highlights it and uses the `row-resize` cursor.
- This scope supports pointer dragging and double-click reset only. It does not add arrow-key adjustment.

## Geometry and minimums

The two regions retain semantic minimum heights:

- The Opened files region can show its fixed title and at least one file row.
- The Folder tree region can show its fixed title and at least one tree row, or the complete Open Folder control when there is no Folder root.

When the available height cannot represent the saved ratio without violating a minimum, the rendered divider is temporarily clamped. Environmental clamping does not overwrite the saved ratio. When sufficient height returns, the divider returns to the saved ratio.

Opening inline search reduces the available height and recomputes both regions from the saved ratio within that remaining space. Closing search restores the allocation for the larger available height. Search result changes do not move the divider.

Changes in open-document count, Folder tree contents, expanded nodes, filtering results, or empty-state contents do not move the divider. The regions keep the allocated geometry and manage overflow internally.

Each region keeps its title fixed. Only its file-list or tree content scrolls, independently, with `overflow: auto` behavior when needed.

## Visibility and state scenarios

### No Folder root

The divider and Folder tree region remain present. The lower region continues to show the existing Open Folder entry point and observes its semantic minimum.

### Opened files chevron collapsed

Collapsing Opened Files hides only its rows. The Opened files region retains its allocated height, including the resulting empty space, and the divider remains draggable.

### Opened Files disabled in settings

When **Show opened files in sidebar** is disabled, the complete Opened files region and the divider are hidden, and the Folder tree region uses all available height. Re-enabling the setting restores the saved ratio.

### Outline selected

The divider belongs only to Files. It is absent in Outline, and returning to Files restores the saved Files allocation.

### Inline search visible

The search field continues to push Files content downward. The divider allocates the height remaining below the search field according to the saved ratio, subject only to temporary minimum clamping.

## Non-goals

- Changing the Files/Outline tab bar, inline-search behavior, Folder tree semantics, or Open Folder behavior.
- Changing which document views appear in Opened Files.
- Synchronizing divider motion live across existing windows or storing a permanent per-window ratio.
- Resizing either region automatically from its content, search results, or expanded/collapsed tree state.
- Removing the empty allocation when the Opened files chevron is collapsed.
- Adding keyboard arrow controls, new shortcuts, new settings UI, or a new persistence concept beyond the normalized ratio.
- Changing Outline layout or adding a divider to Outline.
- General Sidebar resizing or unrelated visual refactoring.

## Automated acceptance

Targeted tests must cover:

1. **Default:** with no saved value, Files renders both regions with the divider at `50%` of the available height.
2. **Drag:** pointer movement updates the current window live, respects both semantic minimums, and `pointerup` saves the resulting normalized ratio.
3. **Persistence:** a saved ratio is restored after restart and in a subsequently created or reloaded window, while an already-open second window does not move live.
4. **Cancel:** `pointercancel` restores the drag-start position and leaves persistence unchanged.
5. **Reset:** double-click restores and persists `50%`.
6. **Scroll:** each region's title remains fixed and each content area scrolls independently when its contents overflow.
7. **Fixed geometry:** changes to open files, tree contents, node expansion, or filter results do not change divider position.
8. **Search:** showing inline search recomputes allocation from the same ratio using the reduced height; hiding it restores allocation at the full Files height; result changes do not move the divider.
9. **Minimum clamp:** constrained height temporarily clamps the rendered divider without replacing the saved ratio, and sufficient restored height returns to that ratio.
10. **Collapse:** collapsing the Opened files chevron hides rows but preserves the region height and an operable divider.
11. **No root:** the divider remains visible and the lower region shows the complete existing Open Folder control.
12. **Setting:** disabling Opened Files hides its region and divider and gives the lower region full height; re-enabling restores the saved ratio.
13. **Outline:** Outline has no divider, and returning to Files restores the previous allocation.

Place focused divider coverage next to the existing Files visual and inline-search tests so the fixed inset, search expansion, and divider geometry are exercised together where practical. Required repository validation includes the relevant targeted tests, typecheck, lint, and build. Existing unrelated warnings are recorded rather than expanded into this scope.

## Manual acceptance

The Windows result includes the eight user-confirmed checks and the subsequent same-profile restart-persistence check recorded in the [implementation and validation record](../testing/files-sidebar-divider.md). Pointer cancellation and non-live updates in another already-open window retain automated evidence but were not separately confirmed in that physical acceptance.

- Drag the divider with a mouse or other pointer through normal and minimum-clamped positions; confirm live motion, hover highlight, `row-resize`, thin rule, and the usable hit target.
- Release, restart the application, and create or reload another window; confirm persistence without live movement in a window that was already open.
- Cancel a drag and double-click reset; confirm restoration and `50%` persistence respectively.
- Overflow both regions and confirm fixed titles and independent native scrolling.
- Toggle inline search, change its results, resize the window through minimum constraints, collapse the Opened files chevron, remove the Folder root, disable/re-enable Opened Files, and switch Files to Outline and back; confirm each state follows the contracts above.

## Change control

The user confirmed this shared understanding on **2026-09-06**. Implementation may choose the smallest existing Sidebar layout and persistence seams, but must not change the visible behavior in this specification for technical convenience. Any product-level change requires updating this specification and obtaining explicit confirmation. No ADR is required for this local, reversible layout choice.
