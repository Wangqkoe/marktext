# Desktop renderer scroll profile

Recorded stage status: the WYSIWYG work described below is integrated and passed the recorded T05 Windows installed acceptance. Physical touchpad, Linux, and macOS remain untested. T06 Source large-document capacity and T07 Opened Files scale/delivery findings remain separate, unfixed issues. See [T05](../../.scratch/wysiwyg-scroll-performance/evidence/05-installed-scroll-acceptance.md), [T06](../../.scratch/wysiwyg-scroll-performance/evidence/06-source-large-document-capacity.md), [T07](../../.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.md), and [phase cleanup](../../.scratch/wysiwyg-scroll-performance/evidence/phase-cleanup.md). The measurements below retain their original baselines and are not a current rerun.

## WYSIWYG idle-commit measurement entry (ticket 01)

- Baseline: `27fb95338bffb0d0eb692ec32d1a8c4423809629`
- Fixture: `packages/desktop/test/e2e/data/wysiwyg-scroll-400-headings.md` (400 level-2 headings, each followed by one paragraph)
- Automated environment: Windows, Electron 42 headless renderer, 1280x720 viewport

The deterministic renderer entry opens the fixed heading-heavy fixture, shows the real Outline,
drives the production `.editor-component` passive scroll listener across several renderer frames,
and observes the production workspace snapshot. It requires the DOM Live Scroll Position to move
immediately while workspace revision and Committed Scroll Position remain unchanged during the
burst; after 200 ms it requires exactly one revision with the final position. A retained DOM marker
also verifies that the scroll-only convergence does not replace Outline nodes.

```powershell
pnpm --dir packages/desktop run build
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/renderer-scroll-performance.spec.ts
```

The same Markdown file is the reproducible input for later installed-build frame-gap measurement.
That acceptance still uses three runs and the median proportion of requestAnimationFrame gaps over
50 ms; passing remains `<= 5%` after first recording idle cadence. This development-build entry does
not claim the installed-build threshold or physical touchpad/thumb acceptance.

- Ticket: T06, desktop UI and Folder navigation
- Baseline: `21137f29274c8c855fe4ec797d9d242f9e5c3491`
- Environment: Windows, Electron 42 headless renderer, 1280x720 viewport, Node 24.18.0, pnpm 10.33.4
- Fixture: one WYSIWYG document with 160 overflowing paragraphs; unit counter uses four native-scroll-equivalent values (`10`, `20`, `30`, `40`) in one renderer frame

## Counter evidence

The baseline WYSIWYG handler performed two controller reports for every native `scroll`: one direct `scope.report({ scrollTop })`, then one through `editorStore.updateScrollPosition`. The controller committed even when the second report did not change state.

The same focused unit command was run before and after each change:

```powershell
pnpm --dir packages/desktop exec vitest run test/unit/specs/scroll-report-frequency.spec.ts
```

| Stage                                   |                                                    Input | Reports | controller commits / projection notifications | Final `scrollTop` |
| --------------------------------------- | -------------------------------------------------------: | ------: | --------------------------------------------: | ----------------: |
| Baseline                                | 4 events in one frame, duplicated by the current handler |       8 |                                             8 |                40 |
| No-change commit guard only             |                                            same sequence |       8 |                                             4 |                40 |
| Final frame gate + one report path      |                                    4 events in one frame |       1 |                                             1 |                40 |
| Final, unchanged value in a later frame |                                                        1 |       1 |                                             0 |                40 |
| Final, new value in the next frame      |                                                        1 |       1 |                                             1 |                60 |

The retained unit test also covers projection-mirror notification count, an explicit unmount flush, a deliberately fired cancelled callback after disposal, a stale old lease after tab activation changes, and transition flush preserving the outgoing view's final `scrollTop`.

The deferred-report repair additionally exercises a real two-pane split-ratio mutation. A current left-pane lease is temporarily rejected while the controller mutation is pending, the gate retains only the newest value (`180` replaces `140`), and one delayed retry publishes exactly one commit after the mutation. The same test proves that an old lease is classified as stale even while another mutation is pending, and that cancelled frame/timer callbacks stay inert after disposal.

The follow-up repair removes the gate's cross-frame reported-value cache because a same-lease controller flush can independently change canonical `scrollTop`; unchanged reports now reach the controller and still produce zero commits. Reentrant requests keep at most one frame or retry timer scheduled, and transfer preflight fences remain permanent rejections for ordinary reports even while another mutation is pending.

Final-scroll ownership is now linearized while the controller-issued lease is still current. The lifecycle interface accepts only a finite `number`, updates that binding's snapshot synchronously, and has no post-lease `EditorReport` queue or view-ID-only write path. A queued successor generation therefore wins with one canonical/surface value. In a real Vue parent/child unmount, pane surfaces finalize before the parent disposes the controller. If a different final scroll is permanently rejected after transfer preflight, the gate does not retry it but retains that last observation for unmount; finalization keeps the visible value and revokes the stale, unconsumed transfer fence instead of authorizing the older capsule. Focused persistence coverage confirms that this scroll-only path cannot checkpoint stale markdown/history or send them through DocumentIO.

The in-flight repair adds a controller-private observation epoch to each View. Every valid lifecycle finalization advances that epoch, including an observation equal to canonical state. All adapter flush paths pass through one internal module that captures the epoch before awaiting the surface; if a lifecycle observation wins meanwhile, only the returned flush's stale `scrollTop` is suppressed while markdown, history, and other safe fields still apply. The shared report application path also revokes an unconsumed transfer fence whenever any accepted newer scroll changes the View, including a controller-internal flush after preflight.

The production Electron E2E drives the actual `.editor-component` scroll listener. Four synchronous DOM scroll changes publish revision delta `1` with both DOM and workspace snapshot ending at `160`; redispatching `160` publishes revision delta `0`; a next-frame value publishes delta `1`. A Playwright wheel input moves the native container immediately and the position does not continue changing after input ends.

```powershell
pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/renderer-scroll-performance.spec.ts
```

Result: 3 passed in 3.6s.

The final prescribed E2E group (`renderer-scroll-performance`, `toc-scroll`, `source-toc-scroll`, `scroll-up-arrow`) completed with 8 passed and 1 failed. All T06 reporting and TOC/Source animation assertions passed; the remaining `scroll-up-arrow` baseline failure is recorded below.

## Renderer overflow inventory

Inventory command:

```powershell
rg -n --glob '*.{vue,css,scss,less,ts,tsx,js}' 'overflow' packages/desktop/src/renderer/src
rg -n --glob '*.{vue,ts,tsx,js}' 'addEventListener\([^\r\n]*scroll|@scroll|\.on\([^\r\n]*scroll|wheel|touchmove' packages/desktop/src/renderer/src
```

| Area / selector                                              | Source                                                                                   | Event or state side effect                                                                                                                                        | Finding / action                                                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| WYSIWYG `.editor-component`                                  | `components/editorWithTabs/editor.vue`                                                   | Passive native `scroll` reported into workspace; baseline duplicated every report                                                                                 | Confirmed hotspot. Coalesce only the reporting side effect per frame and skip unchanged controller commits. Native scrolling remains untouched. |
| Source `.source-code`                                        | `components/editorWithTabs/sourceCode.vue`                                               | No native scroll listener or scroll-to-workspace report; content/cursor reports occur on editor changes. TOC uses the existing smooth `scrollSourceEditorToLine`. | No independent state-churn evidence; unchanged.                                                                                                 |
| Files `.opened-files-list`, `.project-tree`, `.tree-wrapper` | `components/sideBar/tree.vue`                                                            | CSS overflow only; no scroll/wheel handler                                                                                                                        | Native-only; unchanged.                                                                                                                         |
| Outline `.side-bar-toc-overflow`, `.side-bar-toc-wordwrap`   | `components/sideBar/toc.vue`                                                             | CSS overflow only; TOC click sends an existing programmatic editor jump                                                                                           | Native-only container; unchanged.                                                                                                               |
| Search `.search-result`, `.empty`                            | `components/sideBar/search.vue`                                                          | CSS overflow only                                                                                                                                                 | Native-only; unchanged.                                                                                                                         |
| Preferences `.pref-setting`, `.category`                     | `pages/preference.vue`, `prefComponents/sideBar/index.vue`                               | CSS overflow only                                                                                                                                                 | Native-only; unchanged.                                                                                                                         |
| Command palette `ul.commands`                                | `components/commandPalette/index.vue`                                                    | Native scrolling plus selection-driven `scrollIntoView`                                                                                                           | No workspace reporting; unchanged.                                                                                                              |
| Export settings `.el-tabs__content`                          | `components/exportSettings/index.vue`                                                    | CSS overflow only                                                                                                                                                 | Native-only; unchanged.                                                                                                                         |
| Image preference debug output and debug popup                | `prefComponents/image/components/uploader/index.vue`, `prefComponents/sideBar/config.ts` | CSS overflow only, debug surfaces                                                                                                                                 | No workspace reporting; unchanged.                                                                                                              |
| Tab strip                                                    | `components/editorWithTabs/tabs.vue`                                                     | Existing dedicated wheel-to-horizontal-tab behavior on an overflow-hidden strip                                                                                   | Explicit T06 non-target; no evidence justifying a change.                                                                                       |
| Image viewer                                                 | `components/editorWithTabs/editor.vue`                                                   | Existing wheel-to-zoom interaction in the viewer overlay                                                                                                          | Tool interaction, not document scrolling; explicit non-target and unchanged.                                                                    |

No Source, Sidebar, Search, Preferences, command-palette, export-settings, or debug overflow container had a native scroll handler that fed workspace commits. There was therefore no independent evidence to modify those files.

## Verification and environment limits

| Check                                                                                    | Status                     | Evidence                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same value: zero commit/projection                                                       | Passed                     | Focused unit + production E2E                                                                                                                                                                                                                                                                                     |
| Same frame, same view: one final report/commit                                           | Passed                     | Focused unit + production E2E                                                                                                                                                                                                                                                                                     |
| Next frame, new value: one report/commit                                                 | Passed                     | Focused unit + production E2E                                                                                                                                                                                                                                                                                     |
| Current lease temporarily rejected during a two-pane mutation                            | Passed                     | Focused unit retains only the latest value, uses one bounded backoff timer/frame at a time, keeps one scheduled callback under reentrancy, then publishes one commit after the mutation                                                                                                                           |
| Unmount flush preserves the final value; disposed gate and old lease do not commit later | Passed                     | Focused production-composition and real Vue parent/child unmount tests reach the final canonical value before controller disposal and force cancelled frame/timer callbacks after disposal                                                                                                                        |
| Final scroll ownership, persistence isolation, and transfer preflight                    | Passed                     | Focused unit rejects full-report/non-finite inputs, keeps successor canonical/surface state converged, emits no stale crash-draft/DocumentIO payload, and revokes a preflight fence superseded by a newer final scroll                                                                                            |
| In-flight flush high-water mark and internal-flush transfer fencing                      | Passed                     | Focused unit keeps final `200` over an already-running flush's `100` while accepting its markdown/history, advances the fence for an equal canonical final, and rejects transfer authorization after a controller-internal flush supersedes the sealed scroll                                                     |
| Transition flush retains final outgoing scroll                                           | Passed                     | Focused unit restores the old view at `scrollTop: 90` after tab transition                                                                                                                                                                                                                                        |
| Wheel, automated                                                                         | Passed                     | Playwright wheel moves native WYSIWYG container and has no post-input continuation                                                                                                                                                                                                                                |
| Physical touchpad                                                                        | Unavailable                | Headless Windows worker has no physical touchpad input path                                                                                                                                                                                                                                                       |
| Physical scrollbar thumb                                                                 | Unavailable                | Headless Electron cannot perform a physical thumb drag; direct DOM scroll and workspace convergence are automated                                                                                                                                                                                                 |
| Dense Files/Outline/Search and long Preferences physical-device smoke                    | Untested                   | No interactive desktop/device session in this execution task; static handler inventory found no workspace scroll path                                                                                                                                                                                             |
| Linux/macOS physical-device smoke                                                        | Unavailable                | Windows-only execution environment                                                                                                                                                                                                                                                                                |
| `scroll-up-arrow.spec.ts`                                                                | Failed (existing baseline) | Two isolated runs remain at `scrollTop: 0` after ArrowDown, before any T06 report/commit assertion. At baseline `21137f29`, the cursor auto-scroll listener body in `editor.vue` is already commented out. Restoring or changing that animation is outside T06 and would violate the preserve-animation boundary. |

The optimization does not install wheel/touch handlers, call `preventDefault`, change CSS overflow, or change `animatedScrollTo`, Source TOC smooth scrolling, search jumps, cursor/typewriter scrolling, or scroll restoration.
