# T10 — Desktop details theme, interaction, and export integration

Wave: after T02b/T09 · Risk/model: medium — `gpt-5.6-terra` / `medium` · Depends on: T02b, T09

## Result

Integrate the Muya details presentation in MarkText's real Electron editor:
semantic theme tokens, hover/focus-visible affordances, 170ms/0ms motion and HTML/
PDF export boundary. It does not alter raw HTML parsing/sanitization or implement
workspace transfer.

Inputs: [V1 Spec](../v1-spec.md), [Issue 06](../../issues/06-research-current-html-details-behavior.md),
[Issue 07](../../issues/07-prototype-details-disclosure.md).

## Ownership and boundary

Own existing `packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue`
and `packages/desktop/src/renderer/src/assets/styles/index.css`, plus new
`packages/desktop/test/e2e/details-disclosure.spec.ts`. Do not
edit Muya, pane/store, menus/locales, main/preload or existing E2E files.

Wire styles without duplicating the Muya semantic contract; cover actual app theme
tokens, focus visibility, reduced motion and editor/source transition. Verify the
T09-owned HTML/PDF export still uses standard details markup and no editor-only styles.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec playwright test test/e2e/details-disclosure.spec.ts`,
`pnpm -C packages/desktop exec vitest run test/unit/specs/exportHtml.spec.ts`,
`pnpm -C packages/desktop typecheck`, and diff check. Electron manual: light/dark, mouse, Enter/Space,
focus-visible, source button/Escape/Preview, disableHtml, reduced motion, screen
reader spot check, HTML/PDF inspection. Regression: html-block input/export and
theme styles. Commit only listed desktop source/test files; independent reviewer
checks native semantics and export separation.
