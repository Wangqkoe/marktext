# Typora-inspired MarkText application shell

Label: `wayfinder:map`

## Destination

Produce an implementation-ready specification for replacing MarkText's application shell and workspace layout with an independently implemented, Typora-inspired design. The specification must settle exact visual geometry, interactions, state ownership, migration, rollout order, and acceptance tests without changing the document theme.

## Notes

- Consult `wayfinder` for map operations, `domain-modeling` and `codebase-design` for state/component seams, and `prototype` for screenshot-driven visual decisions.
- Typora 1.13.7 at `D:\Program Files\Typora` is reference evidence only. Do not copy proprietary code or assets.
- Windows with the custom title bar is the primary visual acceptance platform. macOS and Linux must remain functionally compatible.
- Keep all commits local as required by `AGENTS.md`; never push to GitHub.
- The word-count initialization and preference-switch contrast fixes are maintenance work outside this map, but the layout specification may rely on their corrected behavior.

## Decisions so far

- [Define the destination and scope](issues/01-define-destination-and-scope.md): target the application shell and workspace layout, excluding document-theme imitation and execution itself.
- [Choose the shell structure and behavior](issues/02-choose-shell-structure-and-behavior.md): adopt a full docked sidebar, compact second-row tabs, and a persistent bottom status bar while preserving MarkText capabilities.
- [Set compatibility and acceptance guardrails](issues/03-set-compatibility-and-acceptance-guardrails.md): use Windows light mode as the visual baseline, retain dark and cross-platform usability, and migrate preferences into one replacement shell.

## Not yet specified

- Screenshot evidence may expose secondary states or spacing relationships that are not yet visible enough to turn into precise questions.
- Exact dark-shell token values and allowed native-title-bar deviations depend on the light-shell geometry chosen from matched screenshots.

## Out of scope

- Reproducing Typora's document theme, typography theme, proprietary code, or bundled assets.
- Maintaining the old shell as a parallel, user-selectable layout.
- Implementing the layout while this map is still resolving decisions.
- Unrelated product bugs, except where a layout acceptance test exposes a regression caused by the new shell.
