# 07: Complete shell theme, accessibility and release acceptance

**What to build:** Finish the replacement shell as one release-ready experience across MarkText themes and supported title-bar/platform configurations. Close any contrast, focus, scaling or persistence regressions exposed by the acceptance matrix, then prove the exact Windows light geometry and full functional behavior without restoring a legacy shell path.

**Blocked by:** 03: Contract the legacy sidebar layout interface; 05: Add source mode and word count to the status bar; 06: Show accurate caret position in both editor modes.

**Status:** resolved

Resolution evidence is recorded in [the Ticket 07 acceptance results](../07-acceptance-results.md). Windows and repository-level gates are complete. The three unavailable platform checks below remain deliberately unchecked and are recorded as untested rather than treated as passing.

- [x] Shell surfaces, text, icons, hover, active, pressed, disabled, divider and focus states derive from shared semantic theme values.
- [x] Every bundled dark and light theme keeps shell text and controls distinguishable without runtime theme-name branches.
- [x] Keyboard users can reach and operate sidebar navigation, status controls and retained tab actions with visible focus.
- [x] Accessible names, pressed states and disabled states are exposed for icon-only status controls.
- [x] Windows custom-title-bar light mode matches the approved 30px/26px/24px/255px geometry and control alignment at the controlled baseline.
- [x] Windows custom-title-bar dark mode preserves the same geometry with usable semantic contrast.
- [x] Windows native-title-bar light and dark modes have no duplicate title or phantom shell row and retain all commands.
- [ ] macOS light/dark smoke preserves existing in-app-title, traffic-light, drag and rename behavior. — Not run: macOS is unavailable in this workspace.
- [ ] Linux custom/native smoke retains sidebar, tabs, source mode and status behavior without clipping. — Not run: Linux is unavailable in this workspace.
- [x] A 640×480 window remains usable with an explicitly docked or hidden sidebar and no overlay/rail transformation.
- [ ] Non-default application zoom and display scaling keep controls aligned and operable. — Application zoom at 125% passed; native non-100% OS display scaling is unavailable in this session.
- [x] Restart smoke covers sidebar hidden, every selected sidebar view, widened width, tabs hidden, source mode enabled and legacy empty-view migration; menu checkmarks agree each time.
- [x] Preferences layout and Markdown document theme/typography are unchanged.
- [x] No old-shell feature flag, activity rail or runtime legacy layout interface remains.
- [x] Type checking, unit tests, targeted shell end-to-end tests, the full end-to-end suite, linting and an unpacked production build pass.
- [x] Manual acceptance results are recorded for configurations that cannot run in the current environment, rather than silently treating them as tested.
- [x] All resulting commits remain local and are not pushed to GitHub.
