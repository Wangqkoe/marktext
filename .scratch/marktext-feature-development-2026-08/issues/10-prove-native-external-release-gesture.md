# 验证原生窗口外释放手势

Type: `prototype`
Status: `prototype-review`
Blocked by: 03
Review blockers: physical-mouse Windows event-hook trace; independent high-risk review

## Question

Use a throwaway technical prototype to prove that a source-tab left-button drag can cross a `BrowserWindow` boundary and commit only on an actual external button release. Verify re-entry and Escape cancellation, and prove that boundary crossing, blur, and timeout do not detach. Record observable logs and results for Windows primary display, multi-display/DPI scenarios, and macOS/Linux as actual evidence or `Unavailable`. Compare safe main-process/native strategies without product implementation, then record the fallback decision.

## Comments

- High-risk gate: use `gpt-5.6-terra` at `high`; it must resolve before product implementation.
- No substitute is acceptable: a button, boundary-crossing trigger, blur, or timeout cannot replace the actual external left-button-release gesture.

## Prototype review result

The probe does **not** establish a production-safe implementation from this
environment, so this ticket is not resolved. Electron renderer and public
`BrowserWindow` signals do not provide an external `mouseup`; `blur` is only
advisory. The only candidate that preserves the accepted interaction is an
event-level platform-native pointer observer behind a narrow main-process adapter:
start a session only after renderer source-tab left press; re-arm it after each
new exit; cancel on Escape; and commit only on the observed native left-button-up
event outside the source native-window bounds.

The original Windows polling idea (`GetAsyncKeyState` + `GetCursorPos`) is
**rejected**: button-state and cursor reads are not an atomic release event and
can misclassify a gesture. The replacement throwaway helper uses `WH_MOUSE_LL` to
emit `WM_LBUTTONUP` with the event's coordinates and `WH_KEYBOARD_LL` to observe
Escape outside the window. It could not be exercised with real desktop mouse input
here: injected `SendInput` yielded neither a source-tab renderer press nor an
event-level native mouse transition, and the available Windows controller rejects
a drag endpoint outside the target window.

Coordinate/trust contract: `WH_MOUSE_LL` event coordinates are physical screen
pixels. The probe records BrowserWindow bounds in DIP and converts them with local
Electron 42.1.0 `screen.dipToScreenRect(source, source.getBounds())`; only that
physical rect is used for hit testing. Every mouse event used to arm or commit
must be `injected:false`; injected/missing-trust events are logged and ignored.
Mixed-DPI behavior remains `Unavailable` pending physical validation.

A user completed the manual Windows interaction pass, but its raw trace contains
3,739 native mouse events (including 43 ups), all `injected:true`; trusted mouse
and up events, candidates, re-entries, and commits are zero. The repeatable
summary records raw SHA-256 and produces a filtered audit trace without the full
pointer-move stream. Verdict: `Unavailable: human-operated session arrived
entirely as injected input`. This proves the hook/trust gate fails closed, not a
physical-release gesture. `injected:false` is an evidence gate only; product
compatibility for remote-control and assistive input requires a separate decision.

**Blockers:** a physical-mouse Windows trace from the event-level hook and
independent high-risk review. Until both are complete per platform, external
window detach stays disabled. This is compliant with the strict gesture but
blocks the V1 external-drag core path; in-window reorder/split may remain
available. Do not replace the external release with a button, a boundary
crossing, `blur`, a timeout, or a threshold.

Evidence and repeatable probe: [`prototypes/native-external-release-gesture`](../prototypes/native-external-release-gesture/README.md).

| Coverage | Result |
| --- | --- |
| Windows primary display environment | `Observed`: Windows 11 Pro build 26200, Electron 42.1.0, one 2560×1440 primary display, scale 1 / 96 DPI; capability remains unavailable. |
| Boundary, re-entry, blur, timeout, Escape, and outside-up semantics | `Passed` shared-state-machine check; it is not native-input evidence. |
| Actual Windows cross-boundary physical left release | `Unavailable`: no usable active-desktop injection or out-of-window controller endpoint. |
| Multi-display / mixed DPI | `Unavailable`: only one 96-DPI display was present. |
| macOS / Linux | `Unavailable`: no host or native helper run. |
| Physical manual input | `Unavailable`: human-operated pass completed, but every native mouse event/up was `injected:true`, so no physical-input claim. |

Commands run: event-helper readiness command, `node --check .../main.cjs`, `node --check .../verify-state-machine.cjs`, and `node .../verify-state-machine.cjs` (Passed). The Electron `--automated` run remains `Unavailable` evidence; its trace records platform metadata and absence of usable native input.
