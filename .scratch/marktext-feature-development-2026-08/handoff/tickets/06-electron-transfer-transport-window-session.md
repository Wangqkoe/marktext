# T06 — Electron transport, windows, and session integration

Wave: 4 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T02, T03, T04, T05

## Result

Attach proven controller/transfer modules to Electron's authenticated endpoints,
window creation, hidden target staging, focus, session checkpoint/restore, and
preload contracts. Complete the production `WorkspacePersistence`/session and
remaining DocumentIO/Electron bridge behind T01 ports. It does not implement
native external-release capture, menus, or details UI.

Inputs: [V1 Spec](../v1-spec.md), [Issue 02](../../issues/02-define-cross-window-transfer-contract.md),
[Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md).

## Ownership and boundary

Own existing `packages/desktop/src/main/windows/editor.ts`, `main/app/windowManager.ts`,
`main/ipc/index.ts`, `main/ipc/window.ts`, `src/preload/index.ts`, `src/shared/types/ipc.ts`,
and `src/types/global.d.ts` only if bridge typing requires it; create production
main adapter files beneath `main/tabTransfer/`, renderer endpoint/assembly glue
under `renderer/src/workspace/`, and exact Electron test
`test/e2e/workspace-transfer-electron.spec.ts`. T06 runs after T02/T03 integrate,
so it may add only a narrow endpoint assembly file and may not overwrite their
controller/pane bindings. Do not alter filesystem core, tabs UI, menu/locales or
native observer. Renderer glue receives command/projection/endpoint messages only;
it must not know WAL, capsule or watcher-lease state.

Bind endpoint epoch to current webContents, reject old/reloaded/navigated/destroyed
senders and untrusted payload window IDs. Stage target hidden with no watcher;
create/recover windows only after journal records session owner. Apply context
geometry/focus, source-last-tab replacement, Open disk-copy behavior and session
partial salvage through the shared `WorkspaceSessionCodec`, never a renderer
import. A post-authorization operation keeps controller `execute` pending through
recovery/activation/focus/checkpoint and resolves only `applied`; recovery is an
internal journal state/projection warning, never a public result.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-session-recovery.spec.ts`, then `pnpm -C packages/desktop exec playwright test test/e2e/workspace-transfer-electron.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check. Simulate endpoint reload, forged window ID, late ACK,
restart at post-authorization and target creation failure. Manual Move/Open covers
saved/dirty/untitled/last tab, target focus and recovery warning. Regression:
window creation, existing file open/save/session E2E, and real two-window
observation reload/conflict behavior. Commit only listed files/tests.
Independent terra/high Standards + Spec review is mandatory before user-facing exposure.
