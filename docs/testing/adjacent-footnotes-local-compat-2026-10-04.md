# Adjacent footnote definitions: local compatibility validation (2026-10-04)

## Scope and source

This worktree started from `3704ac602c93ad3c1501bc3dcafd8dfb43cc2a5e` and ports only upstream commit `1e5cecde31800388d59ca071dfaa4f4515089e21` (`fix(muya): keep footnote definitions packed one per line as siblings (#5487)`). The source port is local commit `bd2f75a471f87e8822c8e7c45a540ead12e925a5` and retains the upstream origin through `cherry-pick -x`.

The port changes the footnote block terminator so a following column-0 definition becomes a sibling. It also keeps an extension-instance `inFootnoteBody` flag around the bound `lexer.blockTokens` call, with `try/finally`, so a four-space continuation cannot become a nested footnote. It retains the local per-call Marked instance, bound lexer, math delimiter options, and footnote option. Production changes are limited to `packages/muya/src/utils/marked/extensions/footnote.ts`.

The validation exposed one local compatibility boundary outside the upstream tests. With a body blank line before a four-space continuation, `[^2]: two` is de-indented to column 0 for the nested lexer. Marked's built-in ordinary reference-definition tokenizer then emitted a `def` token. State import/export already preserved that token as a literal paragraph, but both static and asynchronous HTML omitted the label and body. Local commit `dc5db924cd35c56be25449c03b14632435928b8f` suppresses only a footnote-shaped built-in `def` while `inFootnoteBody` is true. All other `def` calls return `false` to Marked's override chain, preserving top-level and nested ordinary `[ref]: URL` definitions. No new Lexer, global state, shared option, or production helper was added.

## Red-to-green evidence

Before the source change, this command was run twice from the worktree root:

```text
pnpm --filter @muyajs/core exec vitest run src/utils/marked/extensions/__tests__/footnote.spec.ts src/state/__tests__/markdownToState.spec.ts src/state/__tests__/footnoteHtml.spec.ts --maxWorkers=2
```

Both runs failed the same four assertions: adjacent definitions yielded only identifier `1`; the four-space continuation produced a child `footnote`; the state contained only one top-level definition; and static HTML lacked `fn-2`/`fn-3` while leaking nested `footnote-block` elements. The raw logs are `01-red-target.log` and `02-red-repeat.log` in the evidence directory below. After the upstream port, the same command passed 3 files and 63 tests (`03-green-target-upstream.log`).

The blank-line continuation probe used `a[^1]\n\n[^1]: intro\n\n    [^2]: two`. The original port produced `paragraph`, `space`, and built-in `def` children. Markdown state round-trip preserved `[^2]: two`, while static and asynchronous HTML reduced the note to `intro` and lost the literal continuation. Logs `04-blank-line-indented-probe.log`, `05-blank-line-boundary-tests.log`, and `06-async-html-boundary-red.log` capture that boundary. After the narrow `tokenizer.def` compatibility hook, the four target files passed 72 tests (`08-compat-final-target.log`).

The final regression coverage verifies:

- Adjacent column-0 definitions are three top-level sibling footnotes with identifiers `1`, `2`, and `3`, and bodies exactly `one`, `two`, and `three`.
- A four-space `[^2]: two` continuation stays literal body text and never becomes a child footnote, both with and without a preceding body blank line.
- `MarkdownToState -> ExportMarkdown -> MarkdownToState` preserves identifiers, bodies, and top-level structure. With `footnote: false`, the same syntax remains ordinary paragraphs.
- Static HTML and asynchronous `MarkdownToHtml` each emit three direct `section.footnotes > ol > li` items with the corresponding complete bodies and references, with no raw `div.footnote-block` leakage.
- An ordinary `[ref]: https://example.com` definition inside a footnote body still resolves a reference link, proving the compatibility hook does not disable Marked's general `def` rule.
- Electron enables the footnote preference before opening the adjacent-definition file, renders three non-nested definitions, edits and saves the actual file, closes normally, reopens the saved path with the same caller-owned isolated profile, and recovers the three complete definitions without renderer errors.

## Validation results

All commands below ran in `C:\Users\1407\.codex\worktrees\footnote-adjacent-definitions\Marktext`.

| Command | Result |
| --- | --- |
| `pnpm --filter @muyajs/core exec vitest run src/utils/marked/extensions/__tests__/footnote.spec.ts src/block/extra/footnote/__tests__/footnote.spec.ts src/clipboard/__tests__/copyFootnote.spec.ts src/state/__tests__/markdownToState.spec.ts src/state/__tests__/stateToMarkdown.spec.ts src/state/__tests__/footnoteHtml.spec.ts src/state/__tests__/footnoteExportHtml.spec.ts src/state/__tests__/renderToStaticHTML.spec.ts src/state/__tests__/mathTrailingSpace.spec.ts src/state/__tests__/gitlabMath.spec.ts src/state/__tests__/latexMathDelimiters.spec.ts --maxWorkers=2` | 11 files, 137 tests passed, exit 0 (`10-related-footnote-math-clipboard-state-green.log`). An earlier environment run passed the assertions but exited 1 on two unresolved Prism dynamic imports because `packages/muya/node_modules` was absent; `09-related-footnote-math-clipboard-state.log` is retained and was resolved with a worktree-only dependency junction. |
| `pnpm --filter @muyajs/core test` | 232 files, 1,632 tests passed, exit 0 (`12-core-full-test.log`). |
| `pnpm --filter @muyajs/core lint:types` | Exit 0 (`13-core-lint-types.log`). |
| `pnpm --filter @muyajs/core exec vitest run --config vitest.spec.config.ts --maxWorkers=2` | CommonMark, GFM, and runner checks passed with the existing expected-failure lists. Three unrelated `roundTrip.spec.ts` cases failed: common Links, common Lists, and GFM Tables identity (`14-core-test-spec.log`). A control run that temporarily restored only `footnote.ts` from baseline `3704ac60` reproduced the exact same three failures, 12 passed / 3 failed / exit 1, then restored the validated source in `finally` (`16-baseline-roundtrip-spec-control.log`). These are recorded as existing non-blocking failures. |
| Muya ESLint on the changed source/spec files; root ESLint on `packages/desktop/test/e2e/issue-5076-adjacent-footnotes.spec.ts` | Both exit 0. The root config prints its existing module-type performance warning (`17-target-eslint.log`). |
| `pnpm run typecheck` | Exit 0 (`15-root-typecheck.log`). |
| `pnpm run build` | Exit 0; main, preload, and renderer built from this worktree (`18-root-build.log`). The built renderer `packages/desktop/out/renderer/assets/index-CnelnVF-.js` has SHA-256 `27F18FC8EA24DB3CF08A9D77080024CBCE01E1CBD0DEA5E2EBFA1CCBBFF71E63`. `renderer-footnote-bundle-fingerprint.txt` shows the bundled sibling terminator, instance flag, `try/finally`, and narrow `def` hook. |
| `pnpm --filter marktext exec playwright test --config=test/e2e/playwright.config.ts test/e2e/issue-5076-adjacent-footnotes.spec.ts --workers=1` | 2/2 passed, exit 0 (`20-electron-adjacent-footnotes-e2e.log`). `electron-saved-adjacent-footnotes.md` is the actual saved file; `electron-reopen-evidence.json` records byte-identical reopened Markdown and the three identifier/body pairs. |

The full root desktop unit suite was not repeated. The production change is confined to the Muya parser extension, the complete Muya unit suite passed, root typecheck/build passed, and the affected desktop behavior was exercised through the real Electron path.

## Environment isolation and cleanup

The managed worktree initially had no `node_modules`. Verification used worktree-only junctions to the existing root, Muya, and desktop dependency trees; shared dependency contents and the lockfile were not modified. A temporary Muya Vite `server.fs.allow` entry admitted the existing dependency path. Temporary cache directories were redirected into `.adjacent-footnotes-vite-cache`. The Electron renderer build temporarily aliased `@muyajs/core` to this worktree's `packages/muya/src/index.ts`; the bundle fingerprint above proves that build consumed the new source. The exact temporary configurations and diff are retained as `temporary-*-config-final.ts` and `temporary-config-final.diff` in the evidence directory.

After validation, both tracked configurations were restored byte-for-byte to `HEAD`; the three worktree-only dependency junctions and task-owned Vite caches were removed, restoring the initial absence. The build output remains only under this worktree's ignored `packages/desktop/out` and was not copied into the main checkout. The E2E removed its temporary document/profile after copying evidence. `electron-processes-after.json` contains only pre-existing `document-zoom` Electron processes; zero Electron processes started during this test remained after it completed. No other session's process was terminated.

Evidence directory:

```text
E:\Program Files\Marktext-performance-evidence\2026-10-04-adjacent-footnotes
```

No browser download, dependency install, lockfile change, push, pull request, or main-worktree integration was performed.
