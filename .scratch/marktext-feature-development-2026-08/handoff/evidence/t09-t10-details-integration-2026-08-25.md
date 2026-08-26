# T09/T10 details integration evidence — 2026-08-25

## Scope and commits

- T09's original implementation was present on the old baseline. This round
  fixed the Preview/Escape active-content blocker that could re-enter source
  mode: `463c2c4ac58140fe0f50c7da9873fc9b956be193`.
- T10 was fast-forward integrated at local integration HEAD
  `344dbff17a894751dc61ddbf750c711d3b855beb`.
- Independent Standards Review: **Passed**, no findings for T09 or T10.
- Independent Spec Review: **Passed**, no findings for T09 or T10.

## Automated evidence

The reported target selections and scoped checks passed in the Windows
Node/Vitest, Muya Playwright, and desktop Electron environments:

| Surface | Result |
| --- | --- |
| T09 target Vitest | 29 passed |
| T09 `lint:types` | Passed |
| T09 details/sanitize E2E | 9 passed |
| Generic disable-html/sanitize E2E | 7 passed |
| T09 scoped ESLint | Passed |
| Desktop build | Passed |
| T10 details Electron E2E | 7/7 passed |
| `exportHtml` unit | 19/19 passed |
| Desktop typecheck | Passed |
| Split E2E | 4/4 passed |
| T10 scoped ESLint | 0 errors |
| Diff check | Passed |

Full Muya lint has five baseline-existing errors in
`paragraphContent/index.ts`, `latexMathDelimiters.spec.ts`, and
`utils/marked/extensions/math.ts`; these are record items and are not
attributed to T09.

## Export and manual boundary

Automatic HTML export proves standard `details`/`summary`/`open` markup and no
editor-only control or token. This evidence does not claim PDF passed.
Screen-reader spot check and PDF visual inspection are unavailable/not yet
accepted; the automatic portions of A11/A12 pass, while their manual portions
remain pending for T12 or an available environment. A11/A12 are therefore not
marked as fully manually complete.

## Record items and baseline reproduction

- T10's `setHtmlEnabled` fixed 100ms delay may be flaky.
- Failed export assertions can leave HTML files under `%TEMP%`.
- Existing `editor.vue` has five template-formatting warnings; stylelint has no
  applicable configuration.
- On clean baseline `463c2c4`, `html-block-input.spec.ts` independently
  reproduced 1/2: `insideHtmlBlock` expected `true`, actual `false`. This is a
  baseline record item, not a T10 blocker.

T03 remains integrated; T05 remains active; T06 remains dependent on T05; and
T07/T08/T11/T12 do not advance solely from T10. The details automation surface
is complete, but the V1 destination is not complete.
