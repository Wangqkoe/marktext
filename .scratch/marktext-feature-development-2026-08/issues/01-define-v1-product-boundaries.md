# 确定首版产品边界

Type: `grilling`
Status: `resolved`
Blocked by:

## Question

What should this Wayfinder map deliver, and what V1 behavior is accepted for cross-window tabs, split panes, and HTML `details` disclosures?

## Answer

This map ends with a unified, implementation-ready plan: confirmed interaction prototypes, specifications, risk controls, tickets, and an acceptance matrix. It does not implement product code.

- `Move to new window` supports saved, dirty, and untitled tabs losslessly: content, dirty state, cursor, and scroll transfer; the source closes only after the target acknowledges ownership.
- `Open in new window` is available only for a saved path. Both windows may edit; when the source is dirty, the target opens the saved disk version. Save conflicts must be explicit and never silently overwrite.
- Split V1 is at most two editable left/right panes with a tab bar per pane. A document appears in at most one pane; an empty pane collapses to a single-pane workspace.
- HTML disclosure V1 is a styled standard raw-HTML preview. The `open` attribute provides persistent initial state; a click only changes temporary UI state. Source editing remains HTML source editing.
- A unified tab-drag prototype and a details-disclosure prototype are mandatory gates before implementation specification.

## Comments

- Resolved from the user's acceptance of all recommended scope decisions.
