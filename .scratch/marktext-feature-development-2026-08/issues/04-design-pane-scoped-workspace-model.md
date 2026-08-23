# 设计 pane-scoped workspace domain model

Type: `grilling`
Status: `open`
Blocked by: 01

## Question

Define the pane-scoped workspace model for Document, Tab, View, Pane, and FocusedPane; the boundary for decomposing the singleton editor and event bus; session persistence and migration; TOC, status, source mode, and command behavior; and enforcement of the same-document prohibition.

## Comments

- This is a high-risk shared seam because it changes editor ownership and persisted workspace state.
