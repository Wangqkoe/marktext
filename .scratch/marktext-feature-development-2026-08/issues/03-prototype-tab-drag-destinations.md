# 验证标签拖动目的地与脱离原生窗口手势

Type: `prototype`
Status: `resolved`
Claimed by: prototype task
Blocked by: 01

## Question

Create a low-cost interaction prototype that validates reorder, detach to a new window, left/right split targets, cancel, re-enter, narrow windows, multi-display behavior, and reduced-motion behavior. Preserve screenshots or recordings and the tested platform details as evidence.

## Answer

The accepted split direction affordance is **A — Edge bands**: broad left and right overlays are split candidates, and releasing inside the selected band commits the split. Reorder, cancel, re-entry/recompute, narrow-window disablement, and reduced-motion behavior follow the evidence recorded by the prototype.

The accepted detach gesture is a real external release: while holding the left mouse button on a tab, drag it beyond the source native-window boundary and commit a new-window detach only when that button is released outside the window. Crossing the boundary alone, blur, and timeout never detach. Re-entering the source window cancels the external candidate and recomputes the in-window destination.

The prototype verified target-window creation and nearest-display clamping, but did not prove that a cross-`BrowserWindow` mouse-up can be observed. Physical multi-display/DPI behavior remains unverified; platform-specific proof and any safe fallback decision are delegated to the downstream native-gesture prototype.

## Comments

- This gate is directly blocked only by the accepted V1 scope: it intentionally gathers gesture evidence before the final IPC lifecycle contract is chosen.
- Prototype branch: `codex/prototype-tab-drag-destinations`
- Prototype commit: `e63180698ef36fc8b2cbfed1f4e022276b3d88da` (`prototype: explore tab drag destinations`)
- Run: `& 'E:\Program Files\Marktext\node_modules\.bin\electron.cmd' '.scratch\marktext-feature-development-2026-08\prototypes\tab-drag-destinations\main.cjs'`
- Variants: **A — Edge bands** uses broad left/right landing zones; **B — Magnetic rail** grows a narrow edge rail into a live preview; **C — Dock compass** makes direction selection explicit in a central chooser. All use the current MarkText shell/tab/sidebar/status density and expose drag phase, candidate, commit/cancel state, motion, pointer coordinates, display, and clamp bounds.
- Verified: in-memory reorder and split candidates/commits, Escape cancel, re-enter/recompute, narrow-window split disablement, reduced-motion behavior, and a real Electron IPC smoke that creates a target `BrowserWindow` with nearest-display clamp. Visual QA screenshots and detailed observations: `prototypes/tab-drag-destinations/evidence/summary.md`.
- Not verified: a pointer released after it leaves a native `BrowserWindow` cannot be reliably observed as renderer `mouseup`; physical multi-monitor movement and DPI modes beyond the reported current scale remain Untested. Electron `capturePage` returned `UnknownVizError` on this workstation; checked-in static screenshots use local Chrome file rendering and are labelled accordingly.
- User review needed: choose A/B/C (or components to combine), and decide whether a production native-boundary fallback is acceptable or must be proven through a main-process/native drag strategy before implementation.
