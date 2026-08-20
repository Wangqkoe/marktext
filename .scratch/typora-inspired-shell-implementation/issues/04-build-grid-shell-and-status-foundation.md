# 04: Build the grid shell and status foundation

**What to build:** Present the editor window as one aligned grid shell with the approved title, sidebar navigation, editor tabs, workspace and persistent status regions. The first usable status slice provides complete-sidebar control and current context, while the editor retains its configured line width and remains fluid in constrained windows.

**Blocked by:** 02: Replace the activity rail with a full sidebar.

**Status:** ready-for-agent

- [ ] The in-app title bar is exactly 30px high and spans the complete editor window.
- [ ] Sidebar navigation and visible editor tabs align in a 26px row without an empty sidebar header above them.
- [ ] The persistent status bar is exactly 24px high and spans the complete window.
- [ ] Child editor and sidebar modules size from the shell container rather than repeating viewport subtraction calculations.
- [ ] Hiding the editor tab bar lets workspace content consume its row while sidebar navigation remains present.
- [ ] The user's editor line-width preference remains authoritative; the reference width is 736px, ordinary top inset is 38px and minimum inline padding is 14px.
- [ ] The editor becomes fluid when the available workspace is narrower without introducing a sidebar overlay or activity rail.
- [ ] The status bar contains a 34px complete-sidebar control with a centered 16×16px SVG and an action-direction chevron.
- [ ] The status context shows `No document` without an active document, the localized sidebar view while visible, and `Editor` while hidden.
- [ ] The custom Windows title bar retains its menu, drag region and window controls.
- [ ] Native title-bar configurations show no duplicate in-app title and no phantom 30px gap.
- [ ] Shell-scoped geometry and semantic aliases do not change the separate Preferences window's sizing.
- [ ] End-to-end geometry coverage verifies every exact dimension within ±1px at the controlled Windows baseline.
- [ ] Narrow-window behavior at 640×480 remains usable after explicitly hiding the docked sidebar.

