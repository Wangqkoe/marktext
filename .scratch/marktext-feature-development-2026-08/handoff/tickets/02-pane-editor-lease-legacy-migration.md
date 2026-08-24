# T02 — Pane editor bindings and legacy current-file migration

Wave: 2 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T01

## Result

Replace the single-editor ambient-state path with Pane-scoped bindings to T01.
Each live editor gets an EditorLease; tab switch/flush/report/selection/scroll/
mode handoff is pane-local, stale events are inert, and focused-pane routes
commands/status/TOC/title. This ticket does not render the split layout, implement
drag destinations, file CAS, or transfer.

This ticket supplies the production `PaneEditorAdapter` behind the T01 port while
moving legacy editor ownership; it does not claim production persistence or I/O.

Inputs: [V1 Spec](../v1-spec.md), [Issue 04](../../issues/04-design-pane-scoped-workspace-model.md),
[Issue 11](../../issues/11-design-workspace-controller-interface.md).

## Ownership and boundary

Own existing `packages/desktop/src/renderer/src/store/editor.ts`,
`components/editorWithTabs/editor.vue`, `sourceCode.vue`, `notifications.vue`,
`syntheticHistory.ts`, plus new adapter glue under the T01 `workspace/` directory
and focused unit tests. Do not edit `tabs.vue`, `editorWithTabs/index.vue`, tab
context menu, main, preload, or Muya source. Coordinate no overlapping writes.

The owned renderer glue may import `packages/desktop/src/shared/workspace/` but
must not move, fork or redefine its session/domain types or codec. T02 completes
and releases `editor.vue` before T03 mounts panes or T10 adds details integration.

Migrate callers from ambient `currentFile`/unscoped bus callbacks within these
files; retain compatibility only at bounded adapter edges until its callers move.
Do not layer a second global store or retain an old event that can mutate without a
lease.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-controller.spec.ts`,
`pnpm -C packages/desktop exec playwright test test/e2e/tab-switch-cursor.spec.ts test/e2e/audit-tabs-restart.spec.ts`,
and `pnpm -C packages/desktop typecheck`. Manually alternate source
and WYSIWYG editing in two logical panes and prove cursor/scroll/history do not
leak. Regression: editor-store, commands that consume its state, source mode and
tab recovery. Commit only owned renderer files/tests. Require independent
terra/high Standards + Spec review for shared-editor/persistence migration.
