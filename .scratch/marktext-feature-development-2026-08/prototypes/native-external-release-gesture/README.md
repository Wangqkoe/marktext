# Native external-release gesture probe (throwaway)

This directory is a disposable Windows/Electron technical probe for Issue 10, not
MarkText product code. It answers one narrow question: can an active source-tab
drag commit **only** when Windows reports an actual left-button release outside
the source `BrowserWindow`?

## Run

From this worktree on Windows, with the workspace dependencies available at the
main checkout:

```powershell
& 'E:\Program Files\Marktext\node_modules\.bin\electron.cmd' \
  '.scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\main.cjs' --automated
```

The automated driver attempts Win32 `SendInput`; it is automation evidence, not a
claim of physical-device testing. This controlled desktop did not deliver the
attempted mouse input to the helper, so its generated failing trace is availability
evidence rather than a passing gesture result. It writes a JSONL event trace and
`evidence/automated-windows-primary-summary.json`.
For a manual pass, omit `--automated`, drag the blue source tab beyond the window
edge, then release on the desktop. The manual probe window and native hook remain
active for 60 minutes (3,600,000 ms) after launch; the automated mode remains 30
seconds. Closing the probe window or quitting Electron explicitly terminates the
native helper. The live page and JSONL both expose the state.

## Manual injected-session evidence

Summarize a captured raw session without copying its pointer-move stream into the
repository:

```powershell
node .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\summarize-manual-trace.cjs <raw-manual-session.jsonl>
```

The supplied human-operated Windows session produced 3,739 native mouse events,
including 43 button-up events; every one was `injected:true`, with zero trusted
(`injected:false`) mouse/up events, candidates, or commits. The summarized
verdict is `Unavailable: human-operated session arrived entirely as injected input`.
The hook/trust gate therefore failed closed, but this is not proof of a physical
external release. `injected:false` is an evidence gate only, not a product policy:
support for remote-control and assistive-input mechanisms requires a separate
product compatibility decision.

## Decision boundary

Electron renderer events stop being an adequate source once the pointer leaves a
native window. The probe therefore uses an event-level Windows helper: a
`WH_MOUSE_LL` callback emits each `WM_LBUTTONUP` with the coordinates belonging
to that event, and a `WH_KEYBOARD_LL` callback emits `VK_ESCAPE`. Only renderer
IPC after a source-tab left press creates a gesture session. The main process uses
the hook events to arm/re-arm an external candidate, cancel on Escape, and commit
only on a `WM_LBUTTONUP` outside the source bounds. `blur`, a boundary crossing,
and the per-session timeout only log state; none can commit.

## Coordinate and input-trust contract

The `WH_MOUSE_LL` callback's `MSLLHOOKSTRUCT.pt` is a **physical screen-pixel**
coordinate. Electron 42.1.0's local type declaration documents
`screen.dipToScreenRect(window, rect)` as converting a screen DIP rectangle to a
physical rectangle on Windows. The probe therefore records `source.getBounds()`
as `dip`, calls `screen.dipToScreenRect(source, dip)`, and uses only that
`physical` rectangle for all inside/outside comparisons. The trace records both
rectangles, display `scaleFactor`, and units. Its input trust condition is equally
strict: every mouse event used to arm a candidate or commit must have
`injected:false`; injected or missing trust flags are logged and ignored.

This conversion code does not verify mixed-DPI behavior. Mixed DPI remains
`Unavailable` until a physical-device test covers it.

## Physical validation scenarios

For every scenario, retain the trace's per-event `hitTest` snapshot (event point,
inside result, DIP/physical bounds, display metadata, and units), and require
`injected:false` for every mouse move that arms/re-arms a candidate and for the
releasing native-up.

1. Press the source tab, leave the window, and release outside; only the real
   outside `WM_LBUTTONUP` may commit.
2. Leave the window without releasing, then re-enter and release inside; no
   detach may occur.
3. Leave, re-enter, leave again, and release outside; the second exit must
   re-arm and the real up may commit.
4. Leave the window and wait beyond the timeout; no detach may occur until an
   eligible real outside up.
5. Leave the window, press Escape, then release outside; Escape must end the
   gesture and the up must not commit.
6. With an active external candidate, keep the left button held, use Alt+Tab to
   cause a real `BrowserWindow` blur, and wait. Confirm blur itself does not
   commit; then release outside the window and confirm a real eligible up can
   commit.

The helper is deliberately external to production and has no product packaging,
persistence, or fallback behavior. It is a V1 blocker, not a production
implementation: without physical mouse evidence and independent review, external
detach must remain disabled. See `evidence/summary.md` for limitations.
