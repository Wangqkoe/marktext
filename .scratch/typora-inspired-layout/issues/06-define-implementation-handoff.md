# Define the implementation handoff

Type: `grilling`
Status: `resolved`
Blocked by: 05

## Question

What component boundaries, shared state transitions, preference migration rules, implementation order, and automated/manual acceptance matrix will let an implementation session build the approved shell without reopening product decisions?

## Comments

- The answer is the final implementation-ready specification and should link every affected component and test seam in the repository.
- Include the semantic dark-theme token mapping and cross-platform/native-title-bar smoke matrix; these no longer require separate visual decisions after prototype A was approved.
- Resolved after the user accepted the recommended sidebar navigation, caret-position behavior, preference migration, and no-document status-bar state.

## Answer

This is the implementation handoff for the replacement application shell. It incorporates the final approved prototype on local branch `codex/prototype-typora-shell` at commit `0a2d74c5`. An implementation session should not reopen the product decisions below; it should only revisit the map if a constraint proves technically impossible.

### Locked shell contract

The editor window uses one grid-based shell with four rows and two columns:

```text
                 sidebar column       workspace column
30px title bar   ─────────────── spans the complete window ───────────────
26px navigation  sidebar navigation   editor tabs, when enabled
1fr content      sidebar content      editor/recent content
24px status bar  ─────────────── spans the complete window ───────────────
```

- The custom in-app title bar is exactly 30px high and spans both columns.
- The editor tab row is exactly 26px high, occupies only the workspace column, and remains independently hideable. Hiding it removes its row height from the workspace; it does not remove the sidebar's own top navigation.
- The sidebar is a full docked pane. Its default width is 255px, its minimum width is 220px, and hidden width is exactly 0px. There is no 45px activity rail, overlay form, or responsive breakpoint that restores one.
- The status bar is exactly 24px high, spans the complete window, and remains mounted when there is no active document.
- The editor uses the user's `editorLineWidth` as the authoritative line width. The visual reference is 736px, ordinary top inset is 38px, and minimum inline paper padding is 14px. The paper becomes fluid when the workspace is narrower.
- The Preferences window is unchanged. In particular, do not globally replace `--titleBarHeight`, because the Preferences shell currently consumes it. Add editor-shell geometry tokens or use shell-scoped variables.
- At the primary Windows light acceptance size, each exact dimension above has a ±1px rendering tolerance at 100% zoom.

### Canonical language

- **Application shell**: the title bar, sidebar, editor tabs, workspace and status bar of an editor window. It excludes the document theme and the separate Preferences window.
- **Sidebar visibility**: whether the complete docked sidebar occupies width. It is independent from the selected sidebar view.
- **Sidebar view**: one of `files`, `search`, or `toc`. `toc` remains the stable internal identifier; its user-facing name is **Outline**. Do not use `rightColumn` in the new interface.
- **Source mode**: the existing per-window `sourceCode` state and its active-tab WYSIWYG/source transition. The status button is another command entry point, not another source-mode state.
- **Caret position**: a one-based `{ line, column }` display value derived from the active editor adapter. It is transient UI state and is never written to preferences.

### Module and seam design

#### 1. Shell layout module

Deepen [the layout store](../../../packages/desktop/src/renderer/src/store/layout.ts) into the only renderer module that owns shell layout state. Its interface must expose typed readonly state and intention-revealing transitions:

```ts
type SidebarView = 'files' | 'search' | 'toc'

sidebarVisible: boolean
sidebarView: SidebarView
sidebarWidth: number
tabBarVisible: boolean
effectiveSidebarWidth: number

showSidebar(view?: SidebarView): void
hideSidebar(): void
toggleSidebar(): void
selectSidebarView(view: SidebarView): void
setSidebarWidth(width: unknown): void
toggleTabBar(): void
restoreLayout(snapshot: unknown): void
```

The exact names may follow repository naming conventions, but the interface semantics must not change. Remove the generic public `SET_LAYOUT`/empty-string convention after all callers migrate. The module hides normalization, persistence, buffered-state conversion, menu synchronization, and IPC details. Tests exercise these outcomes through this interface rather than mutating refs.

The local command bus and Electron IPC are adapters at the same seam:

- [renderer commands](../../../packages/desktop/src/renderer/src/commands/index.ts) continue to express `view.toggle-sidebar`, `view.toggle-tabbar`, and `view.source-code-mode`.
- [main-process view actions](../../../packages/desktop/src/main/menu/actions/view.ts) select `toc` or toggle visibility without knowing layout implementation details.
- [find-in-folder handling](../../../packages/desktop/src/renderer/src/store/listenForMain.ts) selects `search` and shows the sidebar.
- [project opening](../../../packages/desktop/src/renderer/src/store/project.ts) selects `files`, shows the sidebar, and preserves the existing tab-bar behavior.
- [editor bootstrap](../../../packages/desktop/src/renderer/src/store/editor.ts) restores visibility, tab state and the migrated layout snapshot through the layout module.

#### 2. Application shell visual module

[The editor-window page](../../../packages/desktop/src/renderer/src/pages/app.vue) remains the composition root, but delegates grid geometry to a shell visual module. That module accepts title-bar, sidebar, workspace and status-bar content through a small prop/slot interface and hides all row/column calculations. Do not repeat `100vh - ...` or `100vw - ...` calculations across child modules.

[EditorWithTabs](../../../packages/desktop/src/renderer/src/components/editorWithTabs/index.vue) owns editor-stack behavior only. Remove its knowledge of sidebar width; CSS grid/flex sizing gives it the available workspace. [SourceCode](../../../packages/desktop/src/renderer/src/components/editorWithTabs/sourceCode.vue) must likewise size from its container rather than subtracting the old global title-bar variable.

#### 3. Sidebar module

Recompose [the sidebar](../../../packages/desktop/src/renderer/src/components/sideBar/index.vue) without `.left-column` or an empty `rightColumn` state:

- A 26px top navigation row begins at the sidebar's top edge, aligned with the editor-tab row.
- Files and Outline are text tabs. A 34px search button shares the row and selects the Search view. The layout must survive localized labels without overlapping the search control.
- Selecting Files, Outline or Search always shows the full sidebar and selects that view. Selecting the already active view is a no-op; it never hides or narrows the sidebar.
- A settings control is pinned to the bottom of the sidebar content and continues to call the existing `OPEN_SETTING_WINDOW` path. It does not redesign Preferences.
- Only the status-bar Hide Sidebar control, the View menu/shortcut, or their shared command hides the sidebar.
- Keep [Files/tree](../../../packages/desktop/src/renderer/src/components/sideBar/tree.vue), [Search](../../../packages/desktop/src/renderer/src/components/sideBar/search.vue), and [Outline/TOC](../../../packages/desktop/src/renderer/src/components/sideBar/toc.vue) as view implementations. Preserve their local expand/collapse and search state while the whole sidebar is hidden; visibility changes must not remount the active view unnecessarily.
- Retain the resize drag bar. During drag, render the preview width locally; on pointer release, commit once through the layout interface. Use pointer capture or fully remove document listeners on unmount.

#### 4. Title, tabs and status modules

- [TitleBar](../../../packages/desktop/src/renderer/src/components/titleBar/index.vue) keeps filename, save indicator, application menu, drag region and native window controls. Remove word-count rendering and its prop from the title bar.
- [Tabs](../../../packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue) keeps drag/reorder/close/new-tab behavior; only its shell sizing and tokens change to the 26px contract.
- Add a status-bar visual module beside the other shell modules. It receives already-derived display state and emits/intakes commands; it must not own a second copy of editor or layout state.

The status-bar contents are exact:

```text
left:  [Hide Sidebar 34px] [Toggle Source Code Mode 34px] [context]
right: [document mode] [Ln n, Col n] [word-count control]
```

- Both left controls have an exact 34px footprint. Their SVG elements use an exact 16×16 view box, the same grid-centering rule, and equal center coordinates. The sidebar chevron points toward the result of the action.
- The source button's tooltip and accessible name are `Toggle Source Code Mode`. It exposes `aria-pressed`, invokes the existing `view.source-code-mode` path, and is disabled when there is no active document.
- Context is `No document` without an active document; otherwise it is the localized active sidebar-view name while the sidebar is visible and `Editor` while it is hidden.
- Document mode is `Markdown` in WYSIWYG mode and `Source` in source mode.
- Caret position is displayed one-based as `Ln n, Col n` in both modes. It is hidden until a valid active-document position is available.
- Move the existing clickable word/paragraph/character/all cycle and tooltip from TitleBar into the status bar. It must read `currentFile.wordCount`, so changing tabs immediately changes the count. Preserve the existing `W`, `P`, `C`, `A` cycle.
- With no active document, keep the status bar and sidebar control visible, disable the source button, show `No document`, and hide document mode, caret position and word count. Preserve the existing source-mode preference internally so a later document opens in the expected mode.

#### 5. Caret-position adapters

Both editor implementations emit the same transient interface upward:

```ts
type CaretPosition = { line: number; column: number } | null
```

- [SourceCode](../../../packages/desktop/src/renderer/src/components/editorWithTabs/sourceCode.vue) reads CodeMirror's head/focus cursor during `cursorActivity` and converts its zero-based `{ line, ch }` to one-based display values.
- [Editor](../../../packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue) reads `Muya.getCursorOffset()?.focus` after `selection-change`. Coalesce calls to at most once per animation frame so rapid arrows/selections do not repeatedly serialize the document in one frame.
- [EditorWithTabs](../../../packages/desktop/src/renderer/src/components/editorWithTabs/index.vue) normalizes/re-emits the active adapter value. The composition root clears it before a tab or mode switch and accepts updates only from the current tab/mode, preventing a stale async update from the previous editor.
- Line/column collection must not change saved cursor behavior, markdown, undo history, word count, or the source/WYSIWYG transition.

### Required state transitions

| Event | Sidebar visibility | Sidebar view | Width | Other observable result |
| --- | --- | --- | --- | --- |
| Cold start with no restorable state | Existing visibility default | `files` | `255` | Existing tab/source defaults remain |
| Restore valid prior state | Preserve | Preserve `files/search/toc` | Preserve | Menu checkmarks synchronize once |
| Restore legacy `rightColumn: ''` | Preserve old visibility | `files` | Preserve valid width | No activity rail appears |
| Select Files/Outline/Search | `true` | Selected view | Unchanged | Selecting active view is a no-op |
| Toggle sidebar while visible | `false` | Unchanged | Unchanged | Occupied width becomes 0 |
| Toggle sidebar while hidden | `true` | Unchanged | Unchanged | Previous view and local view state return |
| Resize sidebar | Unchanged | Unchanged | Commit normalized value | Editor fluidly takes remaining space |
| Toggle tab bar | Unchanged | Unchanged | Unchanged | Only workspace tab-row height changes |
| Toggle source using menu/status/shortcut | Unchanged | Unchanged | Unchanged | All entry points share one source state and menu checkmark |
| Switch active tab | Unchanged | Unchanged | Unchanged | Count and caret follow the active tab; no stale metrics |
| Close last document | Unchanged | Unchanged | Unchanged | Persistent no-document status state |

### Preference and buffered-state migration

- Keep `sideBarVisibility`, `tabBarVisibility`, and `sourceCodeModeEnabled` in [the preference schema](../../../packages/desktop/src/main/preferences/schema.json) and [bootstrap contract](../../../packages/desktop/src/shared/types/files.ts). Do not introduce a shell feature flag.
- Keep the existing `side-bar-width` localStorage key so valid user widths migrate without a copy step.
- Width normalization is deterministic: a finite stored value at least 220 is preserved exactly; a finite value below 220 becomes 220; missing, non-finite or otherwise invalid state becomes 255. Do not rewrite a valid existing 280px value to the new default.
- New buffered state writes `{ sidebarView, sidebarVisible, tabBarVisible, sidebarWidth }` (names may mirror the store interface). During the migration release, the reader also accepts legacy `{ rightColumn, showSideBar, showTabBar, sideBarWidth }`.
- Legacy `rightColumn` values `files`, `search`, and `toc` map directly. Empty, missing or unknown values map to `files`; they never create a rail state.
- Preserve the existing `restoreLayoutState` behavior in [the editor-window bootstrap](../../../packages/desktop/src/main/windows/editor.ts): when restoration is disabled, do not unexpectedly force the sidebar open.
- Update [shared layout types](../../../packages/desktop/src/shared/types/preferences.ts) so invalid or empty sidebar views cannot be produced by typed callers.
- No rollback adapter or old-shell branch remains after migration. The compatibility reader is only for persisted snapshots.

### Semantic shell tokens

Add the shell aliases in [common renderer styles](../../../packages/desktop/src/renderer/src/assets/styles/index.css). Every existing theme then supplies values through its current semantic variables; do not paste light-theme literals into the 32 theme files.

| New shell token | Value/alias | Use |
| --- | --- | --- |
| `--appShellTitleBarHeight` | `30px` | Main editor title row only |
| `--appShellTabBarHeight` | `26px` | Workspace tabs and sidebar navigation alignment |
| `--appShellStatusBarHeight` | `24px` | Persistent bottom row |
| `--appShellSidebarWidth` | `255px` | Missing/invalid-state default |
| `--appShellEditorTopInset` | `38px` | Ordinary editor top spacing |
| `--appShellPaperMinInlinePadding` | `14px` | Narrow workspace padding floor |
| `--appShellEditorBg` | `var(--editorBgColor)` | Workspace/title surface |
| `--appShellSidebarBg` | `var(--sideBarBgColor)` | Sidebar and status surface |
| `--appShellFg` | `var(--sideBarColor)` | Normal shell text |
| `--appShellStrongFg` | `var(--sideBarTitleColor)` | Active/strong shell text |
| `--appShellMutedFg` | `var(--sideBarTextColor)` | Secondary status/navigation text |
| `--appShellIcon` | `var(--sideBarIconColor)` | Shell icons |
| `--appShellHoverBg` | `var(--sideBarItemHoverBgColor)` | Hover surfaces |
| `--appShellDivider` | `var(--itemBgColor)` | One-pixel separators |
| `--appShellAccent` | `var(--themeColor)` | Active indicator/pressed state |
| `--appShellFocus` | `var(--focusColor)` | Keyboard focus ring |

All controls must retain visible hover, pressed, disabled and `:focus-visible` states in light and dark themes. If a specific theme exposes inadequate contrast, correct its existing semantic variable or add one justified shell token; do not add per-module theme-name checks.

### Implementation order

Implement on the current local feature branch in reviewable commits, without a user-facing flag:

1. Extract pure layout normalization/migration and add unit tests; deepen the layout-store interface and migrate IPC/menu/project/search/bootstrap callers.
2. Introduce shell geometry tokens and the grid-based application-shell module. Remove child viewport subtraction.
3. Recompose the sidebar navigation, settings entry, resize behavior and complete hide/show transition. Replace obsolete activity-rail tests.
4. Add the status bar and route the two left controls through existing commands. Move word count out of TitleBar.
5. Add the two caret-position adapters, stale-update guard and one-based formatter.
6. Apply exact title/tab/editor geometry and semantic theme aliases; verify custom/native title-bar behavior.
7. Run the complete automated and manual matrix. Fix only regressions caused by the shell; unrelated maintenance bugs remain outside this map.

Each step may be locally committed, but the replacement shell is complete only when all steps and acceptance gates pass. Never push these commits.

### Automated acceptance matrix

Add or update tests at the module interfaces rather than preserving tests for deleted rail implementation details.

| Test seam | Required coverage |
| --- | --- |
| New layout-store unit spec | width normalization; new snapshot restore; every legacy snapshot mapping; active-view selection; same-view no-op; hide/show preserving view and width; menu/persistence effects once per transition |
| [titlebar-visibility.spec.ts](../../../packages/desktop/test/unit/specs/titlebar-visibility.spec.ts) | Preserve custom/native/macOS visibility rules; add no-phantom-row assertion through a shell geometry helper if extracted |
| New caret formatter/adapter unit specs | zero-to-one conversion, null cursor, focus endpoint, stale tab/mode token rejection, per-frame coalescing |
| [layout-toggles.spec.ts](../../../packages/desktop/test/e2e/layout-toggles.spec.ts) | Complete sidebar toggles between 0 and full width; Files/Search/Outline selection; same-view no-op; tab row independent; delete the obsolete “collapse to icon strip” test |
| [issue-2421-sidebar-state.spec.ts](../../../packages/desktop/test/e2e/issue-2421-sidebar-state.spec.ts) | Rewrite around whole-sidebar hide/show: widened width and tree collapse state survive; assert no width between 1 and 219 appears |
| New shell-geometry E2E spec | custom title 30px, tabs 26px, status 24px, default sidebar 255px, hidden 0px, editor inset/padding, no blank sidebar header, both controls 34px, both SVGs 16×16 and center coordinates equal within 0.5px |
| [editor-input.spec.ts](../../../packages/desktop/test/e2e/editor-input.spec.ts) | Move selectors from title-bar count to status count; preserve live edit, active-tab and W/P/C/A cycle coverage |
| [view-modes.spec.ts](../../../packages/desktop/test/e2e/view-modes.spec.ts) | Status source button, menu and shortcut all drive one state; `aria-pressed` and menu checkmark agree; disabled in no-document state |
| [issue-781-source-undo.spec.ts](../../../packages/desktop/test/e2e/issue-781-source-undo.spec.ts) and source reload/undo specs | Existing undo, saved state, content, scroll and cursor round trips remain unchanged |
| New status E2E spec | no-document state; context labels; mode label; active-tab count; exact line/column in WYSIWYG and source; no stale position after tab/mode switch |

Required verification commands after implementation:

```text
pnpm typecheck
pnpm test:unit
pnpm test:e2e -- layout-toggles.spec.ts issue-2421-sidebar-state.spec.ts editor-input.spec.ts view-modes.spec.ts <new-shell-specs>
pnpm test:e2e
pnpm lint
pnpm build:unpack
```

If the repository's Playwright argument forwarding differs, run the equivalent filtered command from `packages/desktop`; the acceptance requirement is the same.

### Manual platform and theme matrix

| Platform/configuration | Required result |
| --- | --- |
| Windows, custom title bar, light, 100% zoom | Pixel baseline: all exact geometry, editor placement and control alignment match approved prototype A; title drag/menu/minimize/maximize/close work |
| Windows, custom title bar, dark | Same geometry; shell text, icons, dividers, hover, pressed, disabled and keyboard focus states remain distinguishable through semantic tokens |
| Windows, native title bar, light and dark | No duplicate in-app title or phantom 30px gap; tabs/sidebar start immediately below native chrome; all shell commands work |
| macOS, light and dark | Preserve the existing rule that the in-app title remains visible even when preference value is `native`; traffic-light/drag/rename behavior and all shell commands work |
| Linux, custom and native where supported | No duplicate title, clipping or inaccessible command; sidebar resize/hide, tabs, source mode and status metrics work |
| Windows narrow window, 640×480 | No overlay and no activity rail; sidebar remains docked until explicitly hidden; editor remains usable after hiding it; status controls do not overlap right metrics |
| Windows zoom/DPI smoke | At application zoom around 125% and a non-100% display scale, regions remain aligned and keyboard/pointer targets remain operable; exact pixel matching is required only at the baseline |

Manual persistence smoke must cover restart with: sidebar hidden; each of Files/Search/Outline active; a widened sidebar; tabs hidden; source mode enabled; and a legacy buffered state with empty `rightColumn`. In every case, menu checkmarks and rendered state must agree.

### Completion gate

The handoff is implemented only when:

- no renderer path can produce the 45px rail or `rightColumn === ''` state;
- all sidebar, tab and source-mode menu/keyboard entry points still work;
- the status bar owns word count and accurate active-editor caret position;
- valid preferences survive and legacy ambiguous state migrates deterministically;
- Windows custom/light passes exact geometry and the remaining platform/theme matrix passes functional smoke;
- Preferences and the Markdown document theme have not changed; and
- the complete change remains committed locally without a GitHub push.
