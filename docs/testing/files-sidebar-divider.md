# Files sidebar divider implementation and validation

- Specification baseline: `e2ba0adbc2244404e7f6e8bb7566e35715a28a68`.
- Source commit: `f93434a67bc4291d4c2facaa34c21df21b315237`.
- Test follow-up: `0ec0fbef0ea8c4cb7c246c38a9c7be46235d23ed`.
- Status: implementation complete and focused automated validation passed. Windows physical human acceptance is **Pending**; Linux/macOS are **Untested**.
- Distribution: no package was produced, and no installation or push was performed.

## Implemented scope

The product implementation is confined to `packages/desktop/src/renderer/src/components/sideBar/tree.vue`. It replaces the Opened Files fixed `112px` maximum with the specified normalized-ratio divider, including pointer drag lifecycle, persistence, double-click reset, semantic minimum clamping, independent scrolling, search-height recomputation, and the required Files/Outline, setting, collapse, and no-root visibility states.

Automated changes are confined to:

- `packages/desktop/test/e2e/sidebar-divider.spec.ts`, added for the divider contract and extended by the test follow-up.
- `packages/desktop/test/e2e/sidebar-files-visual.spec.ts`, adjusted for the new divider while retaining the established Files inset and hit-target checks.

No other source or test files changed. No ADR was created because this is a local, reversible UI layout choice.

## Review and test follow-up

Coordinator review found that the initial implementation tests did not directly assert three accepted behaviors: persistence across an application restart, absence of live movement in another already-open window, and fixed divider geometry when content changes or overflows. These were test-evidence gaps rather than confirmed product defects.

The follow-up commit changed only `sidebar-divider.spec.ts`. It added restart/non-live-window coverage and strengthened the existing default/overflow case with fixed-geometry and fixed-title assertions. The focused tests were green after the follow-up.

## Automated results

Test counts below distinguish unique cases from repeated executions. The divider suite contains **7 distinct tests**; repeat runs do not increase that number.

| Validation                                                     | Result                                             |
| -------------------------------------------------------------- | -------------------------------------------------- |
| Existing Files visual and inline-search baseline               | **9/9 passed**                                     |
| New divider suite, implementation-agent repeat run 1           | **7/7 passed**                                     |
| New divider suite, implementation-agent repeat run 2           | **7/7 passed**                                     |
| Related Electron group: divider + Files visual + inline search | **16/16 passed**                                   |
| Sidebar unit group                                             | **10/10 passed**                                   |
| Coordinator independent divider rerun with `--repeat-each=2`   | **14/14 passed in 48.4 s**; still 7 distinct tests |
| Desktop typecheck                                              | Passed                                             |
| Targeted ESLint                                                | Passed                                             |
| Fresh desktop development build                                | Passed                                             |
| Git diff checks                                                | Passed                                             |

The seven divider tests cover:

1. Default `50%` allocation from the available Files height, complementary region geometry, independent overflow, fixed titles, and geometry stability as contents grow and scroll.
2. Live pointer drag, persistence on release, reload restoration, and persisted double-click reset to `50%`.
3. `pointercancel` restoration without persistence.
4. Temporary semantic-minimum clamping without overwriting the saved ratio, followed by restoration when height returns.
5. Recalculation from reduced inline-search height while preserving the ratio, plus divider stability across search-result and region-content changes.
6. No-root Open Folder layout, Opened Files chevron collapse, setting disable/re-enable, and Files/Outline switching.
7. Persistence across a full application restart and no live broadcast to another already-open window.

The adjacent Files visual tests retain coverage for the `12px` Files inset, thin rule inside the approximately `5px` divider hit target, full-row pointer/context-menu targets, and absence of the Files inset in Outline. The existing inline-search suite verifies its six established filtering and content-pushing scenarios alongside the divider suite.

## Recorded warnings

The successful checks emitted only record-level warnings:

- Node reported `MODULE_TYPELESS_PACKAGE_JSON`.
- The build reported four existing CodeMirror static/dynamic import warnings.
- Playwright reported the `NO_COLOR` / `FORCE_COLOR` environment warning.

None indicated a failed assertion, lint error, type error, build failure, data risk, or missing accepted behavior, so they are non-blocking.

## Manual acceptance checklist

Windows physical human acceptance remains **Pending**. It must verify:

- The divider presents a thin theme-appropriate rule, hover highlight, `row-resize` cursor, and practical pointer hit target.
- Pointer drag tracks live, release persists, cancellation restores the drag-start position, and double-click resets to `50%`.
- A saved ratio survives application restart and appears in subsequently created or reloaded windows without moving a different window that was already open.
- Window resizing and inline-search show/hide temporarily clamp and recompute correctly, then restore the saved ratio; changing search results or region contents does not move the divider.
- Both titles remain fixed while file and tree contents scroll independently.
- Collapsed Opened Files retains its allocated empty height; no Folder root retains the lower region and complete Open Folder control.
- Disabling Opened Files hides its region and divider and gives Folder tree full height; re-enabling restores the ratio.
- Outline has no divider, and returning to Files restores the previous allocation.

No physical Linux or macOS acceptance was performed; both platforms remain **Untested**. No package-level smoke or installation acceptance was performed because no distributable package was built.
