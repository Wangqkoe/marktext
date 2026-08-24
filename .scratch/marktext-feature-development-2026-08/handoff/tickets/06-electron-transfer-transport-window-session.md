# T06 — Electron transport, windows, and session integration

Wave: 4 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T02, T04, T05

## Result

Attach proven controller/transfer modules to Electron's authenticated endpoints,
window creation, hidden target staging, focus, session checkpoint/restore, and
preload contracts. It does not implement native external-release capture, menus,
or details UI.

Inputs: [V1 Spec](../v1-spec.md), [Issue 02](../../issues/02-define-cross-window-transfer-contract.md),
[Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md).

## Ownership and boundary

Own existing `packages/desktop/src/main/windows/editor.ts`, `main/app/windowManager.ts`,
`main/ipc/index.ts`, `main/ipc/window.ts`, `src/preload/index.ts`, `src/shared/types/ipc.ts`,
and new production adapter files beneath `main/tabTransfer/`. Own one new Electron
integration test file. Do not alter filesystem code, `renderer/store/editor.ts`,
tabs UI, menu/locales or native observer.

Bind endpoint epoch to current webContents, reject old/reloaded/navigated/destroyed
senders and untrusted payload window IDs. Stage target hidden with no watcher;
create/recover windows only after journal records session owner. Apply context
geometry/focus, source-last-tab replacement, Open disk-copy behavior and session
partial salvage through established contracts.

## Acceptance and handoff

Run T05 suite, Electron IPC integration test and `pnpm --filter marktext test:e2e -- transfer`,
then typecheck/diff check. Simulate endpoint reload, forged window ID, late ACK,
restart at post-authorization and target creation failure. Manual Move/Open covers
saved/dirty/untitled/last tab, target focus and recovery warning. Regression:
window creation, existing file open/save/session E2E. Commit only listed files/tests.
Independent terra/high Standards + Spec review is mandatory before user-facing exposure.
