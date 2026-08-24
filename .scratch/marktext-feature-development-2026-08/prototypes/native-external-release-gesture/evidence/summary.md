# Issue 10 accepted physical evidence

## Accepted result

`summarize-physical-trace.cjs` hard-validates the immutable raw Windows capture:
valid JSONL, a unique continuous `n=1..4772`, SHA-256
`373fc09c782b140ed3bea7a0f49bf182f0c1851150baaf80be0edbaf3bfbb49d`, and
3,647,637 bytes. The frozen trace has `manual-ready` and `hook-ready`, no
`hook-exit`, and records explicit main-process termination rather than a graceful
helper shutdown. It was captured with integration probe `a9b76808` (per-event
snapshot work `b49389dc`).

The verified result is **Passed: Windows single-primary physical external release
contract**: Windows 11, Electron 42.1.0, one 2560×1440 primary display at scale
1 / 96 DPI. All 2,679 mouse events and all 17 ups are `injected:false`. Seven
source gestures produced seven candidate arms, two re-entries, four commits, two
inside-up no-detaches, one Escape cancellation, six timeout observations (three
active candidates), and three blur observations (one active candidate). The G7
active blur did not detach; an external trusted up committed 2,971 ms later.

The filtered audit trace retains readiness, source starts, candidate/re-entry,
timeout/blur, Escape/cancel, native up/no-active/up-no-detach, and commit records
with their native flags, coordinates, gesture ID, and per-event dynamic DIP and
physical bounds/display snapshot. It excludes standalone pointer moves.

## Coordinate and trust contract

`MSLLHOOKSTRUCT.pt` is a physical Windows screen-pixel coordinate. Electron
42.1.0 `screen.dipToScreenRect(source, source.getBounds())` converts the
BrowserWindow DIP rectangle to the physical rectangle used for every recorded
hit-test. Each candidate and commit carries that same event snapshot. The
`injected:false` condition is a physical-evidence threshold for this prototype,
not a product policy for remote-control or assistive input.

## Historical injected session

The retained `manual-injected-*` artifacts document an earlier human-operated
session whose 3,739 mouse events and 43 ups were all `injected:true`; it correctly
failed closed and is not used for this acceptance result.

## Strategy / fallback

| Strategy | Result |
| --- | --- |
| Renderer `mouseup`, pointer capture, or `blur` | Rejected: cannot see an external release. |
| Electron main-process public window events | Rejected: no global event-level left-button-up. |
| `GetAsyncKeyState` + `GetCursorPos` polling | Rejected: release state and cursor position are non-atomic and can misclassify a release. |
| Event-level native adapter (`WH_MOUSE_LL` / platform equivalent) | Selected: a narrow main-process adapter consumes event-level platform-native input after a renderer-created source gesture. |
| V1 fallback | Disable external detach where platform evidence is unavailable. This blocks that V1 external-drag path; do not substitute another trigger. |

## Coverage

| Coverage | Status |
| --- | --- |
| Windows event-hook source compilation/readiness | `Passed` |
| Shared state-machine scenarios | `Passed` semantic-only |
| Windows single-primary physical cross-boundary external release | `Passed` |
| Windows multi-display / mixed DPI | `Unavailable` (one 96-DPI display present) |
| macOS / Linux | `Unavailable` |
| Independent review | `Completed` for the accepted Windows single-primary trace |

## Reproduce

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\native-mouse-hook.ps1 -Milliseconds 100
node --check .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\main.cjs
node .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\verify-state-machine.cjs
node .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\summarize-physical-trace.cjs 'E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08\.scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\evidence\manual-session.jsonl'
```

New physical evidence is required for every unavailable platform/configuration.
Until then, V1 disables external detach there rather than replacing it with a
button, a crossing, `blur`, a timeout, or a threshold.
