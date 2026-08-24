# T05 — TabTransfer WAL, capsule, and recovery core

Wave: 3 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T01, T04

## Result

Build the deep, adapter-driven main-process TabTransfer module, durable capsule,
journal state machine and recovery owner. Its deterministic transport must prove
every phase, crash boundary and unique-owner invariant before Electron IPC exists.
It provides the always-on EmergencyRecovery journal/store boundary for crash/power
loss and Move; it does not register production IPC/native inputs, normal workspace
restore, or menu/UI.

Inputs: [V1 Spec](../v1-spec.md); [Issue 02](../../issues/02-define-cross-window-transfer-contract.md);
[Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md).

## Ownership and boundary

Create new `packages/desktop/src/main/tabTransfer/`, exact unit tests
`packages/desktop/test/unit/specs/{tab-transfer-core,tab-transfer-recovery,tab-transfer-emergency-recovery}.spec.ts`,
and, if transfer IPC types are necessary, only new
`packages/desktop/src/shared/workspace/transfer.ts`. Main imports shared runtime
and emergency-transfer types from `src/shared/workspace/`, never renderer and
never a normal session codec. Do not edit `main/ipc/*`,
`main/windows/*`, preload, renderer, filesystem watcher, menus or E2E tests. T04
supplies the FileObservation boundary rather than being copied.

Implement `run(intent)`/`recover`, capsule schema+stream digest, sealed revision
fence, request/transfer idempotency, authenticated epoch capabilities, requested →
completed WAL, separate fsynced intent/observed, exact pre/post authorization rules,
15s/5s timeouts, emergency owner migration/recovery window record, tombstone/GC and
history/capsule corruption behavior. The memory TransferTransport must schedule
ACK loss, duplicate/reorder, kill/restart and late events deterministically.
`recovering` is internal TabTransfer/journal state and a projection warning only;
the controller has no fifth public result and its `execute` promise remains pending
until recovery completes and the final result is `applied`.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check.
The suite kills/restarts at each phase and between intent/command/ACK/observed;
checks source revision fence, history encoding/corruption, digest/tombstone,
journal-owner migration, recovered last tab and no duplicate ownership. It must
run regardless of explicit StartupIntent or default-off NormalWorkspaceRestore.
Manual
check reviews a generated recovery projection. Commit only this module/tests.
Independent terra/high Standards + Spec reviews must pass before T06; failure means
no Electron wiring is integrated.
