# 确认 details disclosure 视觉与交互

Type: `prototype`
Status: `prototype-review`
Claimed by: prototype task
Blocked by: 06

## Question

Create a low-cost disclosure prototype that confirms triangle affordance, hover and focus states, keyboard interaction, motion and reduced motion, source-to-preview editing transition, and light/dark theme behavior.

## Comments

- Use the behavior evidence from the preceding research ticket; preserve reviewable assets rather than production code.
- Prototype branch: `codex/prototype-details-disclosure`
- Prototype commit: `66d71a505e8727010452a2cf7f060579cbe81d0c` (`prototype: explore details disclosure experience`).
- Run: from `prototypes/details-disclosure`, execute `start index.html`, or open `index.html?variant=A`; the URL accepts stable `A`, `B`, or `C` values. The floating switcher and left/right arrow keys cycle variants without intercepting input, textarea, or contenteditable key input.
- Variants: **A — Minimal inline row** (low-chrome inline disclosure; recommended candidate), **B — Guided document section** (subtle left guide with indented body), and **C — Bordered disclosure card** (contained header/card treatment). All retain real native `<details><summary>` semantics, a whole-summary hit target, a CSS triangle decoration, hover/focus-visible states, semantic light/dark tokens, and 170ms motion / 0ms reduced motion.
- Verified in the static in-memory prototype: native mouse toggling; native summary Enter behavior and focus ring; temporary native state differing from source `open`; raw source editing then explicit Preview/Escape rebuild; `disableHtml` displaying escaped source with no native element; dark mode; manual 0ms reduced motion; source-action and double-click preview affordances; URL-stable variant switching and keyboard guard. `node --check renderer.js` and the nine-state Chrome capture/assertion run passed.
- Unverified: Muya/Electron event delegation, active-block transition timing, DOMPurify handling of every details attribute, actual application theme tokens, Electron/OS keyboard and screen-reader behavior, static HTML/PDF export styling, and production CSS specificity/performance.
- Evidence: [prototype README](../prototypes/details-disclosure/README.md) and [evidence summary](../prototypes/details-disclosure/evidence/summary.md). Screenshots include closed/open states for each variant, keyboard focus/open, dark source editing, and disableHtml with reduced motion; all were captured at 1440 × 900 CSS px, scale 1, Windows Chrome headless.
- User decision needed: choose **A**, **B**, **C**, or a deliberate combination; confirm triangle direction/rotation and 170ms/0ms motion; select a discoverable source-edit affordance (`</>` beside the preview, preview double-click, or another approach). Decide later whether static HTML/PDF export should reuse this editor styling; it is not implied by the preview contract.
