# Ticket 02 source-mode-entry persistence repair evidence

**Date:** 2026-08-23 (America/Los_Angeles)
**Baseline:** `e33c5bb7`
**Scope:** the source-mode-entry content-integrity blocker only. This record does not resolve Ticket 02.

## Feedback loop and red result

The permanent regression is an Electron user-visible seam in
`packages/desktop/test/e2e/editor-input.spec.ts`:

1. open a real on-disk Markdown document in Electron;
2. type the unique tail ` SOURCE-MODE-ENTRY-TAIL-7e4d1c ` in WYSIWYG;
3. immediately enter source mode through the real Electron View menu and assert
   CodeMirror contains the tail;
4. exit source mode, invoke the real renderer save command, assert the disk
   file contains the tail, then close/reopen it and assert source mode again.

The pre-fix red command was:

```text
pnpm --filter marktext exec playwright test test/e2e/editor-input.spec.ts --grep=immediately --repeat-each=30 --workers=8
```

It produced **29 passed / 1 failed** in 58.9 s. The failure was the specified
user-visible persistence oracle: after source-mode exit and save, the on-disk
file was only `pending source-mode input\n`, missing the unique tail. Each
repeat launched its own temporary document and profile; no sleep was added,
no assertion was relaxed, and no unrelated process was stopped.

## Ranked hypotheses and probe results

Temporary probes were tagged `[DEBUG-02-source-mode-boundary]` and were removed
before the fix was verified. They compared the live WYSIWYG DOM, the active
editor-store markdown at the same trigger point, and the mounted CodeMirror
value.

| Hypothesis | Prediction | Result |
| --- | --- | --- |
| H1 — Muya's deferred rAF has updated the DOM but not `currentFile` | DOM is complete while store is an old prefix; a pre-entry synchronous flush removes the window. | **Confirmed.** A captured red sample had DOM `…7e4d1c`, store `…7e4d1`, and CodeMirror later received the full value. The rAF/store gap is therefore real at the source-entry boundary. |
| H2 — input dispatch drops the final key before it reaches the product | WYSIWYG DOM itself lacks the tail; flushing cannot restore it. | **Falsified.** The captured DOM contained the complete tail. |
| H3 — store is complete but the source component mounts from stale props | Store is complete while CodeMirror is stale. | **Falsified.** The captured stale value was the store; CodeMirror in the same sample was complete. |
| H4 — retained state, other processes, or broad resource pressure is the cause | Fresh profile/controlled launches materially change the behavior. | **Not the root cause.** The red sample came from fresh documents and profiles created by the test itself. Eight-worker pressure raises the race opportunity, but the DOM/store ordering directly identifies the product boundary. No non-task process was terminated. |

## Minimal repair

`usePreferencesStore.TOGGLE_VIEW_MODE` now emits the existing
`flush-active-editor` boundary only when transitioning **into** `sourceCode`.
This is the shared transition used by the status-bar button, command/shortcut,
and main-process IPC view toggle. It avoids a preferences-to-editor-store import
cycle and reuses the established editor listener that synchronously calls
Muya's `flush()`.

## Green and regression verification

The same high-pressure command after the repair produced **30 passed / 0
failed** in 58.4 s. The permanent test verifies CodeMirror, disk, and a reopened
document; it is not a bus-order assertion.

Additional completed verification:

| Command | Result |
| --- | --- |
| `pnpm build:unpack` | passed (renderer build 32.53 s) |
| direct related source/document E2E (`editor-input`, `audit-document-integrity`, `audit-large-boundaries`, `parity-cursor-lang`) | 24 passed (57.4 s) |
| `pnpm typecheck` | passed |
| `pnpm test:unit` | 772 passed, 1 skipped |
| `pnpm lint` | 0 errors, 131 pre-existing warnings |
| `pnpm test:e2e` | 261 passed, 4 skipped (8.7 m) |
| `git diff --check` | passed |

The previously separate `task-list-autocheck` cases both passed in this fresh
full E2E run (tests 244 and 245). That is a new non-reproduction observation,
not an attribution to this repair and not a final disposition of its earlier
failure.

## Remaining closure conditions

The source-mode persistence blocker is repaired and covered, but Ticket 02
remains blocked. It still requires the designated independent high-risk review,
an explicit task-list-autocheck disposition, and final acceptance to decide
closure. No deferred P2 work was changed.
