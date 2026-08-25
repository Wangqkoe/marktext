# T04b — DocumentIO Electron coordinator and adapter

Wave: 3 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T01, T04

## Result

Deliver the narrow production DocumentIO seam before the T02 production facade
migration: a deep main-process `DocumentIOCoordinator`, typed IPC/preload and a
renderer adapter. Production and deterministic in-memory adapters implement the
same `DocumentIoRequest` → `DocumentSaveAck` seam. T04b uses T04's
FileObservationHub/CAS core; it does not copy its state machine, add a second save
path, implement transfer, startup, CrashDraft, normal restore, or UI work.

Inputs: [V1 Spec](../v1-spec.md), [T01](01-workspace-runtime-no-restore.md),
[T04](04-file-observation-diskrevision-cas.md),
[Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md), and
[Issue 11](../../issues/11-design-workspace-controller-interface.md).

## Ownership and boundary

Create the main coordinator and focused tests beneath the existing desktop
workspace/filesystem paths. Own only DocumentIO-specific registrations and typed
declarations in the existing main IPC, preload, shared IPC-type, global-declaration
and renderer-workspace seams. Record the exact registration insertion point.
T06 runs only after this ticket integrates: it may add transfer/startup routes in
separate/narrow sections, but must preserve T04b's DocumentIO registrations and
types rather than redefining them.

The coordinator authenticates each request from the actual sender `webContents`
to its current window/session; payload window IDs are untrusted. It maps the
authenticated session/document/owner fence to T04 subscriptions and save authority.
The renderer has no FileObservationHub lease, canonical FileKey, DiskRevision,
CAS/overwrite capability, landed-byte hash, or watcher-generation access. It only
sends the typed request and consumes typed ACK/observation outcomes through the
existing DocumentIO port. Rebind, close, navigation, destroyed-window and adapter
dispose paths revoke/unsubscribe the mapped owner fence; old observers and ACKs
are inert.

Save, Save As, and rename use the repository's existing encoding, line-ending and
final-newline write behavior. The coordinator serializes through T04 and reports a
durable ACK only after the actual write/CAS result is known. An ACK changes the
Controller only when request identity, document revision, owner fence and current
binding still match. Conflicts remain a typed outcome, never a silent overwrite.
For failed Save As or rename, preserve the original document identity/path,
revision and observation binding; a successful rebind replaces the old binding
only after its required save/rename result is durable. Late ACKs and post-dispose
observer events must not revive or clean a stale document.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/document-io-coordinator.spec.ts test/unit/specs/document-io-electron-adapter.spec.ts`,
the T04 core tests, `pnpm -C packages/desktop typecheck`, and `git diff --check`.
The typed authenticated transport harness must exercise the real coordinator,
CAS/ACK identity and late-ACK rejection, Save As/rename failure rollback, and an
observer-driven dirty-peer conflict/rebind. It does not claim real two-window/UI
evidence; that remains T06/T11. Commit only the coordinator, narrow bridge and
their focused tests. Independent terra/high Standards + Spec review is required
before T02 production completion consumes the bridge.
