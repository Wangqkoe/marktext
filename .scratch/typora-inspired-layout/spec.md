# Typora-inspired MarkText application shell

Label: `ready-for-agent`
Status: `ready-for-agent`

## Problem Statement

MarkText's current editor-window shell does not provide the compact, calm workspace hierarchy the user expects from Typora. The persistent activity rail consumes width beside the actual sidebar, hiding a sidebar can leave a narrow rail behind, word count is placed in the title area instead of a stable status region, and title, tabs, sidebar and editor content do not read as one deliberately aligned layout. These problems become especially visible when comparing the same Markdown document with and without an outline sidebar.

The user wants MarkText's application shell and workspace layout to feel closer to Typora while remaining an independent MarkText design. MarkText must keep its tabs, source mode, project search, settings entry point, themes, keyboard/menu commands and cross-platform behavior. The work must not copy Typora's proprietary code, bundled assets or document theme, and it must not redesign the separate Preferences window.

## Solution

Replace the editor window's existing shell with one compact, grid-aligned application shell:

- a 30px title bar spanning the full window when the in-app title bar is present;
- a full docked sidebar with Files, Outline and Search entry points and no persistent activity rail;
- a separate 26px editor tab row retained as a MarkText capability;
- a fluid editor workspace whose configured line width remains authoritative; and
- a persistent 24px bottom status bar containing sidebar and source-mode controls, document context, mode, caret position and word count.

The new shell is the only shell; there is no legacy-layout toggle. Existing valid preferences are preserved, ambiguous legacy sidebar state is migrated deterministically, and all existing menu and keyboard entry points continue to drive the same underlying state. Windows with a custom light title bar is the exact visual baseline. Dark themes and native-title-bar configurations use semantic styling and functional acceptance rather than Typora pixel matching.

## User Stories

1. As a MarkText user, I want the editor window to present a compact and coherent visual hierarchy, so that I can focus on my document rather than application chrome.
2. As a user familiar with Typora, I want MarkText's shell proportions and workspace organization to feel familiar, so that moving between the applications requires less visual adjustment.
3. As a MarkText user, I want the redesign to remain recognizably MarkText, so that I keep the capabilities and workflows I already rely on.
4. As a Windows user with a custom title bar, I want a 30px title bar across the complete window, so that the shell has the approved compact top edge.
5. As a Windows user, I want the custom title bar's menu, drag region and window controls to keep working, so that visual changes do not weaken native window operation.
6. As a user with a native title bar, I want no duplicate title or empty title-sized gap, so that the editor content begins immediately below the operating-system chrome.
7. As a macOS user, I want MarkText's existing in-app-title behavior preserved, so that traffic-light, drag and rename interactions do not regress.
8. As a Linux user, I want custom and native title configurations to remain functional where supported, so that the redesign is not Windows-only in practice.
9. As a user who works with folders, I want one full docked sidebar instead of an activity rail plus content pane, so that more horizontal space is available for useful content.
10. As a user who hides the sidebar, I want the complete sidebar to occupy 0px, so that no narrow icon strip remains.
11. As a user who restores the sidebar, I want my previous view and width to return, so that hiding it is a temporary workspace action rather than a reset.
12. As a user with a preferred sidebar width, I want that valid width preserved across the redesign and restart, so that the migration does not discard my setup.
13. As a new user without stored sidebar state, I want the sidebar to start at the approved 255px default, so that the initial layout matches the intended proportions.
14. As a user resizing the sidebar, I want it to remain at least 220px wide, so that its controls and localized labels remain usable.
15. As a user with legacy state that collapsed the sidebar to an icon rail, I want that state migrated to a normal Files view, so that an obsolete rail cannot return.
16. As a user browsing a project, I want Files available as a top-level sidebar view, so that opening and navigating folders remains direct.
17. As a user navigating a long document, I want Outline available as a top-level sidebar view, so that headings are easy to scan and select.
18. As a user searching a project, I want a visible Search entry point in the full sidebar navigation, so that removing the activity rail does not hide search capability.
19. As a user opening Preferences, I want a settings control pinned at the bottom of the sidebar, so that the existing settings entry point remains discoverable.
20. As a user selecting the already active sidebar view, I want nothing to collapse or hide, so that navigation labels have predictable behavior.
21. As a user selecting Files, Outline or Search while the sidebar is hidden, I want the sidebar to open directly to that view, so that menu and command actions remain useful.
22. As a user working with multiple files, I want MarkText's editor tabs retained in their own compact row, so that I can continue switching and managing documents.
23. As a user who does not want tabs visible, I want the existing tab-bar preference to remain independent, so that hiding tabs does not affect sidebar navigation or status controls.
24. As a user dragging, reordering, closing or adding tabs, I want current tab behavior preserved, so that the shell redesign does not alter document management.
25. As a user, I want a persistent bottom status bar, so that document information has a stable location instead of competing with the title.
26. As a user, I want the first status control to hide or restore the complete sidebar, so that the primary workspace toggle is always available.
27. As a user, I want the neighboring source-mode control to have the same 34px width and aligned 16px icon, so that the bottom controls look intentional and balanced.
28. As a keyboard or assistive-technology user, I want the source-mode control to expose its name, pressed state, disabled state and focus ring, so that its behavior is perceivable without relying on color.
29. As a user toggling source mode from the status bar, menu or shortcut, I want every entry point to drive the same state, so that the editor cannot show contradictory modes.
30. As a user without an active document, I want the source-mode control disabled, so that I cannot invoke an action that has no target.
31. As a user without an active document, I want the status bar to remain visible and say `No document`, so that the window does not jump to a different shell.
32. As a user with a document open, I want the status bar to say `Markdown` or `Source`, so that the active editing mode is immediately clear.
33. As a user in WYSIWYG mode, I want an accurate one-based line and column display, so that I can communicate and revisit positions in the Markdown document.
34. As a user in source mode, I want the same one-based line and column convention, so that mode switching does not change how positions are reported.
35. As a user switching tabs or modes, I want stale caret information cleared before the new editor reports its position, so that the status bar never describes the previous document.
36. As a user, I want word count moved from the title bar to the status bar, so that the title stays uncluttered and count information is consistently placed.
37. As a user, I want word count to follow the active tab immediately, so that the displayed value always describes the document I am editing.
38. As a user, I want to cycle among words, paragraphs, characters and all characters, so that the existing counter capability is preserved.
39. As a user, I want the counter tooltip to retain the full set of counts, so that moving the compact display does not remove detail.
40. As a user with a configured editor line width, I want that preference to remain authoritative, so that the redesign does not impose a document width on me.
41. As a user at the recommended defaults, I want a 736px reference editor width, 38px ordinary top inset and at least 14px inline paper padding, so that the document sits comfortably in the new shell.
42. As a user narrowing the window, I want the editor to become fluid rather than overflow unnecessarily, so that editing remains possible in constrained space.
43. As a user in a narrow window, I want the sidebar to stay docked until I explicitly hide it, so that the application does not unexpectedly switch to an overlay or rail layout.
44. As a light-theme user on Windows, I want the final shell geometry to match the approved prototype within normal rendering tolerance, so that the implemented result reflects the visual decision I approved.
45. As a dark-theme user, I want readable text, icons, dividers, hover states, pressed states, disabled states and focus rings, so that the redesign remains usable without requiring Typora pixel matching.
46. As a user of any existing MarkText theme, I want the shell to derive its colors from semantic theme variables, so that themes continue to behave consistently.
47. As a user changing application zoom or Windows display scale, I want controls to remain aligned and operable, so that the compact geometry does not become fragile.
48. As a user restoring a previous session, I want sidebar, tabs and source mode to agree with their menu checkmarks, so that rendered and persisted state never contradict each other.
49. As a user moving between source and WYSIWYG modes, I want content, cursor, scroll, saved state and undo history preserved, so that the new status controls do not disturb editing semantics.
50. As a user of project search and Outline navigation, I want their local state preserved while the sidebar is temporarily hidden, so that reopening the sidebar resumes my work.
51. As a user opening Preferences, I want the existing Preferences window and controls unchanged, so that this shell project does not expand into an unrelated redesign.
52. As a Markdown author, I want the document theme and typography left unchanged, so that application-shell imitation does not alter document rendering.
53. As a maintainer, I want legacy state accepted only at the persistence seam, so that obsolete shell concepts do not remain throughout the new implementation.
54. As a maintainer, I want the replacement shell delivered without a user-facing feature flag, so that there is one layout to maintain and test.
55. As a maintainer, I want changes committed only to the local repository, so that this work follows the project's no-push instruction.

## Implementation Decisions

- The application shell comprises the title bar, full sidebar, editor tab row, workspace and status bar. The document-rendering theme and the separate Preferences window are separate concerns.
- The shell uses one grid-based layout rather than independent viewport-height and viewport-width calculations in child modules. The visual layout module hides row and column calculations from the editor, sidebar and status implementations.
- With an in-app title bar, the shell uses a 30px title row, a 26px navigation/tab alignment row, a fluid content row and a 24px status row. The sidebar and workspace are separate columns; the title and status rows span both.
- When the editor tab bar is hidden, the workspace content consumes the space where its tab row would have appeared. The sidebar keeps its own 26px navigation row.
- The sidebar is full-width or hidden. Its default is 255px, its minimum is 220px and its hidden effective width is 0px. There is no activity-rail state, overlay breakpoint or partial-collapse state.
- Sidebar visibility and selected sidebar view are independent state. The selected view is exactly one of Files, Search or Outline. The stable internal identifier for Outline remains `toc`; the old `rightColumn` term is removed from the new runtime interface.
- The layout-state module is the only renderer module that owns sidebar visibility, selected view, sidebar width and tab-bar visibility. Its public interface describes user intentions such as showing, hiding, toggling, selecting and resizing rather than accepting arbitrary state patches.
- Layout-state normalization, persistence conversion, buffered restore, menu synchronization and IPC adaptation remain behind the layout-state interface. Menu actions, project opening and find-in-folder behavior invoke the same interface.
- Selecting a sidebar view shows the sidebar and activates that view. Selecting the active view is a no-op. Only the dedicated sidebar toggle, its menu command or its shortcut hides the sidebar.
- The sidebar top navigation contains Files and Outline text tabs plus a 34px Search control. It must accommodate localized labels without colliding with Search.
- The settings entry remains pinned to the bottom of the full sidebar and opens the existing Preferences window.
- Sidebar resize preview may update continuously during pointer movement, but the normalized stored width is committed once at the end of the interaction. Pointer/document listeners must not leak after unmount.
- Sidebar child views remain mounted or otherwise retain their relevant local state while the complete sidebar is hidden.
- The title bar retains filename, save indication, application menu, drag behavior and window controls. Word count is removed from it.
- The tab module retains existing add, close, drag, reorder and active-tab behavior; only shell sizing and styling change.
- The status bar's left group contains, in order, the complete-sidebar toggle, source-mode toggle and context label. Its right group contains document mode, caret position and word count.
- The sidebar and source controls each have an exact 34px interactive footprint. Their SVG elements are exactly 16×16px and use the same centering rule. The sidebar chevron indicates the result of invoking the action.
- The source control's accessible name and tooltip are `Toggle Source Code Mode`. It exposes pressed state, uses a visible keyboard focus treatment and is disabled when there is no active document.
- The status source control is an adapter to the existing source-mode command and preference state. It does not introduce another editor-mode boolean or transition path.
- With no active document, the status bar stays mounted, the sidebar control remains enabled, source mode is disabled, the context is `No document`, and document mode, caret and count metrics are hidden.
- With an active document, the context is the localized selected sidebar view when the sidebar is visible and `Editor` when it is hidden. Document mode is `Markdown` or `Source`.
- Caret position is transient, active-editor state displayed one-based as `Ln n, Col n`. It is never persisted as a user preference.
- The source-editor caret adapter reads the active CodeMirror focus/head position. The WYSIWYG adapter reads the active Muya Markdown-offset position. WYSIWYG calculation is coalesced to at most once per animation frame to prevent repeated whole-document serialization within one frame.
- Caret updates are associated with the active tab and editing mode. Switching either clears the display first and rejects late updates from the previous editor.
- Word count continues to come from the active file's corrected count state. The status control preserves the existing words, paragraphs, characters and all-characters cycle and detail tooltip.
- The user's editor line-width preference remains authoritative. The approved reference width is 736px; the normal top inset is 38px; minimum inline padding is 14px; and the content becomes fluid when the available workspace is narrower.
- The main editor shell gets shell-scoped geometry variables. The existing global title-bar variable is not redefined because the excluded Preferences window also consumes it.
- Shell colors are semantic aliases over existing editor background, sidebar background, normal text, strong text, muted text, icon, hover, divider, accent and focus variables. Existing themes inherit these aliases rather than receiving copied light-theme color literals.
- If a theme fails contrast acceptance, its existing semantic value or one justified shared shell semantic is corrected. Runtime theme-name checks and per-module theme branches are not allowed.
- Valid existing sidebar widths of at least 220px are preserved exactly. Finite values below 220px become 220px. Missing, invalid or non-finite width becomes 255px. A valid historical 280px value is not rewritten to the new default.
- Existing sidebar visibility, tab visibility and source-mode preference keys remain in place. The current sidebar-width storage key remains in place.
- New buffered layout state stores selected sidebar view, sidebar visibility, tab visibility and width. Its compatibility reader accepts the legacy layout names for migration.
- Legacy Files, Search and Outline identifiers map directly. Empty, missing or unknown legacy sidebar-view values map to Files and never recreate an activity rail.
- Existing behavior that disables layout restoration for a new window remains authoritative; migration must not force a sidebar open when restoration is intentionally disabled.
- The compatibility reader exists only at the persistence seam. The new runtime does not dual-maintain an old shell interface.
- The replacement is global and has no old-shell feature flag or rollback layout. Implementation may be delivered through reviewable local commits, but the completed shell is accepted as one replacement experience.
- Windows custom-title-bar light mode at 100% application zoom is the exact visual baseline. Native title bars, dark themes, macOS and Linux are functional/semantic acceptance targets.
- Exact visual values have a ±1px tolerance at the baseline. The two status-button SVG centers must match within 0.5px.

## Testing Decisions

- Tests assert externally observable behavior through the highest practical seam. They do not couple to internal Vue refs, arbitrary store mutations, private CSS implementation or the deleted activity-rail structure.
- Electron Playwright end-to-end tests are the primary automated seam because they exercise rendered geometry, menu/command adapters, persistence, editor-mode transitions and active-document behavior together.
- Pure unit tests are used only where they provide a stable high-leverage seam: layout normalization and legacy migration, one-based caret formatting, stale-update rejection, update coalescing and in-app-title visibility.
- The existing layout-toggle coverage is updated to assert complete sidebar hide/show, 0px hidden width, full restored width, independent tab visibility and Files/Search/Outline selection. The old icon-strip-collapse scenario is deleted.
- The existing sidebar-state regression coverage is retained at the behavior level: a widened sidebar and collapsed tree section survive complete hide/show, and no intermediate persistent rail width appears.
- A shell-geometry end-to-end test verifies the 30px title, 26px tabs/navigation, 24px status, 255px default sidebar, 0px hidden sidebar, approved editor spacing, absence of a blank sidebar header, equal 34px controls and aligned 16px icons.
- Existing editor-input counter tests are retargeted from the title bar to the status bar while preserving live-edit, active-tab and words/paragraphs/characters/all cycle assertions.
- Existing view-mode tests verify that the status button, menu and shortcut drive one source-mode state, and that pressed state and menu checkmark agree.
- Existing source-mode undo, saved-state, reload, content, cursor and scroll regression tests remain acceptance gates.
- New status behavior coverage includes the no-document state, context labels, document mode, disabled source control, accurate WYSIWYG/source caret positions, active-tab word count and absence of stale metrics after tab or mode switches.
- Accessibility assertions cover control names, pressed and disabled state, keyboard focus visibility and pointer targets.
- Visual assertions run at a declared Windows baseline viewport, 100% application zoom and known display scale. Exact values are not inferred from arbitrary screenshots taken at unknown scale.
- Manual smoke testing covers Windows custom/light exact visual matching, Windows custom/dark semantic contrast, Windows native title behavior, macOS light/dark, Linux custom/native where supported, a 640×480 narrow window and non-default zoom/display scaling.
- Manual persistence smoke covers sidebar hidden, every sidebar view active, widened sidebar, tabs hidden, source mode enabled and a legacy empty sidebar-view snapshot. Rendered state and menu checkmarks must agree after restart.
- A good test survives internal refactoring as long as the user-visible shell contract remains unchanged. A test that only proves a child module's implementation detail should be replaced by a shell-level assertion.
- Prior art includes the existing layout toggles, sidebar-state regression, title-bar visibility, editor input/counter, view-mode and source undo/reload test suites.
- Final verification includes type checking, unit tests, targeted shell end-to-end tests, the full end-to-end suite, linting and an unpacked production build.

## Out of Scope

- Copying Typora's proprietary code, assets, icons or bundled resources.
- Reproducing Typora's document theme, editor typography or Markdown-rendering styles.
- Redesigning or resizing the separate Preferences window.
- Keeping the old shell as a user-selectable or hidden fallback layout.
- Introducing responsive sidebar overlays, activity rails or automatic narrow-window mode changes.
- Changing document parsing, Markdown semantics or export appearance.
- Reworking source/WYSIWYG undo, cursor or save semantics beyond the adapters required to display status information.
- Fixing unrelated product bugs, including maintenance issues that are not regressions caused by the replacement shell.
- Exact Typora pixel matching for dark themes, native title bars, macOS or Linux.
- Publishing or pushing commits to GitHub.

## Further Notes

- The approved visual evidence is Reference-aligned prototype A, finalized by local prototype commit `0a2d74c5`. It establishes the absence of the blank sidebar header and the exact alignment of the two status controls.
- The reference applications were Typora 1.13.7 and MarkText 0.20.0-rc.1 on Windows. Typora is evidence for hierarchy and proportions only; the implementation remains original.
- The supplied Windows comparison screenshots did not include a confirmed display scale. They remain qualitative/reference evidence; automated exact geometry uses a controlled test environment.
- The separate word-count initialization bug and Preferences switch-contrast bug are maintenance work outside this specification. The shell may rely on corrected active-tab word-count behavior but must not absorb unrelated Preferences work.
- The user explicitly confirmed the testing seams used by this specification: Electron end-to-end behavior as the primary seam, pure-logic unit tests as a narrow auxiliary seam, and manual cross-platform/theme smoke testing.
- All implementation commits remain local in accordance with repository instructions.
