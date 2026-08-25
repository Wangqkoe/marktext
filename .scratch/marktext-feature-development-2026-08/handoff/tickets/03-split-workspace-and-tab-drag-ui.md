# T03 — Two-pane shell, divider, and in-window tab destinations

Wave: after T02b · Risk/model: medium — `gpt-5.6-terra` / `medium` · Depends on: T01, T02b

## Result

Render up to two independent pane/tab bars against WorkspaceProjection. Implement
accepted edge-band preview, reorder and pane moves, divider mechanics, collapse,
narrow disablement and motion. It does not create external windows or modify main
process transport.

Inputs: [V1 Spec](../v1-spec.md); [Issue 03](../../issues/03-prototype-tab-drag-destinations.md);
[Issue 05](../../issues/05-prototype-split-layout-and-motion.md).

## Ownership and boundary

Own existing `packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue`
and `index.vue`, create pane/split presentation files beneath that existing
directory, and, only if needed to attach the two-pane root, own the narrow
`packages/desktop/src/renderer/src/pages/app.vue` assembly seam. Own colocated
styles and new `packages/desktop/test/e2e/split-workspace.spec.ts`. T02b must be
independently reviewed and integrated first; T03 owns the multi-pane mount that
a fixed single Tabs/Editor/SourceCode `index.vue` cannot provide.

T03 may make narrowly scoped edits to existing `editor.vue` and `sourceCode.vue`
only for pane-local active-document/tab inputs, composition mount seeding, and
focused-pane guards around existing editor-command ingress. `store/editor.ts`
remains forbidden unless a later, separately approved blocker proves it essential.
These edits must not add a second writable UI state: `editorStore` compatibility
fields remain the FocusedPane projection for legacy app chrome, while each
editor/tab bar derives its pane-local view from the shared Controller
projection/facade.

The same `WorkspaceController` is injected into both independently mounted
pane compositions, with independent pane active views. Split, drag/drop, pane
identity, activation, and mount routing must not use the global bus. Existing
app-wide editor command ingress may remain temporarily only when every mounted
editor synchronously ignores a command while its pane is not focused; do not
introduce new bus routes. The only typed Controller exception is the smallest
same-pane reorder command needed by this ticket, with focused runtime coverage;
it does not expand the Controller surface beyond that reorder seam.

Implement 31% bands, live prospective 50/50, commit on release, Escape/re-entry,
320px pane min, 720px no-split, divider drag/double-click reset, 180/0ms motion,
and automatic collapse. Pane/split/focus state is live-runtime only: ordinary
restart begins clean/default and does not restore it. Do not import the prototype
as production code.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec playwright test test/e2e/split-workspace.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check. The deterministic evidence
must mount two pane compositions against one Controller, show different active
documents at the same time, and prove a global editor command changes only the
FocusedPane. Manual: left/right candidate, cancel, narrow boundary, reduced
motion, per-pane active tabs and focus. Regression: existing tab reorder and
overflow behavior. Commit only owned UI/tests; independent reviewer checks
prototype constraints, no third-pane route, no second writable UI state, and
the focused-pane command guard.
