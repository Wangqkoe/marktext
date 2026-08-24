# 验证原生窗口外释放手势

Type: `prototype`
Status: `resolved`
Blocked by: 03
Review: accepted Windows single-primary physical trace and independent high-risk review completed

## Question

Use a throwaway technical prototype to prove that a source-tab left-button drag can cross a `BrowserWindow` boundary and commit only on an actual external button release. Verify re-entry and Escape cancellation, and prove that boundary crossing, blur, and timeout do not detach. Record observable logs and results for Windows primary display, multi-display/DPI scenarios, and macOS/Linux as actual evidence or `Unavailable`. Compare safe main-process/native strategies without product implementation, then record the fallback decision.

## Comments

- High-risk gate: use `gpt-5.6-terra` at `high`; it must resolve before product implementation.
- No substitute is acceptable: a button, boundary-crossing trigger, blur, or timeout cannot replace the actual external left-button-release gesture.

## Answer

Select an **event-level platform-native observer behind a narrow main-process
adapter**. The renderer may only create a source-tab gesture session after the
trusted source press. The observer feeds native move/up and Escape to the adapter;
the adapter commits only on an eligible event-level left-button-up whose dynamic
per-event hit-test snapshot is outside the source `BrowserWindow`. Re-entry clears
the candidate, a later exit re-arms it, and Escape cancels the active gesture.

Windows single-primary physical evidence is **Passed**. The immutable raw capture
has SHA-256 `373fc09c782b140ed3bea7a0f49bf182f0c1851150baaf80be0edbaf3bfbb49d`,
3,647,637 bytes, 4,772 JSONL records, and a strictly unique continuous `n=1..4772`.
It records Windows 11, Electron 42.1.0, one 2560×1440 display at scale 1 / 96 DPI,
and `WH_MOUSE_LL` / `WH_KEYBOARD_LL` readiness. All 2,679 mouse events and all 17
ups are `injected:false`. Across seven source gestures, the trace proves seven
candidate arms, two re-entries, four external-up commits, two inside-up
no-detaches, one Escape cancellation followed by a trusted outside-up ignored with
no active gesture, six timeout observations, and three blur observations. In G7,
an active-candidate blur did not detach; the eligible external up committed 2,971
ms later. The main process was explicitly terminated to freeze the trace; no
`hook-exit` was observed, so this is not called graceful shutdown.

`MSLLHOOKSTRUCT.pt` is physical screen pixels. The probe preserves source bounds
in Electron DIP, converts them with Electron 42.1.0
`screen.dipToScreenRect(source, source.getBounds())`, and uses only the converted
physical bounds for each event's hit test. Candidate/re-entry/up/commit evidence
retains the same point, inside result, DIP/physical bounds, display metadata, and
units snapshot. `injected:false` is solely this prototype's physical-evidence
threshold; it is **not** a product policy for remote-control or assistive input,
which needs a separate compatibility decision.

Windows multi-display/mixed-DPI, macOS, and Linux are **Unavailable**. V1 must
disable external detach on those platforms/configurations until each has accepted
event-level native evidence. It must never replace the required external release
with boundary crossing, `blur`, a timeout, a button, or a movement threshold.
That is an intentional V1 core-path limitation, not an alternate trigger.

The earlier `manual-injected-*` evidence remains in the prototype history: its
human-operated session had 3,739 mouse events and 43 ups all marked
`injected:true`, so it correctly failed closed. It is not used as the final
physical-release conclusion.

## Strategy comparison

| Strategy | Result |
| --- | --- |
| Renderer `mouseup`, pointer capture, or `blur` | Rejected: cannot observe a release outside the native window. |
| Electron main-process public window events | Rejected: no global event-level left-button-up. |
| `GetAsyncKeyState` + `GetCursorPos` polling | Rejected: release state and cursor coordinates are non-atomic and can misclassify the gesture. |
| Event-level native observer (`WH_MOUSE_LL` / platform equivalent) | Selected. Windows single-primary physical release is accepted. |
| V1 fallback where evidence is unavailable | Disable external detach; do not emulate it with another trigger. |

## Coverage matrix

| Coverage | Result |
| --- | --- |
| Windows single-primary actual cross-boundary physical left release | `Passed` |
| Boundary-only / timeout / blur behavior | `Passed`: none commits without eligible external up; G1/G5 timeout and G7 active blur are recorded. |
| Re-entry and inside release | `Passed`: G2 inside up does not detach; G3 re-arms on later exit then commits. |
| Escape cancellation | `Passed`: G6 cancels and its later trusted outside up is ignored with no active gesture. |
| Windows multi-display / mixed DPI | `Unavailable`: one 96-DPI display was available; conversion code is not coverage. |
| macOS / Linux | `Unavailable`: no host/native observer trace. |
| Independent high-risk review | `Completed` for this Windows single-primary evidence. |

## Evidence and reproduction

The throwaway probe and generated artifacts are in
[`prototypes/native-external-release-gesture`](../prototypes/native-external-release-gesture/README.md).

```powershell
node --check .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\main.cjs
node --check .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\summarize-physical-trace.cjs
node .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\verify-state-machine.cjs
node .scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\summarize-physical-trace.cjs 'E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08\.scratch\marktext-feature-development-2026-08\prototypes\native-external-release-gesture\evidence\manual-session.jsonl'
```

The raw capture is not committed and was deleted after hash verification. The
summarizer command therefore documents the historical generation/reproduction
flow, not a current out-of-the-box command: first complete a new manual capture
that recreates the same raw path, then run the summarizer against it.
