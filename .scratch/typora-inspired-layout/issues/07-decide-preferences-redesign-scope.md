# Decide whether Preferences joins the redesign

Type: `grilling`
Status: `resolved`
Blocked by: 04

## Question

Should the Typora-inspired effort also redesign MarkText's separate Preferences window, or should those screenshots serve only as supporting evidence for shared controls and visual language while the implementation destination remains limited to the main application shell and workspace?

If Preferences is included, should the specification pursue Typora's denser full-width settings layout and navigation hierarchy while preserving every existing MarkText setting, or only align shared tokens such as spacing, typography, borders, switches, inputs, and colors?

## Answer

The separate Preferences window is not part of this redesign. The destination remains the main application shell and workspace layout. The Preferences screenshots may inform shared control legibility and visual-language consistency, but they do not create geometry, navigation, density, or interaction requirements for the settings window.

## Comments

- This decision surfaced when the user supplied dedicated Typora and MarkText settings screenshots after the main-shell screenshot task had been resolved.
- The visual-geometry prototype is blocked until this scope boundary is explicit.
- The user explicitly excluded the settings window and asked to continue to the visual prototype.
