# T07 — Windows native external-release adapter and fallback

Wave: 5 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T06

## Result

Add the narrow production main-process adapter that permits external detach only
where event-level evidence exists. It commits strictly on the active session's
outside left-up and leaves all unsupported configurations disabled. It does not
replace TabTransfer, reimplement drag UI, or broaden the platform claim.

Inputs: [V1 Spec](../v1-spec.md), [Issue 03](../../issues/03-prototype-tab-drag-destinations.md),
[Issue 10](../../issues/10-prove-native-external-release-gesture.md).

## Ownership and boundary

Create new `packages/desktop/src/main/nativeGesture/` and its unit/integration
tests beneath `packages/desktop/test/unit/specs/`; edit only the T06 transport
registration seam if required. No renderer tab implementation, transfer WAL,
menu/locales or prototype files may change.

Implement trusted left-down session creation, native move/up/Escape input,
per-event DIP→physical hit-test snapshot, re-entry/re-arm, Escape cancel, endpoint
epoch validation and supported capability gate. Never filter remote/assistive input
using prototype injected flags. Enable only Windows single-primary proven shape;
mixed-DPI/multi-display/macOS/Linux must reject external detach while Move remains.

## Acceptance and handoff

Run adapter state tests, typecheck and diff check. Windows manual physical smoke
records OS/Electron/display/scale, real cross-boundary release, inside-up, re-entry,
Escape, blur and timeout; include remote/assistive compatibility check. The absent
platform matrix records `Unavailable` plus verified disablement. Commit only owned
adapter/tests. Independent terra/high Standards + Spec review verifies no crossing/
blur/timeout bypass and reviews native resource shutdown.
