# Fix record: `issue-5344` placeholder lost across a source-mode round trip

## Scope

- Follows Finding 1 of `06-automation-e2e-intermittent-clean-serial.md` (on branch `test/e2e-image-hash-split-scroll-timing`): a `loading-<id>` placeholder written by the image tool is never replaced when the document is rebuilt while `imageAction` is still copying.
- Worktree `E:/mt-wt/issue-5344`, branch `fix/issue-5344-image-placeholder` from `main` `5ad56548`. First change committed as `824d966e`; the follow-up for the residual window is recorded at the end of this file. Not pushed, not merged.
- Date: 2026-10-22, Windows 11 Pro 10.0.26200, Electron 42.1.0, background-window e2e mode.

## Root cause

- `ImageEditTool._replaceImageWithUpload` writes the placeholder into `this._block`, awaits `imageAction`, then finds the placeholder span in the current DOM but calls `replaceImage` on the **captured** `this._block`.
- Leaving source mode rebuilds the block tree (`replaceContent`). The captured block is then detached, and `replaceImage` on it either does nothing or throws (`Cannot destructure property 'path' of 'this.parent' as it is null`, seen in the unit test). The rebuilt document keeps `![loading-<id>](<source path>)`.

## Change

- `packages/muya/src/ui/imageEditTool/index.ts`: after `imageAction` resolves, resolve the block from the placeholder span (`getBlock(findContentDOM(imageWrapper))`) and replace the image there. This also covers the tool being reopened on another image while the first action is pending, since `this._block` is overwritten then. Same approach as `persistDroppedImage` in `editor/dragDropImage.ts`.
- New unit test `src/ui/imageEditTool/__tests__/imageEditToolUpload.spec.ts`: boots muya, opens the tool on an image, starts an upload with a held `imageAction`, rebuilds the document with `setContent(getMarkdown())`, then resolves. Before the fix: fails with the `this.parent` error. After: `first![](assets/hash.png)`.

## Verification

| Check | Result |
| --- | --- |
| new unit test before / after the fix | fail / pass |
| muya unit tests (all) | 2372 passed, 276 files |
| muya eslint on `src/ui/imageEditTool`, `tsc --noEmit` | pass |
| scratch e2e: `issue-5344` with `mt::fs::copy-with-content-hash` delayed 1500 ms, `main` build | 0/3 passed, every run left `img "loadingmu4"` |
| same scratch e2e, fixed build | 3/3 passed |
| `issue-5344-image-content-hash.spec.ts` on `main` build, `--repeat-each` 10 + 20 | 29/30 passed; 1 failure of mode B |
| same spec, fixed build, 10 + 20 | 27/30 passed; 2 failures of mode B, 1 of mode A |

- The scratch e2e is a copy of the spec with the main-process handler wrapped from `app.evaluate`; it is kept at the session scratchpad (`zz-scratch-5344-delayed-copy.spec.ts`) and was not added to the repository.
- Failure modes in the plain spec:
  - **Mode B** (both builds): the second insert never writes a placeholder. The snapshot shows `second` plus an empty `![]()` ("Click to add an image") and an open quick-insert menu, so `Enter` in the image tool's src input did not reach the tool. Unrelated to this change, which only touches code after `imageAction` resolves.
  - **Mode A** (1 of 30, fixed build only): `img "loadingmu7"` left after the second insert. This is the residual window below.

## Residual window (as of `824d966e`; see the follow-up below)

- `sourceCode.vue` applies new `markdown` to CodeMirror only while the composition scope mode is already `source`, and leaving source mode hands the CodeMirror text back through an async `handoffMode('wysiwyg')` before `replaceContent`.
- If the copy completes during either handoff, muya replaces the placeholder in its own tree, CodeMirror still holds the placeholder text, and the following `replaceContent` brings the placeholder back. Inference from code; the spec's own polling toggles source mode on every poll, so it can hit this.
- A complete fix needs one of these (decision needed):
  1. muya remembers resolved placeholders (`loading-id` → final src) and re-applies them after `replaceContent`/`setContent` when the id reappears;
  2. the desktop source-mode handoff carries engine changes made during the handoff into the text it hands back.

## Follow-up: re-apply finished replacements after a content swap (option 1, user-approved 2026-10-22)

- Mechanism confirmed in code: leaving source mode runs `PaneEditorComposition.handoffSource`, which applies CodeMirror's last report to the WYSIWYG engine (`handleFileChange` → `replaceContent`) before the controller's mode transition. Source text wins by design, so a CodeMirror text that missed the finished copy brings the placeholder back.
- Change:
  - `Muya.setContent` and `Muya.replaceContent` emit `content-replaced` after the tree is rebuilt.
  - `ImageEditTool` keeps finished results by placeholder id and, on `content-replaced`, replaces any of those placeholders found in the new document. Replacement goes through one helper shared with the first resolution.
- Unit test: "re-applies a finished replacement when stale content brings the placeholder back". It finishes the action, then calls `replaceContent` with markdown taken while the action was pending. Before: `first![loading-mu-10](/abs/shot.png)`. After: `first![](assets/hash.png)`.

| Check (2026-10-22) | Result |
| --- | --- |
| muya unit tests (all) | 2373 passed |
| muya `tsc --noEmit`, eslint on `src/ui/imageEditTool` and `src/muya.ts` | pass |
| scratch e2e, copy delayed 1500 ms | 3/3 passed |
| scratch e2e, copy delayed 1500 ms and landing while source mode is open (2 variants × 2) | 4/4 final markdown correct; CodeMirror already held the result before exit |
| desktop e2e `source-mode-flush`, `issue-781-source-undo`, `parity-source-undo-saved`, `external-reload-undo`, `image-relative-path`, `image-edit-tool`, `issue-3652-auto-reload` | 27/27 passed |
| `issue-5344-image-content-hash.spec.ts` ×30, first build with this change | 27/30; 2 mode A, 1 mode B |
| same spec with temporary debug logging, ×39 under 6 CPU burners, ×30 and ×60 unloaded (plus a 2 ms DOM sampler in two of these runs) | 128/129; 0 mode A, 1 mode B |
| same spec ×30, final build (debug logging removed) | 29/30; 0 mode A, 1 mode B |

- Open: the 2 mode A failures of the first ×30 run, and 1 earlier one seen while `pnpm install` loaded the machine (copy took 3.3 s; muya showed the result, CodeMirror kept the placeholder, and leaving source mode brought it back), were not reproduced once debug logging was added. Which path restored the placeholder despite `content-replaced` was therefore not identified. A failure that shows `img "loading…"` should be traced with the scratch specs in the session scratchpad (`zz-scratch-5344-trace-dbg.spec.ts`, `zz-scratch-5344-plain-dbg.spec.ts`) and console logging in `_replacePlaceholder` and the `content-replaced` listener.

## Related upstream change

- Upstream `4d5753a8` (#5799, not picked) changes the same function the other way: if the captured block left the document, it returns without replacing. Picking it as-is would make this case leave the placeholder every time. If it is picked, keep this file's resolution by placeholder.
