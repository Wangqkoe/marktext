# 验证原生窗口外释放手势

Type: `prototype`
Status: `open`
Blocked by: 03

## Question

Use a throwaway technical prototype to prove that a source-tab left-button drag can cross a `BrowserWindow` boundary and commit only on an actual external button release. Verify re-entry and Escape cancellation, and prove that boundary crossing, blur, and timeout do not detach. Record observable logs and results for Windows primary display, multi-display/DPI scenarios, and macOS/Linux as actual evidence or `Unavailable`. Compare safe main-process/native strategies without product implementation, then record the fallback decision.

## Comments

- High-risk gate: use `gpt-5.6-terra` at `high`; it must resolve before product implementation.
- No substitute is acceptable: a button, boundary-crossing trigger, blur, or timeout cannot replace the actual external left-button-release gesture.
