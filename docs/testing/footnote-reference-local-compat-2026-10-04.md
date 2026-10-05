# Footnote references: local compatibility validation (2026-10-04)

## Scope and source

This worktree started from local integration baseline `98ab6ce39b5b8e98ae333acb5cc2d70605fa8491`. It ports upstream commits `9cfe38f1f6a51c9c5ca1f86ca894e0a57f0b5ce0` (#5491) and `96e368b41d3f3ee1f93f47a03938b9ae790f3075` (#5492) in order. The corresponding local `cherry-pick -x` commits are `db430fe220d8bae177cb88a8ca4a454f9282fd63` and `e702cc0620603d36af80630b99f3b73ffa51df6e`.

The first port tokenizes inline footnote references while Markdown escapes and code boundaries are still visible. `transformFootnotes` numbers only the resulting markers, restores orphan and nested-body markers to literal `[^id]` text, and preserves entity-escaped identifiers. The second port gives repeated references unique `fnref-N`, `fnref-N-2`, and `fnref-N-3` anchors and emits one matching backref per occurrence. The live editor's existing `noteref-{identifier}` DOM and click behavior are unchanged.

The port retains the local per-call `Marked` instances, column-0 sibling-definition terminator, bound lexer, `inFootnoteBody` `try/finally`, narrow nested `def` protection, math/LaTeX/GitLab options, `footnote: false`, and transform-before-sanitize order. The two upstream production files are `packages/muya/src/utils/marked/extensions/footnote.ts` and `packages/muya/src/state/transformFootnotes.ts`.

Review found one blocking local compatibility issue in the HTML clipboard seam. The new inline renderer emitted an empty marker, while `getClipBoardHtml` deliberately preserves `footnote-block` instead of running the export transform. COPY_AS_RICH and COPY_AS_HTML therefore lost visible `[^id]` text. Local commits `0edd8488e2c90ceff0a970cbdc00c4820ee38f1c` and `4a7008a965a4da13f5fbaf8450b45b343e9ca0de` restore only inline markers to entity-safe literal text and explicitly keep Marked parsing synchronous. They do not call `transformFootnotes`, lift definitions, or alter ordinary links, math, NORMAL copy, or COPY_AS_MARKDOWN.

## Red-to-green evidence

The #5491 static test first failed because Markdown `foo \\[^1]` produced a numbered `<sup>` and a footnotes section instead of literal `[^1]`. The exact target command then passed 12/12 after `db430fe2` (`01-red-5491-footnote-html.log`, `02-green-5491-footnote-html.log`). Code spans and note-body references stayed literal.

The #5492 static test first observed three duplicate `fnref-1` ids. After `e702cc06`, the same target passed 14/14 with ids `fnref-1`, `fnref-1-2`, `fnref-1-3` and backrefs to the corresponding occurrence (`03-red-5492-repeated-references.log`, `04-green-5492-repeated-references.log`). The single-reference arrow remains `↩`.

The clipboard regression was independently reproduced at both public HTML seams. `copyFootnote.spec.ts` initially had four failures: raw rich-copy HTML and sanitized copy-as-HTML each lost ordinary reference text and leaked the special-identifier marker. The minimal compatibility change made the same six tests pass (`09-red-clipboard-footnote-markers.log`, `10-green-clipboard-footnote-markers.log`, `21-clipboard-target-after-sync-fix.log`). Existing `footnote-block` content, escaped references, code literals, and special orphan identifier escaping are asserted.

The retained regression coverage also verifies:

- True asynchronous `MarkdownToHtml.renderHtml()` preserves escaped, inline-code, fenced-code, and note-body literals; keeps math rendering enabled; generates three unique anchors and three one-to-one backrefs; and leaks no intermediate marker or `data-identifier`.
- `footnote: false` retains Marked's ordinary reference-link behavior without footnote markup. An orphan identifier containing `<img>` is restored as encoded text and cannot become an element.
- Markdown -> state -> Markdown -> state preserves the original backslash, three repeated references, inline/fenced code text, definition body, and state structure.
- The earlier adjacent-definition and four-space continuation regressions remain in their existing suites and were not removed.

## Validation results

All commands ran in `C:\Users\1407\.codex\worktrees\footnote-adjacent-definitions\Marktext`. Raw command, cwd, output, and exit status are in `E:\Program Files\Marktext-performance-evidence\2026-10-04-footnote-reference-fixes`.

| Check | Result |
| --- | --- |
| Static #5491 red/green | Stable 1/12 failure before the port; 12/12 passed after it. |
| Static #5492 red/green | Stable 1/14 failure before the port; 14/14 passed after it. |
| Async export + state round-trip | 2 files, 42 tests passed, exit 0 (`05c-green-async-export-state-roundtrip.log`). The preceding `05` log is the expected dependency-junction `server.fs.allow` environment error, not a product red. |
| Related footnote/math/clipboard/state suites | 11 files, 136 tests passed, exit 0 (`14-related-footnote-math-clipboard-state.log`). |
| Final complete Muya unit suite | 233 files, 1,646 tests passed, exit 0 after the final source change (`24-final-full-muya-unit.log`). |
| `pnpm --filter @muyajs/core lint:types` | Exit 0 after the explicit synchronous parse correction (`20-core-lint-types-after-sync-fix.log`). |
| Muya ESLint on every changed source/spec | Exit 0 (`17-core-eslint-changed.log`). |
| Root ESLint on the new desktop E2E | Exit 0 with two non-blocking `no-non-null-assertion` warnings (`18-desktop-e2e-eslint.log`). |
| `pnpm typecheck` | Exit 0 (`19-root-typecheck.log`). |
| CommonMark/GFM/spec runner | 1,344 passed and three existing `roundTrip.spec.ts` failures: common Links, common Lists, and GFM Tables (`22-commonmark-gfm-spec.log`). The suite sets `footnote: false`; the exact same three failures are recorded by fixed baseline control `E:\Program Files\Marktext-performance-evidence\2026-10-04-adjacent-footnotes\16-baseline-roundtrip-spec-control.log`, SHA-256 `9944F0C01C75780E6BB33397852D910C46247AC63D9D03B9426F4E0BDDAD75D9`. No spec or skip was changed. |
| Final desktop build with local core alias | Exit 0 from source HEAD `6768ba51b67b51cd7e9cb0b6df3c6c9b8fcf18f3` (`26-final-head-desktop-build-own-core.log`). The renderer `index-ChWko42c.js` SHA-256 is `4F1269D001062755DD61D1A796356C253082849C19781CEF8E6FB2EEC85324EB`; it contains the inline marker, occurrence backref, and document zoom fingerprints. The main bundle SHA-256 is `CA056526138870E6607A5ABC15413B8C5A288D02D0178B907BE4A795092E032B`. |
| Real Electron persistence/export | 1/1 passed against the final-head bundle, exit 0 (`27-final-head-electron-footnote-reference-e2e.log`). |

The Electron test used a caller-owned isolated profile. It opened a probe, enabled footnotes, confirmed the probe rendered, then opened the actual file containing one escaped reference, three real occurrences, inline and fenced code literals, and a complete definition. It performed a real edit and save, read the disk bytes, closed normally, reopened the same path with the same profile, and proved reopened Markdown and disk content equal the saved content. The saved Markdown SHA-256 is `8DE2AB06ADBED2FBF5DCD55D2B4401A7DB93B545D61BFD6776088A59201603EA`.

The same run exported actual styled HTML through the desktop export dialog. The exported file has SHA-256 `D23B8C127040EB2A343D6DD5056DF0C6FAC60E9DEFB1EA4695897A4D60463111` and contains the escaped/code literals, three unique anchors, three matching backrefs, one definition item, and no intermediate marker. Renderer-error checks passed before and after reopen. The two Playwright-owned Electron processes, PIDs 61472 and 7336, both exited normally with code 0; no process inventory or unrelated process termination was used.

## Isolation, cleanup, and remaining integration

The managed worktree initially had no root, Muya, legacy Muyajs, or desktop `node_modules`. Verification used worktree-only junctions to the existing dependency trees and never installed, rebuilt, or modified shared dependencies. Temporary Vitest/Vite caches lived under this worktree's `.scratch`; temporary configs contained the only `server.fs.allow` and `@muyajs/core` source alias. The first desktop build predated the clipboard review, and the second captured the functional compatibility fix before its explicit synchronous parse correction. The final-head build was therefore repeated after all production changes. Earlier logs are retained, and only build `26` was used for the final Electron run.

The E2E removed its temporary document and profile after copying the saved Markdown, exported HTML, and reopen/process evidence to the external evidence directory. The dependency junctions, temporary configs, and task-owned caches are removed before handoff, restoring their initial absence. Ignored desktop `out` remains inside this managed worktree as the validated build artifact and is not copied to the primary checkout.

This worktree does not integrate the commits into the primary branch, package a release, run the root full desktop unit suite, install an application, modify package versions or lockfiles, push, or open a pull request. Primary-worktree integration and packaging remain separate follow-up stages; their gates must be reported separately from this worktree validation.
