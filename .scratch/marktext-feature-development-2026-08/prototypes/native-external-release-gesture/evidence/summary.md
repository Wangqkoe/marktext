# Issue 10 prototype-review evidence

## Review result

The external-release gate remains **blocked**. The throwaway probe now has an
auditable Windows event source: `native-mouse-hook.ps1` installs `WH_MOUSE_LL`
and writes each `WM_LBUTTONUP` with its event coordinates; it also installs
`WH_KEYBOARD_LL` to report `VK_ESCAPE`. This fixes the unsafe non-atomic
`GetAsyncKeyState`/`GetCursorPos` polling approach, which is rejected and no
longer a candidate.

However, this controlled desktop still has no physical-mouse trace showing the
full source-tab press → boundary movement → `WM_LBUTTONUP` outside sequence. Its
mouse injection channel did not deliver an event-level transition and the available Windows
controller rejects an out-of-window drag endpoint. The event hook is therefore
compiled and ready but **not gesture-proven**.

The shared `gesture-state.cjs` proves probe semantics only: renderer IPC is the
sole way to create a session; hooks cannot infer a source tab from coordinates;
an outside native-up commits; re-entry clears a candidate and a second exit
re-arms it; Escape ends the session; and timeouts are scoped to their gesture ID.
It is not a substitute for physical native-input evidence.

## Coordinate and trust contract

`MSLLHOOKSTRUCT.pt` is treated as a Windows physical screen-pixel coordinate.
The installed local Electron 42.1.0 type declaration exposes
`screen.dipToScreenRect(window, rect)` for converting a screen DIP rect to a
physical rect on Windows. The harness records BrowserWindow `getBounds()` as DIP,
converts it with `screen.dipToScreenRect(source, dip)`, records display
`scaleFactor`/units, and makes every inside/outside decision against only the
converted physical rectangle. Every mouse move/up that arms or commits must carry
`injected:false`; `injected:true` and missing flags are recorded and ignored.
This is a coordinate contract, not mixed-DPI proof; mixed DPI remains
`Unavailable`.

## Human-operated injected session

The supplied raw manual session was summarized with
`summarize-manual-trace.cjs`, which records its SHA-256, byte/line counts, time
range, source bounds, and a filtered non-pointer-move audit trace. It contains
3,739 native mouse events, including 43 `native-up` events. All 3,739 mouse
events and all 43 up events are `injected:true`; trusted mouse/up, candidate,
re-entry, and commit counts are zero. The verdict is
`Unavailable: human-operated session arrived entirely as injected input`.

This is evidence that the hook/trust gate failed closed; it is not proof of a
physical release. `injected:false` is only the physical-evidence gate for this
prototype, not a product strategy. A future product decision must separately
address compatible behavior for remote-control and assistive-input methods.

## Strategy / fallback

| Strategy | Review result |
| --- | --- |
| Renderer `mouseup`, pointer capture, or `blur` | Rejected: cannot see an external release. |
| Electron main-process public window events | Rejected: no global event-level left-button-up. |
| `GetAsyncKeyState` + `GetCursorPos` polling | Rejected: release state and cursor position are non-atomic and can misclassify a release. |
| Event-level native adapter (`WH_MOUSE_LL` / platform equivalent) | Only viable candidate; blocked pending physical-device proof and independent review. |
| V1 fallback | Disable external detach. This blocks the V1 external-drag core path; do not substitute another trigger. |

## Observed environment metadata

Windows 11 Pro build 26200 x64; Electron 42.1.0; one `Mi Monitor` primary display
(2560 × 1440, work area 2560 × 1392, 144 Hz); Electron scale factor 1 and Win32
system DPI 96. This is **Observed** metadata, not a passed capability result.

## Coverage

| Coverage | Status |
| --- | --- |
| Windows event-hook source compilation/readiness | `Passed` (helper source and short readiness run) |
| Shared state-machine scenarios | `Passed` semantic-only |
| Windows physical cross-boundary external release | `Unavailable` |
| Windows multi-display / mixed DPI | `Unavailable` (one 96-DPI display present) |
| macOS / Linux | `Unavailable` |
| Independent review | `Pending` |

## Reproduce

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\native-mouse-hook.ps1 -Milliseconds 100
node --check .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\main.cjs
node .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\verify-state-machine.cjs
$env:NODE_PATH = 'E:\Program Files\Marktext\node_modules'
& 'E:\Program Files\Marktext\node_modules\.bin\electron.cmd' '.scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\main.cjs'
```

For the required manual evidence, use a physical mouse with the final command,
press the blue source tab, leave the `BrowserWindow`, and release outside. The
trace must show renderer `source-tab-mousedown`, then hook `native-move` outside,
and exactly one `DETACH_COMMIT` containing a `native-up` / `WM_LBUTTONUP` outside
the recorded source bounds. **Every native mouse move that arms/re-arms a
candidate and the committing native-up must explicitly have `injected:false`.**
Repeat for re-entry, Escape while outside (the
keyboard hook must report `native-escape`), multi-display/DPI, and each supported
OS. Independent review must approve both the adapter boundary and those traces.
