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

## Integration status — 2026-08-25

T10 is integrated at local integration HEAD
`344dbff17a894751dc61ddbf750c711d3b855beb`. Independent Standards and Spec
reviews both Passed with no blocking findings. Evidence is recorded in [the
T09/T10 integration report](../evidence/t09-t10-details-integration-2026-08-25.md).

Desktop build, details Electron E2E (7/7), `exportHtml` unit (19/19),
typecheck, split E2E (4/4), scoped ESLint (0 errors), and diff check passed.
HTML automatic export is verified as standard `details`/`summary`/`open` with
no editor-only control/token; PDF is not claimed passed. Screen-reader spot
check and PDF visual inspection are both `Untested`: no manual environment was
executed; fallback is T12 Windows manual acceptance. Record items are the fixed 100ms `setHtmlEnabled`
timing, `%TEMP%` HTML left by failed export assertions, five existing
`editor.vue` template-formatting warnings, no applicable stylelint config, and
the baseline `html-block-input.spec.ts` 1/2 reproduction on `463c2c4`.
