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
active for 10 minutes (600,000 ms) after launch; the automated mode remains 30
seconds. The live page and JSONL both expose the state.

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

The helper is deliberately external to production and has no product packaging,
persistence, or fallback behavior. It is a V1 blocker, not a production
implementation: without physical mouse evidence and independent review, external
detach must remain disabled. See `evidence/summary.md` for limitations.
