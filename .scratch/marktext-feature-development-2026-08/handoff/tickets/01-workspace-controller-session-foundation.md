# T01 — WorkspaceController and session foundation

Wave: 1 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: V1 Spec

## Result

Create the deep, deterministic renderer `WorkspaceController`, its typed command/
result/projection/EditorLease contract, ports/interfaces for `WorkspacePersistence`,
`DocumentIO` and `PaneEditorAdapter`, deterministic memory adapters, and the pure
cross-process `WorkspaceSessionCodec`. It must
enforce V1 window/pane/document invariants, immutable JSON projection, atomic
revision updates, V1 legacy migration, V2 validation and partial salvage. It does
not wire existing Vue editor/global store, filesystem observation, IPC, menus or
transfer.

Inputs: [V1 Spec](../v1-spec.md); [Issue 04](../../issues/04-design-pane-scoped-workspace-model.md);
[Issue 11](../../issues/11-design-workspace-controller-interface.md).

## Ownership and boundary

Create `packages/desktop/src/shared/workspace/{types.ts,sessionCodec.ts,index.ts}`
for all cross-process domain/session types and the sole pure codec. Create renderer-
only `packages/desktop/src/renderer/src/workspace/` for controller, ports and
memory adapters,
and exact tests `packages/desktop/test/unit/specs/workspace-controller.spec.ts` and
`workspace-session-codec.spec.ts`. Main imports only `src/shared/workspace/`; it
must never import renderer. Do not edit existing `store/editor.ts`,
`components/editorWithTabs/*`, `src/main/*`, or `src/preload/*`.

Implement exact controller surface and closed commands, lease atomicity, no
ambient-current-file access, serializable projection, session V1→V2 migration,
partial salvage, history-warning behavior, and memory adapters. Do not introduce
transfer transport or persist Muya/DOM/callback objects. T02 owns the production
PaneEditorAdapter; T04 owns production file-observation/save work; T06 owns
production WorkspacePersistence/session/Electron and remaining DocumentIO bridge.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-controller.spec.ts test/unit/specs/workspace-session-codec.spec.ts`,
`pnpm -C packages/desktop typecheck`, and `git diff --check`. Tests
cover two-pane/path uniqueness, move/collapse/last-tab, stale lease, capability
replay, atomic rejection, immutable projection, migration, corruption and history
salvage. Manual check: inspect a projection JSON round-trip.

Regression: existing unit suite. Commit only the new workspace module/tests.
Independent terra/high Standards and Spec reviews are required before T02/T05 use
the interface; reviewers verify the API is deep and no legacy global-state path is
added.
