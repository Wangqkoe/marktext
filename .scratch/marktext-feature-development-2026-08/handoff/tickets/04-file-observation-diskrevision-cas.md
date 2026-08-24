# T04 — FileObservationHub, DiskRevision, and guarded saves

Wave: 2 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T01

## Result

Introduce a main-process FileObservationHub and DiskRevision/CAS save boundary
with deterministic memory adapters. This ticket establishes same-FileKey
serialization, watcher subscriber generations, stale-save protection and conflict
state; it does not transfer ownership or add UI decisions.

Inputs: [V1 Spec](../v1-spec.md), [Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md),
[Issue 11](../../issues/11-design-workspace-controller-interface.md).

## Ownership and boundary

Own existing `packages/desktop/src/main/filesystem/watcher.ts` and
`filesystem/markdown.ts`; create `packages/desktop/src/shared/workspace/fileObservation.ts`
only for cross-process FileKey/DiskRevision types, plus focused files below existing
`src/main/filesystem/` and exact tests `test/unit/specs/file-observation-hub.spec.ts`
and `disk-revision-cas.spec.ts`. Do not edit editor window, IPC/preload, renderer,
menu action, or TabTransfer paths.

Require canonical FileKey, persisted-byte SHA-256, one OS watcher per FileKey,
generation leases, writer-only own-event suppression, CAS expected revision,
serialized writes, and tokens bound to document revision/FileKey/observed revision/
purpose. Ensure a clean peer reloads, dirty peer conflicts and ordinary save blocks.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/file-observation-hub.spec.ts test/unit/specs/disk-revision-cas.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check. Test concurrent same-file
saves, queued own-save event, late ACK, generation rejection and overwrite-token
replay. T04 has no real-window/manual claim: T06/T11 own Electron/renderer bridge
and real dual-window reload/conflict evidence.
Commit only owned main filesystem/tests. Independent terra/high Standards + Spec
review is a gate before T05/T06 consumption.
