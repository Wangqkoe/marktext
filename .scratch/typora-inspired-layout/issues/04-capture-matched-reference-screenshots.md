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

The reference versions are Typora 1.13.7 and MarkText 0.20.0-rc.1. The Windows display scale was not supplied, so the next ticket must treat measurements as screenshot pixels and compare normalized proportions before approving implementation values.

Observable evidence for the next ticket:

- The hidden-sidebar image exposes both complete top-chrome stacks, editor horizontal placement, document width, vertical starting position, and Typora's bottom-right word count.
- The visible-sidebar image pairs Typora's Outline with MarkText's Table of Contents for the same headings.
- Typora presents Files/Outline as the sidebar's own top-level modes without a persistent activity rail. MarkText currently spends additional width on an activity rail beside the content pane.
- MarkText shows its retained two-tab second row; Typora provides the reference hierarchy without that row.
- Typora keeps status information at the bottom edge, while MarkText currently places count information in the upper-left shell area and has no distinct bottom status region.

Settings screenshots are not required because the accepted destination covers the application shell and workspace, not the separate settings window. Dark-shell pixel references are also unnecessary because dark mode is constrained to semantic-token usability rather than Typora matching.

## Comments

- HITL task: the user will provide the screenshots. Record image paths, dimensions, display scale, app versions, and any interaction needed to reach each state when resolving this ticket.
- Resolved from the two comparison images supplied by the user. The source images were copied from the temporary clipboard directory into the map's `assets` directory.
