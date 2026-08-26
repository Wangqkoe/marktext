# T09/T10 details integration evidence — 2026-08-25

## Scope and commits

- T09's original implementation was present on the old baseline. This round
  fixed the Preview/Escape active-content blocker that could re-enter source
  mode: `463c2c4ac58140fe0f50c7da9873fc9b956be193`.
- T10 was fast-forward integrated at local integration HEAD
  `344dbff17a894751dc61ddbf750c711d3b855beb`.
- Independent Standards Review: **Passed**, no blocking findings for T09 or T10.
- Independent Spec Review: **Passed**, no blocking findings for T09 or T10.

## Automated evidence

The following exact commands were run in the stated Windows local worktree
environments. Commands with a Passed status exited 0; no separate trace was
retained unless explicitly stated.

| Surface | Status | Exact command, environment, result, artifact/trace |
| --- | --- | --- |
| T09 target Vitest | Passed | `pnpm -C packages/muya exec vitest run src/block/commonMark/html/__tests__/detailsDisclosure.spec.ts src/state/__tests__/detailsRoundTrip.spec.ts src/state/__tests__/renderToStaticHTML.spec.ts`; Windows local worktree; 29 passed, console exit 0; no separate trace. |
| T09 typecheck | Passed | `pnpm -C packages/muya lint:types`; Windows local worktree; exit 0; no separate artifact. |
| T09 details/sanitize E2E | Passed | `Remove-Item Env:CI -ErrorAction SilentlyContinue`; set `NODE_OPTIONS=--dns-result-order=ipv4first`; `pnpm -C packages/muya/e2e exec playwright test tests/options/details-disclosure.spec.ts tests/security/details-sanitize.spec.ts --project=chromium`; Windows/Chromium; 9 passed, exit 0; no retained trace. |
| T09 generic E2E | Passed | Same Windows environment prefix (`Remove-Item Env:CI -ErrorAction SilentlyContinue`, `NODE_OPTIONS=--dns-result-order=ipv4first`); `pnpm -C packages/muya/e2e exec playwright test tests/options/disable-html.spec.ts tests/security/sanitize.spec.ts --project=chromium`; 7 passed, exit 0; no retained trace. |
| T09 scoped ESLint | Passed | `pnpm -C packages/muya exec eslint src/block/commonMark/html/index.ts src/block/commonMark/html/__tests__/detailsDisclosure.spec.ts`; Windows local worktree; exit 0; no separate artifact. |
| T09 full Muya lint | Failed | Full Muya lint ran with five baseline-existing errors in `paragraphContent/index.ts`, `latexMathDelimiters.spec.ts`, and `utils/marked/extensions/math.ts`; recorded nonblocking baseline issue, not attributed to T09. |
| T10 desktop build | Passed | `pnpm -C packages/desktop build`; Windows/Desktop; exit 0; build output is the command's transient artifact, no separate trace retained. |
| T10 details Electron E2E | Passed | `pnpm -C packages/desktop exec playwright test test/e2e/details-disclosure.spec.ts`; Windows/Electron; 7 passed, exit 0; no retained trace. |
| T10 export unit and HTML boundary | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/exportHtml.spec.ts`; Windows local worktree; 19 passed, exit 0; HTML temporary files are removed on the passing path, no long-term artifact; assertions cover standard `details`/`summary`/`open` markup and absence of editor-only control/token. |
| T10 typecheck | Passed | `pnpm -C packages/desktop typecheck`; Windows/Desktop; exit 0; no separate artifact. |
| T10 split E2E | Passed | `pnpm -C packages/desktop exec playwright test test/e2e/split-workspace.spec.ts`; Windows/Electron; 4 passed, exit 0; no retained trace. |
| T10 scoped ESLint | Untested | Review record says scoped ESLint had 0 errors, but the exact command evidence was not separately saved; no command is claimed. |
| Diff check | Passed | `git diff HEAD^ HEAD --check`; Windows local worktree; exit 0; no artifact beyond console result. |

Full Muya lint has five baseline-existing errors in
`paragraphContent/index.ts`, `latexMathDelimiters.spec.ts`, and
`utils/marked/extensions/math.ts`; these are record items and are not
attributed to T09.

## Export and manual boundary

Screen-reader spot check — **Untested**: no manual environment was executed;
fallback is T12 Windows manual acceptance. PDF visual inspection — **Untested**:
no manual environment was executed; fallback is T12 Windows manual acceptance.
A11/A12 are therefore not marked as fully manually complete.

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
