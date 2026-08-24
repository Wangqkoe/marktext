# T02b — Workspace projection mirror & controller ownership

Status: required high-risk corrective implementation; T02 is an inherited
intermediate, not a merge candidate.

Wave: 2 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T01 and
the retained current T02 checkpoint `06577bb88b9784b62c9920febab7a5cb35dc2610`.

## Result

Make WorkspaceController the only runtime truth for document and view state, and
make the existing Pinia/editor store a one-way, readonly compatibility facade over
its WorkspaceProjection. This ticket inherits T02's stale lease/generation,
source-mode and WYSIWYG migration work; it is reviewed as the whole difference
from fixed integration baseline `28c66b200666e96a28ff0895cee72d96f1c1d272` to
the final T02b HEAD, never as T02 alone.

It blocks T03, T05, T06, T08 and T11 wherever those tickets consume real runtime
Document/View state. T04 may execute in parallel through the integration seam
below. T02b does not implement normal restore, Transfer WAL/recovery, production
file observation/CAS, or a second long-lived dual-write state.

## Normative architecture boundary

- WorkspaceController/DocumentRecord exclusively own Markdown, portable history,
  dirty/conflict state, canonical FileKey, save/encoding/line-ending and related
  document metadata.
- ViewRecord exclusively owns cursor, selection, scroll, mode, TOC, status/caret
  and required view-local UI state.
- WorkspaceProjection is a deeply frozen JSON-only shell/display representation
  with defensive copies. It MUST NOT project Markdown, history, Muya blocks/DOM,
  callbacks or leases.
- EditorBindingSnapshot is the controlled Controller-to-specific-editor-surface
  delivery of Markdown, portable history and bound View state. It is separate from
  WorkspaceProjection and cannot become a Pinia backchannel. Every snapshot
  carries `documentId`, `viewId`, the Controller-created opaque
  `EditorLease`/generation identity, `documentRevision`, and
  `workspaceRevision`. The adapter/surface atomically accepts it only while that
  full identity is still the Controller's current pane/view/binding. Rebind,
  pane-switch, and mode-handoff revoke the old generation; refresh staging and
  activation reject an old snapshot, which cannot change the editor, Pinia, or
  Controller after its successor is current.
- Pinia/editor store is projection-derived readonly compatibility only. It cannot
  write to the Controller; attempted store/component mutation is inert or rejected
  and cannot become a second truth.
- Legacy save, rename, encoding, line-ending, close and command paths use
  `WorkspaceCommand` → controller port → typed result, targeted to FocusedPane.
  T04's independent DocumentIO/CAS port returns ACK commands/results which apply
  only if document identity, revision, FileKey/DiskRevision and ownership fence
  are still current.
- Every pane composition receives the same Controller injection. A global bus is
  permitted only as a destructible legacy-fallback edge; T03's formal dual-pane
  mount MUST NOT use it.

## Ownership, integration seam and exclusions

T02b owns the necessary extensions to `packages/desktop/src/shared/workspace/`
types/index; renderer workspace controller, composition, adapter and projection
mirror; `renderer/src/store/editor.ts`; and the required consumers in tabs/index/
app/commands/search/sidebar/rename flows. It owns focused unit/E2E coverage for
those changes, including editor-source and WYSIWYG paths. It may change existing
T02-owned renderer files when necessary to remove the parallel truth.

T04 alone owns FileObservationHub, FileKey/DiskRevision transport implementation,
DocumentIO/CAS and watcher/save I/O. T02b consumes only its typed port and ACK
result; it neither forks these types nor implements watcher, hashing, serialization
or persistence. Establish the port/ACK shape before connecting the real adapter,
so separate worktrees do not duplicate I/O. T03 owns its presentation assembly
only after T02b releases the injection seam; T05/T06/T08/T11 take the real runtime
state only after T02b is integrated and independently reviewed.

## Required acceptance and cutover evidence

Run the following on the final T02b diff, with actual matrix statuses recorded:

1. `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts test/unit/specs/workspace-projection-mirror.spec.ts test/unit/specs/workspace-command-routing.spec.ts` proves Controller two-pane full-field reports, stale generation/lease rejection, deep-frozen projection with no Markdown/history leakage, one-way Controller→Pinia mirror, inert Pinia mutation, and FocusedPane save/rename/options/close revision/capability routing. It includes the asynchronous refresh race: while A refresh is delayed, B becomes current; A neither activates nor changes the editor, Pinia, or Controller, and B's lease/snapshot remain valid. Cover the same rejection across mode handoff and an old generation.
2. `pnpm -C packages/desktop exec playwright test test/e2e/tab-switch-cursor.spec.ts test/e2e/split-workspace.spec.ts test/e2e/audit-tabs-restart.spec.ts` proves two simultaneous source/WYSIWYG surfaces isolate cursor, selection, scroll, history, TOC and status, and confirms no-restore startup remains unchanged.
3. `pnpm -C packages/desktop typecheck`, `pnpm -C packages/desktop build`, `pnpm exec eslint packages/desktop/src/shared/workspace packages/desktop/src/renderer/src/workspace packages/desktop/src/renderer/src/store/editor.ts packages/desktop/src/renderer/src/components/editorWithTabs`, and `git diff --check` pass. Existing T02 editor-store/command/source/tab-switch regression coverage remains required.

Risks requiring independent terra/high Standards and Spec reviews are the broad
legacy Pinia consumer surface, components that directly mutate `IFileState`,
T02/T03 assembly handoff, T04 ACK seam, save/close data safety and multi-pane
global-bus leakage. Cut over in bounded stages: controller/snapshot authority,
then each readonly facade or command consumer, then shared-controller two-pane
mount, then deletion of each migrated fallback edge. Each completed stage can roll
back at its prior adapter boundary; no stage may leave an enduring dual-write or
dual-owner state.

## Handoff

Commit only the scoped renderer/shared code and tests when implementation is later
authorized. This contract revision itself does not authorize production or test
code changes. T02b must return its final local commit, baseline-to-final diff
review evidence, matrix results, remaining fallback edges, and the precise release
point for T03/T05/T06/T08/T11.
