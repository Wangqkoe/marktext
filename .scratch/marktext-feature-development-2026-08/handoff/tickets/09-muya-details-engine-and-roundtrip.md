# T09 — Muya details preview engine and semantic round-trip

Wave: 2 · Risk/model: medium — `gpt-5.6-terra` / `medium` · Depends on: V1 Spec

## Result

Make raw-HTML `details` preview an intentional Muya presentation boundary while
preserving source editing, sanitization, `open`, disableHtml and export semantics.
It does not couple to desktop theme assets, menus or WorkspaceController.

Inputs: [V1 Spec](../v1-spec.md); [Issue 06](../../issues/06-research-current-html-details-behavior.md);
[Issue 07](../../issues/07-prototype-details-disclosure.md).

## Ownership and boundary

Own only the necessary subset of these already-inspected paths, with a pre-commit
ownership check: `packages/muya/src/block/commonMark/html/{index.ts,htmlPreview.ts,htmlContainer.ts}`,
`packages/muya/src/assets/styles/blockSyntax.css`, `packages/muya/src/config/index.ts`
(preview/export DOMPurify config), `packages/muya/src/utils/index.ts` (only if
`sanitize` behavior changes), `packages/muya/src/state/stateToMarkdown.ts`, and
the affected `packages/muya/src/state/{renderToStaticHTML.ts,markdownToHtml.ts}`
round-trip/export seams. Own exact tests
`src/block/commonMark/html/__tests__/detailsDisclosure.spec.ts`,
`src/state/__tests__/detailsRoundTrip.spec.ts`, and e2e
`packages/muya/e2e/tests/{options/details-disclosure,security/details-sanitize}.spec.ts`.
Do not edit desktop renderer components/styles, export settings UI, menu/locales,
or workspace files, and do not open additional ownership merely by re-inspection.

Implement Minimal inline row in inactive sanitized preview only: native summary
semantics and focus, `</>` action outside summary, rebuild behavior, temporary
click state, `open` initial state, disableHtml escaped source and a strict editor-
only styling boundary. Add details-specific DOMPurify allow/deny and Markdown
round-trip assertions; never serialize transient disclosure state or source-edit
through double click.

## Acceptance and handoff

Run `pnpm -C packages/muya exec vitest run src/block/commonMark/html/__tests__/detailsDisclosure.spec.ts src/state/__tests__/detailsRoundTrip.spec.ts src/state/__tests__/renderToStaticHTML.spec.ts`,
`pnpm -C packages/muya lint:types`, `pnpm -C packages/muya lint`, and
`pnpm -C packages/muya/e2e exec playwright test tests/options/details-disclosure.spec.ts tests/security/details-sanitize.spec.ts`.
Verify `details`, `summary`, `open`,
unsafe attributes, source↔preview, Enter/Space and round-trip. Manual browser
check confirms native semantic tree/focus. Regression: generic html blocks,
sanitize and export. Before commit verify `git diff --name-only` is only the
declared necessary subset and tests. Independent review verifies
that active source mode and standard export markup remain intact.
