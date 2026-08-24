# T03 — Two-pane shell, divider, and in-window tab destinations

Wave: 3 · Risk/model: medium — `gpt-5.6-terra` / `medium` · Depends on: T01, T02

## Result

Render up to two independent pane/tab bars against WorkspaceProjection. Implement
accepted edge-band preview, reorder and pane moves, divider mechanics, collapse,
narrow disablement and motion. It does not create external windows or modify main
process transport.

Inputs: [V1 Spec](../v1-spec.md); [Issue 03](../../issues/03-prototype-tab-drag-destinations.md);
[Issue 05](../../issues/05-prototype-split-layout-and-motion.md).

## Ownership and boundary

Own existing `packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue`
and create pane/split presentation files beneath existing `components/editorWithTabs/`.
If needed, own styles colocated with those components and new E2E spec only named
`split-workspace.spec.ts`. Do not change `index.vue`, `editor.vue`, `store/editor.ts`,
context-menu files, main/preload, or existing E2E files.

Implement 31% bands, live prospective 50/50, commit on release, Escape/re-entry,
320px pane min, 720px no-split, divider drag/double-click reset, 180/0ms motion,
and automatic collapse. Do not import the prototype as production code.

## Acceptance and handoff

Run component/unit tests, `pnpm --filter marktext test:e2e -- split-workspace`,
typecheck and diff check. Manual: left/right candidate, cancel, narrow boundary,
reduced motion, per-pane active tabs and focus. Regression: existing tab reorder
and overflow behavior. Commit only owned UI/tests; independent reviewer checks
prototype constraints and no third-pane route.
