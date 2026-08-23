# Current raw-HTML `details` behavior

Research ticket: [复现并界定 HTML details 当前行为](../issues/06-research-current-html-details-behavior.md)
Scope: current source at `28d431715cbdcafeceb6970ac4113b6dd5ac2562`; no product changes made.

## Method and evidence status

| Area | Status | Evidence |
| --- | --- | --- |
| Raw-HTML parsing, preview/source mode, sanitization, serialization and export path | Passed (source inspection) | The cited first-party source below. |
| Existing browser regression harness | Unavailable | `pnpm --filter muya-e2e exec playwright test tests/options/disable-html.spec.ts --project=chromium` could not start before dependencies were installed because `pnpm` resolved the system Python Playwright (`error: unknown command 'test'`). A clean `pnpm install --frozen-lockfile` was started only to prepare the existing harness, but Windows file-linking did not finish in the research window and the helper was stopped; no test result is claimed. |
| `<details>` mouse, keyboard and computed-style observation in a real browser | Untested | No existing details-focused test exists (`rg -n "details|summary" packages/muya/src packages/muya/e2e` only finds the parser allow-list), and the local harness was not yet available. Do not treat browser-native behavior below as a completed MarkText UI test. |
| Electron desktop UI | Unavailable | The worktree has no ready desktop build/runtime; this ticket did not create or change one. |
| Light/dark visual appearance | Untested | No details-specific editor CSS was found, and no browser computed-style run was available. |

## Established behavior

### Recognition and round-trip

- **Raw block classification: Passed (source).** `details` and `summary` are block-type tags in [`packages/muya/src/config/index.ts:232`](../../../packages/muya/src/config/index.ts:232) and [`packages/muya/src/config/index.ts:272`](../../../packages/muya/src/config/index.ts:272). The Markdown token path creates an `html-block` for HTML tokens other than a sole `<img>` at [`packages/muya/src/state/markdownToState.ts:335-352`](../../../packages/muya/src/state/markdownToState.ts:335).
- **Markdown round-trip: Passed (source).** The `html-block` serializer writes every stored source line unchanged, plus a newline, at [`packages/muya/src/state/stateToMarkdown.ts:390-399`](../../../packages/muya/src/state/stateToMarkdown.ts:390). Thus the `open` attribute and the original `<details>/<summary>` markup are model data rather than a derived UI state. Exact byte-for-byte output has not been browser-tested here; the serializer may normalize the final newline.

### Inactive preview versus source editing

- **Inactive preview: Passed (source).** An `html-block` creates both `HTMLPreview` and an editable code container at [`packages/muya/src/block/commonMark/html/index.ts:10-24`](../../../packages/muya/src/block/commonMark/html/index.ts:10). The preview sanitizes the source and assigns it to `innerHTML` at [`htmlPreview.ts:55-81`](../../../packages/muya/src/block/commonMark/html/htmlPreview.ts:55), so a surviving `<details>` is a real browser `HTMLDetailsElement`, not a MarkText disclosure component.
- **Source editing: Passed (source).** The source is a `pre.mu-html-container` containing a markup code block at [`htmlContainer.ts:17-35`](../../../packages/muya/src/block/commonMark/html/htmlContainer.ts:17). CSS hides that source container when inactive and hides the preview while `.mu-active` is present at [`blockSyntax.css:686-724`](../../../packages/muya/src/assets/styles/blockSyntax.css:686) and [`blockSyntax.css:764-766`](../../../packages/muya/src/assets/styles/blockSyntax.css:764). Editing therefore exposes source rather than an in-place editable disclosure.
- **Mode transition limitation: Untested.** This research did not run a browser sequence that clicks the summary, focuses/activates the enclosing raw-HTML block, then returns it inactive. The proposed requirement that the click state is transient is compatible with the present model, but is not a verified current behavior.

### `open`, mouse, keyboard, theme and motion

- **Initial state: Passed (source); browser result Untested.** The preview insertion does not add, remove, or rewrite `open` (`htmlPreview.ts:55-81` above). Therefore the initial open/closed state is owned by standard HTML semantics: presence of `open` should start expanded and absence should start collapsed. This has not been observed in the project harness, so it is not marked as a completed UI test.
- **Mouse and keyboard: MarkText-specific handling not found; actual behavior Untested.** A repository search found no `details`/`summary` handling in Muya editor, block, or UI code. `HTMLPreview` itself registers no listeners; it only sets `contenteditable: false` and assigns DOM (`htmlPreview.ts:40-81`). Hence any disclosure toggle in inactive preview is expected to be browser-native. Whether the editor's outer event delegation prevents a real click, and whether Space/Enter works while focus is in the preview, require the mandated browser prototype/test.
- **Triangle marker and animation: browser-native / no MarkText styling found.** The editor stylesheet has only generic html-block layout, source/preview switching, and hover background (`blockSyntax.css:686-777`); it contains no `details`, `summary`, `::marker`, `::-webkit-details-marker`, transition, or reduced-motion rule. The default triangle, focus treatment, and open/close motion are consequently browser/UA behavior today, not a designed MarkText visual. This conclusion is source-backed; light and dark rendering remain Untested.

### `disableHtml` and sanitization

- **`disableHtml: false`: Passed (source and existing e2e coverage).** It is false by default in [`packages/muya/src/config/index.ts:315`](../../../packages/muya/src/config/index.ts:315). `HTMLPreview.update` calls `sanitize(html, PREVIEW_DOMPURIFY_CONFIG, disableHtml)` then assigns the sanitized result to `innerHTML` ([`htmlPreview.ts:55-81`](../../../packages/muya/src/block/commonMark/html/htmlPreview.ts:55)). Existing e2e coverage proves this for a generic nested `<div>`, not `<details>`, in [`packages/muya/e2e/tests/options/disable-html.spec.ts:52-71`](../../../packages/muya/e2e/tests/options/disable-html.spec.ts:52).
- **`disableHtml: true`: Passed (source and existing e2e coverage).** `sanitize` first HTML-escapes the block source when the flag is true at [`packages/muya/src/utils/index.ts:199-204`](../../../packages/muya/src/utils/index.ts:199). The html block also gains `mu-disable-html-render` ([`html/index.ts:37-40`](../../../packages/muya/src/block/commonMark/html/index.ts:37)), and CSS keeps its source visible and preview hidden ([`blockSyntax.css:701-724`](../../../packages/muya/src/assets/styles/blockSyntax.css:701), [`:764-766`](../../../packages/muya/src/assets/styles/blockSyntax.css:764)). Existing browser e2e confirms the generic escaped-source behavior at [`disable-html.spec.ts:20-50`](../../../packages/muya/e2e/tests/options/disable-html.spec.ts:20). For `<details>`, it follows that no native disclosure is mounted; direct DOM verification remains Untested.
- **Sanitization: Passed (source; details-specific payload Untested).** Both preview and export use DOMPurify with the HTML profile ([`config/index.ts:413-444`](../../../packages/muya/src/config/index.ts:413)); preview forbids `contenteditable`, disables data attributes, and export does the same while adding `data-align`. Existing e2e proves scripts, `javascript:` links and event attributes are removed for generic HTML blocks at [`packages/muya/e2e/tests/security/sanitize.spec.ts:28-100`](../../../packages/muya/e2e/tests/security/sanitize.spec.ts:28). No special allow/deny rule for `details`, `summary`, or `open` is present in project code; a specific DOMPurify test is still required before relying on all of those attributes cross-version.

### HTML/static export

- **Styled HTML export: Passed (source).** `MarkdownToHtml.renderHtml` uses Marked then `sanitize(..., EXPORT_DOMPURIFY_CONFIG, false)` before placing it in the export container at [`packages/muya/src/state/markdownToHtml.ts:183-213`](../../../packages/muya/src/state/markdownToHtml.ts:183). It wraps the result in `<article class="markdown-body">` at [`markdownToHtml.ts:256-259`](../../../packages/muya/src/state/markdownToHtml.ts:256), then `generate()` emits a full HTML document with GitHub Markdown CSS and `exportStyle.css` at [`markdownToHtml.ts:277-303`](../../../packages/muya/src/state/markdownToHtml.ts:277).
- **Export disclosure appearance: Untested but bounded.** `exportStyle.css` has no `details` or `summary` selector ([`packages/muya/src/assets/styles/exportStyle.css`](../../../packages/muya/src/assets/styles/exportStyle.css)); the generated export relies on browser defaults and whichever GitHub Markdown CSS rules apply. The user requirement's custom triangle and transition therefore cannot be assumed to appear in current static HTML/PDF export.

## Ownership summary

| Concern | Current owner |
| --- | --- |
| Recognition as raw HTML, source editing, active/inactive switching, `disableHtml`, DOMPurify entry point | MarkText / Muya |
| Parsed `details` element, open property, default marker, normal toggle interaction | Browser, after MarkText has inserted sanitized HTML |
| Custom triangle, disclosure animation, reduced-motion, dark-theme visual design, stable keyboard contract | Nobody yet; V1 prototype and implementation must define these |

## Implications for the accepted V1

The accepted “standard raw HTML block, interactive preview, source editing remains HTML source, `open` determines initial state and clicks do not rewrite Markdown” scope is compatible with the current data path. It is not an enhancement of an existing MarkText disclosure widget: implementation must add an explicit presentation/event contract and tests around a browser-native element, especially for active-block entry, keyboard focus, theme tokens, and exported CSS.
