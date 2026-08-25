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

## Completion and integration record — 2026-08-25

- Integrated locally at `1aa17aac6da3ef23610067b7f264bb38a835da4e`.
- Independent Standards Review: Passed. Independent Spec Review: Passed.
- Closed blocking findings: canonical-left collapse adapter/Vue-key ownership;
  split-pane minimum of 320px; and missing real Electron A03 evidence.
- Verification evidence: workspace runtime 42/42; DocumentIO/coordinator/routing
  17/17; split Electron 4/4; source/#781 9/9; tab history/caret/scroll 3/3;
  auto-focus/body/blank/overflow 4/4; `vue-tsc`, desktop build, diff-check,
  and changed-line lint passed. The integration worktree had no `node_modules`,
  so repeated commands were unavailable there; because integration was
  fast-forward-only to the same verified SHA, this is evidence inheritance and
  an environment limitation, not a code failure. `git diff --check` passed on
  the integration branch.
- Required Controller seam: `set-split-ratio` is V1 WindowWorkspace's
  Controller-owned seam. The “唯一 typed exception” wording is mildly
  ambiguous and is retained as a non-blocking record item; no behavior changes.

## Known record items (non-blocking)

- The broad legacy tabs history test uses `getMarkdownContent` to force repeated
  Source round-trips, which can perturb history; authoritative no-perturbation
  Item 252 passed.
- The close-saved zero-tab expectation conflicts with V1's all-empty clean New
  Tab rule.
- `workspace-runtime` has 39 existing formatting lint errors, there are 7
  baseline warnings, and the existing Vite dynamic-import warning remains.
- Focused wrappers in `tabs.vue` are a Duplicated Code judgment call.

These are recorded for follow-up and do not block T03 or require rework. T10 is
unblocked as the next direct dependent; T08 menu work (including Split Right),
T07 native detach, T05/T06, and later gates remain in their own frontier states.
