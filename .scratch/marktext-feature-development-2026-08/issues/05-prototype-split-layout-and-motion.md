# 确认 Split 布局、命中区与动效

Type: `prototype`
Status: `resolved`
Claimed by: prototype task
Blocked by: 03, 04

## Question

Create a low-cost split-workspace prototype to confirm left/right drop targets, per-pane tabs, divider behavior, minimum widths, automatic collapse, focus movement, 150–200ms motion, and reduced-motion behavior. Preserve reviewable evidence for the accepted interaction.

## Answer

Accepted **A — Live divide**. The broad 31% Edge bands are accepted; while a candidate is active, the band expands in real time to preview a prospective 50/50 pane, and the layout is committed only when the pointer is released. Standard motion is 180ms; reduced-motion is 0ms.

Pane minimum width is 320px. Split is disabled when the workspace is narrower than 720px, while tab reordering remains available. The divider is draggable and clamped to the pane minimum; double-clicking it resets the ratio to 50/50. Per-pane tabs and focus follow the accepted pane-scoped domain model. An empty pane auto-collapses, and an all-empty workspace creates a clean untitled page.

The context-menu operation group is a flat, top-level sequence: `Move to new window`, `Open in new window`, `Split Right`, separated from existing items by a divider. There is no `Split Left` item and no submenu; left splitting is performed by dragging into the left Edge band.

Electron/Vue integration, real editor behavior, dragula coexistence, native external-window dragging, multi-display and high-DPI behavior, and accessibility remain unverified and are implementation acceptance checks.

## Comments

- The prototype must not become production implementation.
- Prototype branch: `codex/prototype-split-layout-motion`
- Prototype tip: `a773e1300d8b9089843eca70c1120ffa3cfd975d` (`prototype: fix split candidate visual overlap`). The completed visual-evidence commit remains in history as `64f43e86b019145396e87b2b60dfd19b88e245a0`, and the initial prototype commit as `dc32db8e02b0b94854d5fe686121d968bfc73f6b` (`prototype: explore split layout and motion`).
- Run: from `prototypes/split-layout-motion`, run `start index.html`, or open `index.html?variant=A`. The floating bottom switcher and left/right arrow keys update `?variant=A|B|C`.
- Variants: **A — Live divide** (edge band directly previews a 50/50 pane at 180ms); **B — Content push** (existing document compresses and target pane enters from the edge at 180ms); **C — Outline then snap** (stable outline while dragging, panes form on release at 160ms). All preserve the already accepted broad 31% Edge bands.
- Verified in the in-memory prototype: full state readout for single/split, dragging/candidate/committed/cancelled/collapsed, left/right, per-pane tabs/active tab, FocusedPane, ratio, motion, and narrow feedback; candidate/release commit; Escape cancel; re-enter recompute; divider pointer drag with a 320px minimum pane clamp and double-click 50/50 reset; focus routing; empty-pane collapse; all-empty clean untitled; narrow disablement below 720px; reduced motion at 0ms; URL and keyboard variant switching. `node --check renderer.js` and Playwright local-file visual smoke passed.
- Unverified: Electron/Vue integration, real MarkText editor state, dragula coexistence, native external-window drag behavior, physical multi-monitor / high-DPI behavior, and full accessibility review.
- Evidence: `prototypes/split-layout-motion/evidence/summary.md`; each A/B/C variant now has an equivalent left-candidate and committed comparison: `variant-A-left-candidate.png`, `variant-A-committed.png`, `variant-B-left-candidate.png`, `variant-B-committed.png`, `variant-C-left-candidate.png`, `variant-C-committed.png`; `variant-C-collapsed-reduced.png` remains the seventh lifecycle/motion capture. All seven use 1440 × 900 CSS pixels at scale 1 and were state-panel checked before capture.
- User choices confirmed: **A — Live divide**, the 320px divider minimum, 180ms standard motion / 0ms reduced motion, flat `Split Right` menu placement, pane focus, and automatic-collapse behavior.
