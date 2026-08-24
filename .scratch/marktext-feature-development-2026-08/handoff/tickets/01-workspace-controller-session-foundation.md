# T01 — WorkspaceController and session foundation

Wave: 1 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: V1 Spec

## Result

Create the deep, deterministic `WorkspaceController`, its typed command/result/
projection/EditorLease contract, production+memory `WorkspacePersistence`,
`DocumentIO`, `PaneEditorAdapter`, and pure `WorkspaceSessionCodec`. It must
enforce V1 window/pane/document invariants, immutable JSON projection, atomic
revision updates, V1 legacy migration, V2 validation and partial salvage. It does
not wire existing Vue editor/global store, filesystem observation, IPC, menus or
transfer.

Inputs: [V1 Spec](../v1-spec.md); [Issue 04](../../issues/04-design-pane-scoped-workspace-model.md);
[Issue 11](../../issues/11-design-workspace-controller-interface.md).

## Ownership and boundary

Create only new files below the existing `packages/desktop/src/renderer/src/`
and `packages/desktop/test/unit/` roots: `workspace/` (controller, types,
sessionCodec, adapters) and `test/unit/specs/workspace-*.spec.ts`. This ticket
must not edit existing `store/editor.ts`, `components/editorWithTabs/*`,
`src/main/*`, or `src/preload/*`; those belong to later tickets.

Implement exact controller surface and closed commands, lease atomicity, no
ambient-current-file access, serializable projection, session V1→V2 migration,
partial salvage, history-warning behavior, and memory adapters. Do not introduce
transfer transport or persist Muya/DOM/callback objects.

## Acceptance and handoff

Run `pnpm --filter marktext test:unit -- workspace` (or the precise Vitest file
invocation), `pnpm --filter marktext typecheck`, and `git diff --check`. Tests
cover two-pane/path uniqueness, move/collapse/last-tab, stale lease, capability
replay, atomic rejection, immutable projection, migration, corruption and history
salvage. Manual check: inspect a projection JSON round-trip.

Regression: existing unit suite. Commit only the new workspace module/tests.
Independent terra/high Standards and Spec reviews are required before T02/T05 use
the interface; reviewers verify the API is deep and no legacy global-state path is
added.
