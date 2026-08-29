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
If no dependency/resource is needed, do not touch manifests. Apart from the
minimal trusted-primary-press guard and native release-point handoff, no renderer
tab implementation, transfer WAL, menu/locales or prototype files may change;
never copy the PowerShell/Add-Type prototype helper into production.

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
records OS/Electron/display/scale and the actions that pass through the native
observer: real cross-boundary outside-up, inside-up, re-entry, and Escape.
`crossing`/`blur`/`timeout` alone never commit and are deterministic adapter-test
responsibilities; real remote/assistive smoke may be `Unavailable`, but both
automatic flag cases and disablement fallback must be Passed. Commit only
owned adapter/package/resource/tests. Independent terra/high Standards + Spec
review verifies no crossing/blur/timeout bypass, helper signing/packaging, resource
cleanup, process exit, and fault-default-disable behavior.

## T07 local execution evidence — 2026-08-26

| Evidence | Status | Exact result / limitation |
| --- | --- | --- |
| Native adapter contract | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/native-gesture.spec.ts`; expanded deterministic suite is included in the 5-file command below. It covers both injected-flag values, inside-up, re-entry, Escape, crossing/blur/timeout, stale endpoint epoch, replacement session, unsupported capability, hit-test failure, trusted-primary press gating, malformed IPC fail-closed before adapter begin, and work-area clamp. |
| T06/Move unit regression and release-point handoff | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/native-gesture.spec.ts test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts test/unit/specs/move-action-preflight.spec.ts`; 5 files / 50 passed. It asserts native release coordinates flow through Move intent and the initial T06 target seam. |
| Typecheck | Passed | `pnpm -C packages/desktop typecheck`; exit 0. |
| Scoped ESLint | Passed | Targeted T07/T06 seam files exit 0 with 34 baseline warnings (Vue attribute formatting and existing non-null assertions), no errors. |
| Desktop build | Passed | `pnpm -C packages/desktop build`; exit 0. Existing Vite dynamic-import chunk warnings only. |
| Windows package smoke | Passed | On integration `f8179476e449fd40d975300455594593fd065d3f`, a frozen-lockfile rerun and final `pnpm build:win:x64` reached `__BUILD_EXIT__=0`. The apparent `searching for node modules` stall was a long silent asar/ZIP/NSIS interval, not a dependency-scan failure. The ZIP contains `resources/app.asar.unpacked/node_modules/uiohook-napi/bin/win32-x64-146/uiohook-napi.node` (SHA-256 `99106A650B256E174941FA446A489F25C903C7BA24E20959322EEC5B0E4A2727`); an isolated unpacked-app smoke remained alive for 12 seconds, proving main-process module loading. |
| Real physical smoke | Passed | [T07 physical drag-out evidence](../evidence/t07-physical-drag-out-2026-08-29.md): Windows 11 single-primary 2560×1440 / 96-DPI physical outside-up, inside-up/reorder, re-entry, and Escape cancellation all passed. Blur/timeout remain automatic-contract coverage; remote/assistive, multi-display, and mixed-DPI remain unavailable/untested under fallback. |
