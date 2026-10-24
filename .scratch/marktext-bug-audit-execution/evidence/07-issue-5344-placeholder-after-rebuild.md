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

## Follow-up 2026-10-24: residual placeholder traced and fixed; the spec's later 100% failure

Worktree `E:/mt-wt/issue-5344b`, branch `fix/issue-5344-residual` from `main` `91e3788a`. Not pushed, not merged.

### The spec failed every run on `main` since the path-bridge pick

- `issue-5344-image-content-hash.spec.ts` failed 60/60 on `91e3788a` (30 unloaded, 30 under 12 CPU burners). Every failure was the first insert: the image tool stayed open with the path in its input. The full-suite failures recorded as "known intermittent" since step 4 of the 2026-10-23 decisions were this, not the race in this record. That classification was wrong.
- Logging in `ImageEditTool` showed Enter did confirm, the copy ran and the placeholder was replaced. The returned reference was `assets\<hash>.png`: after `54792796` (renderer path bridge, win32 rules on Windows) `moveImageToFolder` builds the relative path with backslashes, and the spec's pattern expects `assets/`.
- Fix `001b0bb0`: `moveImageToFolder` writes relative references with `/`. Absolute paths unchanged. New unit test with a win32 path module fails before (`assets\images\content-hash.png`) and passes after. Spec after the fix: 30/30.

### Residual placeholder (mode A): root cause

- Reproduced with the delayed-copy scratch spec (copy delayed 300 ms or 1500 ms, 8 CPU burners): 1 in 8 runs each, and 3 in 10 in a later round.
- Console logging of `setContent`, `replaceContent` (with the op count), `content-replaced` and `_replacePlaceholder` gave this sequence in a failing run: the copy resolves and `_replacePlaceholder` finds and replaces the placeholder; 9 ms later leaving source mode calls `replaceContent` with CodeMirror text that still holds the placeholder, and the op count is 0; every later round trip also reports 0 ops with the placeholder, and `content-replaced` never fires again. In passing runs the next `replaceContent` came about 90 ms after the replacement.
- Mechanism (from code, consistent with the log): muya queues edits and applies them to `jsonState` on the next animation frame, and `jsonState.setContent` drops the queue. When leaving source mode lands in the same frame as the replacement:
  1. `replaceContent` diffs the stale text against state that does not contain the queued replacement yet, finds no change, returns without emitting `content-replaced`, so the follow-up re-apply never runs;
  2. the desktop then calls `setCursorByOffset`, which rebuilds the document from `getMarkdown()` (same stale state) through `editor.setContent` and drops the queued replacement.
- Fix `7e7c2628`: `Muya.replaceContent` and `Muya.setCursorByOffset` flush the queue before reading state. `setContent` keeps dropping it (it swaps documents; #2938).
- New unit test: "keeps a replacement that is still queued when stale content arrives in the same frame". Before: `first![loading-mu-16](/abs/shot.png)`. After: `first![](assets/hash.png)`. The existing "re-applies a finished replacement" test flushes before `replaceContent`, which is why it did not catch this.

| Check (2026-10-24) | Result |
| --- | --- |
| delayed-copy spec, 300 ms and 1500 ms, 8 burners, ×10 each, two rounds | 40/40, no placeholder left |
| original spec ×30 unloaded | 29/30; the 1 failure is mode B |
| muya unit tests | 2557 passed |
| desktop unit tests | 1177 passed, 6 skipped |
| muya `tsc --noEmit`, eslint on the changed files; desktop typecheck and lint | pass (0 errors) |

### Still open

- Mode B (Enter in the image tool not applied on the second insert) still shows up about 1 in 30 runs. Not investigated further in this round.
- `4d5753a8` was later picked only in part (`1751cf70`: `Muya.isBlockInDocument` and the paste guards); the image tool keeps the resolution by placeholder described above.
