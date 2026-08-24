# T09 — Muya details preview engine and semantic round-trip

Wave: 2 · Risk/model: medium — `gpt-5.6-terra` / `medium` · Depends on: V1 Spec

## Result

Make raw-HTML `details` preview an intentional Muya presentation boundary while
preserving source editing, sanitization, `open`, disableHtml and export semantics.
It does not couple to desktop theme assets, menus or WorkspaceController.

Inputs: [V1 Spec](../v1-spec.md); [Issue 06](../../issues/06-research-current-html-details-behavior.md);
[Issue 07](../../issues/07-prototype-details-disclosure.md).

## Ownership and boundary

Own existing `packages/muya/src/block/commonMark/html/{index.ts,htmlPreview.ts,htmlContainer.ts}`,
`packages/muya/src/assets/styles/blockSyntax.css`, relevant config/sanitize/export
files identified by source inspection, and Muya unit/e2e tests. Do not edit desktop
renderer components/styles, export settings UI, menu/locales, or any workspace files.

Implement Minimal inline row in inactive sanitized preview only: native summary
semantics and focus, `</>` action outside summary, rebuild behavior, temporary
click state, `open` initial state, disableHtml escaped source and a strict editor-
only styling boundary. Add details-specific DOMPurify allow/deny and Markdown
round-trip assertions; never serialize transient disclosure state or source-edit
through double click.

## Acceptance and handoff

Run Muya unit tests and its existing browser E2E environment (including disable-html
and sanitization), plus typecheck/diff check. Verify `details`, `summary`, `open`,
unsafe attributes, source↔preview, Enter/Space and round-trip. Manual browser
check confirms native semantic tree/focus. Regression: generic html blocks,
sanitize and export. Commit only Muya source/tests. Independent review verifies
that active source mode and standard export markup remain intact.
