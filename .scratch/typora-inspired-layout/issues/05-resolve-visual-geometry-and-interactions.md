# Resolve exact visual geometry and interactions

Type: `prototype`
Status: `resolved`
Blocked by: 04, 07

## Question

Using the matched screenshots, which exact dimensions, spacing tokens, visual hierarchy, responsive breakpoints, and sidebar/title/tab/status interactions should the implementation specification require? Produce an annotated comparison or rough shell prototype so the user can approve the result at concrete visual fidelity.

## Answer

Use prototype A, **Reference-aligned**, as the implementation baseline, with the user's requested source-mode control added to the status bar. The approved prototype primary source is local branch `codex/prototype-typora-shell` at commit `c331f3cc`.

Required geometry for the Windows light-shell baseline:

- Custom title bar: 30px high, spanning the full window.
- Separate tab row: 26px high. It remains independently hideable through the existing tab-bar preference.
- Docked sidebar: 255px default width with no persistent activity rail. Hiding it changes the occupied width to 0px and removes the whole sidebar.
- Bottom status bar: 24px high and persistent across the window.
- Reference editor line width: 736px, used as the recommended default. The user's `editorLineWidth` preference remains authoritative; the editor becomes fluid when the available main pane is narrower.
- Editor top inset: 38px at ordinary window sizes, with 14px minimum horizontal paper padding.

Required hierarchy and interactions:

- Sidebar Files/Outline modes live at the top of the full sidebar rather than in a separate activity rail.
- Files/Outline begins directly at the sidebar's top edge; there is no empty sidebar-header row or placeholder icon above it.
- The tab row stays below the title bar and begins over the editor region when the sidebar is visible.
- The status bar's left group contains, in order: whole-sidebar toggle, `</>` source-mode toggle, then current sidebar/editor context.
- The whole-sidebar toggle and source-mode toggle each use an exact 34px-wide control footprint. Both icons use a 16×16px SVG view box and the same grid-centering rule, so their horizontal and vertical centers match exactly.
- The source-mode button has tooltip and accessible name `Toggle Source Code Mode`, exposes pressed/active state, and invokes the existing active-tab source/WYSIWYG transition. It must not create a second editor-mode state machine.
- The status bar's right group contains document mode, line/column, and word count. Word count uses the corrected active-tab count state.
- No responsive breakpoint changes the shell into an overlay or restores the old rail. The layout remains fluid; users explicitly hide the docked sidebar when they need the full narrow viewport. Existing persisted sidebar visibility and width behavior must be retained or migrated.

Deliberate deviations from Typora:

- MarkText keeps its separate tab row and existing capabilities.
- MarkText's custom title-bar controls and menu entry points remain.
- The document theme and editor typography are not copied from Typora.
- Dark mode uses semantic MarkText theme variables rather than pixel matching; native title bars require functional compatibility only.

## Comments

- The answer should distinguish exact acceptance values from deliberate deviations made to preserve MarkText capabilities.
- Claimed after Preferences was explicitly excluded. The prototype will compare three main-shell variants through a `?variant=` switcher and keep the ticket open for user feedback.
- Prototype primary source: local branch `codex/prototype-typora-shell`, commit `85726367`.
- Local worktree: `C:\Users\1407\AppData\Local\Temp\marktext-typora-shell-prototype`.
- Run `pnpm exec vite .scratch/typora-inspired-layout/prototype --host 127.0.0.1 --port 5173` from that worktree, then open `http://127.0.0.1:5173/?variant=A`.
- Visual QA confirmed all three URL variants render, the complete sidebar hides/restores, and the floating arrows update the shareable query parameter. Awaiting the user's choice or combination of A (Reference-aligned), B (Workspace column), and C (Compact focus).
- The user selected A and requested a bottom-bar source-code-mode button. Prototype commit `c331f3cc` adds the button and an in-memory WYSIWYG/source transition; visual QA confirmed both states.
- Reopened for a minor approved-variant refinement: enlarge the hide-sidebar arrow to match the neighboring bottom-bar controls.
- Prototype commit `3df3e9f0` gives the sidebar toggle a 32px control width and 18px chevron. Browser QA measured the sidebar and source controls at approximately 32px and 33px wide and reconfirmed complete hide/restore behavior.
- Reopened to remove the accidental 42px empty sidebar header and make the two left status-bar controls exactly equal in width and icon alignment.
- Prototype commit `0a2d74c5` removes the empty A-variant sidebar header and replaces both status controls with centered SVG buttons. Browser QA measured both buttons at 34px wide, both icons at 16×16px, identical center Y coordinates, and reconfirmed source switching plus complete sidebar hide/restore.
