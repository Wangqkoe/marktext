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

Create new `packages/desktop/src/main/nativeGesture/` and exact
`packages/desktop/test/unit/specs/native-gesture.spec.ts`; edit only the T06
transport registration seam if required. If a production native helper/module is
needed, this ticket may also own its isolated source/resource directory,
`packages/desktop/package.json`, the matching `pnpm-lock.yaml` entries, and
`packages/desktop/electron-builder.yml` only for declared packaged resources.
If no dependency/resource is needed, do not touch manifests. No renderer tab
implementation, transfer WAL, menu/locales or prototype files may change; never
copy the PowerShell/Add-Type prototype helper into production.

Implement trusted left-down session creation, native move/up/Escape input,
per-event DIP→physical hit-test snapshot, re-entry/re-arm, Escape cancel, endpoint
epoch validation and supported capability gate. Assert that the product never
filters on an injected flag: for the same trusted gesture session, an eligible
outside left-up commits for both remote/assistive flag values; inside-up, re-entry,
Escape and old epoch never commit. Enable only Windows single-primary proven shape;
mixed-DPI/multi-display/macOS/Linux must reject external detach while Move remains.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/native-gesture.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check. Windows manual physical smoke
records OS/Electron/display/scale, real cross-boundary release, inside-up, re-entry,
Escape, blur and timeout; real remote/assistive smoke may be `Unavailable`, but
both automatic flag cases and disablement fallback must be Passed. Commit only
owned adapter/package/resource/tests. Independent terra/high Standards + Spec
review verifies no crossing/blur/timeout bypass, helper signing/packaging, resource
cleanup, process exit, and fault-default-disable behavior.

## T07 local execution evidence — 2026-08-26

| Evidence | Status | Exact result / limitation |
| --- | --- | --- |
| Native adapter contract | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/native-gesture.spec.ts`; Windows Node/Vitest; 1 file / 8 passed. It covers both injected-flag values, inside-up, re-entry, Escape, crossing/blur/timeout, stale endpoint epoch, replacement session, unsupported capability, and hit-test failure. |
| T06/Move unit regression | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/native-gesture.spec.ts test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts`; 3 files / 18 passed. |
| Typecheck | Passed | `pnpm -C packages/desktop typecheck`; exit 0. |
| Scoped ESLint | Passed | Targeted T07 files exit 0; 9 existing Vue attribute-format warnings in `editorWithTabs/index.vue` and `pane.vue`, no errors. |
| Windows package smoke | Unavailable | `pnpm build:win:x64` completed locale minification, Electron rebuild (including `uiohook-napi`) and Electron-Vite bundle. `electron-builder` then remained in `searching for node modules` with no artifact or exit result and its controlled process tree was terminated. It is not a package pass. |
| Real physical smoke | Untested | Run the Windows 11 single-primary 2560×1440 / 96-DPI scenario: tab left-down, leave window and release; inside-up; re-entry then inside-up; Escape then outside-up; blur/timeout while held. Also record remote/assistive availability. |
