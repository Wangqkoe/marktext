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

## Accepted Windows physical-input evidence

The accepted Windows single-primary capture was immutable input outside this
worktree and was deleted after its hash was verified. The command below documents
the historical generation/reproduction flow; it is **not** an out-of-the-box
command now. To run it again, first complete a new manual capture that writes the
same raw path, then use the summarizer against that capture without copying its
pointer-move stream into the repository:

```powershell
node .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\summarize-physical-trace.cjs 'E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08\.scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\evidence\manual-session.jsonl'
```

The script rejects malformed JSON, any non-continuous/duplicate `n`, and any raw
other than SHA-256 `373fc09c782b140ed3bea7a0f49bf182f0c1851150baaf80be0edbaf3bfbb49d`
(3,647,637 bytes; 4,772 lines). It writes
`evidence/manual-windows-primary-summary.json` and a 64-line filtered audit trace.
The accepted result contains 2,679 physical (`injected:false`) mouse events and
17 physical ups, 7 gestures, 7 candidate arms, 2 re-entries, 4 commits, 2
inside-up no-detaches, 1 Escape cancel, 6 timeout observations, and 3 blur
observations (one while a candidate was active). G7 records an active blur followed
2,971 ms later by the eligible external release commit. The verdict is
`Passed: Windows single-primary physical external release contract`.

## Historical injected-session evidence

`summarize-manual-trace.cjs` and the `manual-injected-*` artifacts preserve an
earlier human-operated session: all 3,739 mouse events and 43 ups were
`injected:true`, so the trust gate correctly failed closed. That historical failed
session is not the passing physical evidence above. `injected:false` is a
prototype evidence threshold only, not a product policy; product support for
remote-control and assistive input needs its own compatibility decision.

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
persistence, or fallback behavior. The accepted proof is limited to the tested
Windows single-primary environment. V1 must keep external detach disabled on
multi-display/mixed-DPI Windows and on macOS/Linux until those platforms have their
own accepted event-level evidence. See `evidence/summary.md` for limitations.
