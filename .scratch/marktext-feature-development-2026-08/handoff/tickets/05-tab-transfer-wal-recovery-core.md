# T05 — TabTransfer WAL, capsule, and recovery core

Wave: 3 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T01, T04

## Result

Build the deep, adapter-driven main-process TabTransfer module, durable capsule,
journal state machine and recovery owner. Its deterministic transport must prove
every phase, crash boundary and unique-owner invariant before Electron IPC exists.
It does not register production IPC/native inputs or render menu/UI.

Inputs: [V1 Spec](../v1-spec.md); [Issue 02](../../issues/02-define-cross-window-transfer-contract.md);
[Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md).

## Ownership and boundary

Create new `packages/desktop/src/main/tabTransfer/` and tests only under existing
`packages/desktop/test/unit/specs/` (for example `tab-transfer-*.spec.ts`). Do
not edit `main/ipc/*`, `main/windows/*`, `preload`, renderer, filesystem watcher,
menus or E2E tests. T04 supplies file observation boundary rather than being copied.

Implement `run(intent)`/`recover`, capsule schema+stream digest, sealed revision
fence, request/transfer idempotency, authenticated epoch capabilities, requested →
completed WAL, separate fsynced intent/observed, exact pre/post authorization rules,
15s/5s timeouts, session owner migration/recovery window record, tombstone/GC and
history/capsule corruption behavior. The memory TransferTransport must schedule
ACK loss, duplicate/reorder, kill/restart and late events deterministically.

## Acceptance and handoff

Run focused transfer tests plus `pnpm --filter marktext typecheck` and diff check.
The suite kills/restarts at each phase and between intent/command/ACK/observed;
checks source revision fence, history encoding/corruption, digest/tombstone,
journal-owner migration, recovered last tab and no duplicate ownership. Manual
check reviews a generated recovery projection. Commit only this module/tests.
Independent terra/high Standards + Spec reviews must pass before T06; failure means
no Electron wiring is integrated.
