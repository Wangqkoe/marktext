# T04 — FileObservationHub, DiskRevision, and guarded saves

Wave: 2 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T01

## Result

Introduce a main-process FileObservationHub and DiskRevision/CAS save boundary
with deterministic memory adapters. This ticket establishes same-FileKey
serialization, watcher subscriber generations, stale-save protection and conflict
state. It is the sole owner of the FileObservationHub/DiskRevision/CAS core, but
does not complete the Electron renderer/session bridge, transfer ownership or UI
decisions. T04b is the narrow production coordinator/adapter that consumes this
core; it must not rewrite it.
It must not add normal workspace snapshot/load or use a normal session as file or
emergency-recovery truth.

T04 and T02b integrate only at an explicit seam. T04 solely defines/implements
the FileKey/DiskRevision transport types, DocumentIO/CAS port and ACK payloads;
T02b consumes them through WorkspaceCommand/port/result and never duplicates file
I/O, watcher or CAS logic. Acknowledgement is controller-gated by document
identity, document revision, FileKey/DiskRevision and ownership/generation fence.
T04 may proceed in parallel with T02b, but its production renderer connection is
not claimed until T02b's single-controller authority is integrated.

Inputs: [V1 Spec](../v1-spec.md), [Issue 09](../../issues/09-design-tab-transfer-ipc-contract.md),
[Issue 11](../../issues/11-design-workspace-controller-interface.md), and
[Issue 12](../../issues/12-define-startup-restore-emergency-recovery-boundary.md).

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
T04b consumes this canonical boundary for production DocumentIO. T06 consumes the
same boundary as the CrashDraft saved-document baseline and conflict fence; T04
neither stores nor recovers CrashDrafts.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/file-observation-hub.spec.ts test/unit/specs/disk-revision-cas.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check. Test concurrent same-file
saves, queued own-save event, late ACK, generation rejection and overwrite-token
replay. T04 has no real-window/manual claim: T04b owns the authenticated
Electron/renderer DocumentIO bridge, while T06/T11 own real dual-window
reload/conflict evidence.
Commit only owned main filesystem/tests. Independent terra/high Standards + Spec
review is a gate before T05/T06 consumption.
