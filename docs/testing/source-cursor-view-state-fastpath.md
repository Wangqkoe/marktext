# Source cursor view-state fast path

Date: 2026-09-18

Baseline: `59351d00a85e484ae8ada6baefa24caf9c15b97c`

## Decision

Pure Source cursor movement now updates the controller and legacy UI facade immediately through a
bounded View-state notification. It does not rebuild editor binding documents, clone portable
history, run document persistence subscribers, or rebuild the full workspace facade. Reports that
contain Markdown, history, status, TOC, or scroll data keep the complete commit path.

The earlier diagnostic measured a 104.4 ms median `reportSource` cost for Arrow and 105.5 ms for
Shift selection after the report had already been reduced to cursor-only data. Code tracing found
that the accepted report still synchronously performed all of the following:

1. rebuilt the bound editor snapshot, including portable history;
2. notified every workspace subscriber;
3. rebuilt the projection mirror with `getFacadeSnapshot`, including another history clone;
4. deep-cloned and rebuilt the Pinia compatibility facade;
5. rebuilt the editor container facade and scheduled DocumentIO and crash-draft reconciliation.

The implementation retains immutable document objects through that path and replaces only the
changed View's cursor and selection. Content commits still rebuild the complete snapshots.

## Uninstrumented response measurement

Both builds used the same production build command and the same trusted-key Playwright test, with
no renderer timing instrumentation. The fixture contains 9,309 lines and 626,129 UTF-8 bytes. Each
action had five warmups followed by 15 recorded operations in one fresh application session.

| Action | Baseline median / p95 | Candidate median / p95 | Median change |
| --- | ---: | ---: | ---: |
| Arrow | 127.1 / 140.7 ms | 17.0 / 21.9 ms | -86.6% |
| Shift selection | 170.7 / 284.3 ms | 65.6 / 77.4 ms | -61.6% |
| Insert | 211.9 / 233.8 ms | 203.3 / 391.5 ms | -4.1% |

Arrow and Shift selection show that the more than 100 ms cursor-report chain was removed. Insert
still requires the full document commit and is not claimed as improved; its candidate p95 included
one large within-session outlier.

Raw results:

- `E:\Program Files\Marktext-performance-evidence\2026-09-18-source-cursor-fastpath\baseline.json`
- `E:\Program Files\Marktext-performance-evidence\2026-09-18-source-cursor-fastpath\candidate.json`

## Correctness boundaries

- Cursor and selection are controller-owned immediately and remain distinct for two Views of one
  shared Document.
- The projection mirror, Pinia workspace facade, active file, and focused-pane tab entry receive the
  new position while retaining frozen history objects.
- A subsequent Markdown report uses the complete commit path and cannot be replaced by an older
  cursor-only snapshot.
- Shared-history capture runs for Source content changes and undo/redo actions, but moving the
  cursor does not wake the hidden WYSIWYG history engine.
- DocumentIO and crash-draft subscribers skip pure View-state notifications. The next document
  revision checkpoints the latest accepted cursor.
- Existing lease, document-revision, transfer-preflight, and pending-mutation fences run before the
  fast path is selected.

## Limits

This is one bounded before/after session on one machine. The result establishes a strong causal
improvement for pure cursor movement in the chosen large fixture, not a cross-machine performance
budget. Selection still has material CodeMirror rendering cost after workspace publication is
removed.

## Reproduction

Build the desktop application, then run:

```powershell
$env:MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF = '1'
$env:MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF_OUT = 'E:\path\to\result.json'
$env:MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF_LABEL = 'candidate'
$env:MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF_REPETITIONS = '15'
pnpm --filter marktext exec playwright test --config=test/e2e/playwright.config.ts test/e2e/source-cursor-response-perf.spec.ts
```
