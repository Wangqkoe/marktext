# Capture matched Typora and MarkText reference screenshots

Type: `task`
Status: `resolved`
Blocked by: 03

## Question

Capture a matched screenshot matrix that makes the remaining geometry and interaction decisions observable: Typora and MarkText at the same Windows scale and window dimensions, covering sidebar shown/hidden, one and multiple tabs, active editor with enough content to show width and vertical rhythm, bottom/status information, settings, and light mode. Include dark mode and any important edge state if it differs materially.

## Answer

Two side-by-side Windows reference images were captured with the same document and near-equal application window sizes. In both images Typora is on the left and MarkText is on the right.

- [Sidebar hidden comparison](../assets/01-sidebar-hidden.png): 2219 × 743 px, SHA-256 `461B12F793F1F8173C1A5F5D199BD98182948D205D3F0516F1C76B85B2C39179`.
- [Sidebar visible comparison](../assets/02-sidebar-visible.png): 2220 × 742 px, SHA-256 `233973C90141E4E942B424CE2F6BDCAB92A87485487E88483E313949365B3E9F`.
- [Typora Preferences](../assets/03-typora-preferences.png): 1109 × 743 px, SHA-256 `8314939E22B2071C1EFB3F95DDAF0FB28AA54621AA3EC447E5C71A688FFE25AF`.
- [MarkText Preferences](../assets/04-marktext-preferences.png): 873 × 598 px, SHA-256 `FC71F3C7F3EAFC4EC00AEAB9327AE06F1940658AAA9EF6C0D91A92D59FF25D75`.

The reference versions are Typora 1.13.7 and MarkText 0.20.0-rc.1. The Windows display scale was not supplied, so the next ticket must treat measurements as screenshot pixels and compare normalized proportions before approving implementation values.

Observable evidence for the next ticket:

- The hidden-sidebar image exposes both complete top-chrome stacks, editor horizontal placement, document width, vertical starting position, and Typora's bottom-right word count.
- The visible-sidebar image pairs Typora's Outline with MarkText's Table of Contents for the same headings.
- Typora presents Files/Outline as the sidebar's own top-level modes without a persistent activity rail. MarkText currently spends additional width on an activity rail beside the content pane.
- MarkText shows its retained two-tab second row; Typora provides the reference hierarchy without that row.
- Typora keeps status information at the bottom edge, while MarkText currently places count information in the upper-left shell area and has no distinct bottom status region.

The supplied settings screenshots show materially different information density, navigation width, window integration, form controls, and spacing. Whether the separate Preferences window joins the redesign is now a sharp scope decision recorded in [Decide whether Preferences joins the redesign](07-decide-preferences-redesign-scope.md). Dark-shell pixel references remain unnecessary because dark mode is constrained to semantic-token usability rather than Typora matching.

## Comments

- HITL task: the user will provide the screenshots. Record image paths, dimensions, display scale, app versions, and any interaction needed to reach each state when resolving this ticket.
- Resolved from the two comparison images supplied by the user. The source images were copied from the temporary clipboard directory into the map's `assets` directory.
- Two additional Preferences screenshots supplied later were preserved as supplemental evidence; the source images have different pixel dimensions and must not be treated as a direct one-to-one geometry comparison.
