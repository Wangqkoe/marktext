# 04: Commit programmatic scroll destinations once

**What to build:** Preserve the existing visual behavior of TOC navigation, search navigation, typewriter positioning, and other established animated WYSIWYG positioning while keeping animation intermediates local to the surface. A completed animation commits only its final destination, and a cancelled, replaced, stale, or same-value animation cannot publish duplicate or late workspace updates.

**Blocked by:** 01: Idle-commit WYSIWYG scrolling without Outline churn

**Status:** complete

- [x] TOC navigation follows its existing visual motion and reaches the same visible destination as before the change.
- [x] Search-result navigation follows its existing visual motion and reaches the same visible destination as before the change.
- [x] Typewriter positioning and every other existing animated WYSIWYG positioning path retain their established visual semantics.
- [x] Animation intermediate positions remain Live Scroll Position changes on the active surface and do not publish workspace projections or rebuild Outline content per frame.
- [x] A normally completed animation commits exactly one final finite position after reaching its destination.
- [x] A final destination equal to the current Committed Scroll Position produces no workspace notification.
- [x] Starting a replacement animation invalidates the earlier animation's pending completion so only the replacement may commit.
- [x] Cancelling navigation, changing View ownership, or disposing the surface prevents stale completion callbacks from committing later.
- [x] Real-renderer coverage exercises the actual TOC, search, and typewriter entry points and observes visible motion, final convergence, notification counts, and stable Outline projection.
- [x] Native user scrolling that interrupts or follows programmatic motion resolves to the latest current-owner position without an obsolete animation destination winning later.

## Implementation evidence

- The WYSIWYG editor now owns one cancellable programmatic-scroll generation. TOC, search, typewriter, caret reveal, and the existing zero-duration positioning calls retain their established destinations and easing while animation frames remain local to the DOM surface.
- Normal completion replaces any older idle candidate and flushes one final finite position through the existing per-View scroll gate. The workspace controller's same-value behavior keeps repeat destinations notification-free.
- Replacement animation, wheel/touch/pointer/keyboard intent, pane generation rebinding, and component disposal invalidate and cancel the prior animation callback. The existing lease fencing remains the final workspace ownership check.
- `animatedScrollTo` now returns an idempotent cancellation closure and calls completion for both animated and immediate paths.

## Verification evidence

- Red: `pnpm exec playwright test --config=test/e2e/playwright.config.ts test/e2e/renderer-scroll-performance.spec.ts` failed because the TOC DOM reached `27029` while the workspace remained at `0` when the animation completed.
- Green: the same renderer file passes 8/8, covering native idle scrolling, TOC completion/replacement/same-value, wheel interruption, real Search, real Typewriter, final convergence, revision counts, and retained Outline nodes.
- Red: the wheel-interruption case ended at the obsolete TOC destination `27029` instead of the user's `900`; green after native input cancellation.
- Red: the real WorkspaceController/pane-composition test failed because the gate could not cancel an older idle candidate; green with 19/19 tests in `scroll-report-frequency.spec.ts`, including forced late callbacks, stale leases, mutation retries, unmount, and persistence isolation.
- Related unit coverage: 4 files, 78/78 passed (`scroll-report-frequency`, `workspace-runtime`, `toc-navigation`, `toc-keys`).
- Full desktop unit suite: 77/78 files and 1034 tests passed; the only failure is the pre-existing `source-code-image-action.spec.ts` set (10 cases, `ReferenceError: computed is not defined`).
- Related renderer coverage: `toc-scroll.spec.ts` 3/3 passed; Search next/previous 2/2 passed; `view-modes.spec.ts` 6 passed with its pre-existing typewriter-centering case still marked `fixme`.
- `pnpm typecheck`, targeted ESLint, `git diff --check`, and `pnpm build` passed. The build retains pre-existing Vite dynamic/static import warnings.
- A combined full `find-replace.spec.ts` run timed out in its pre-existing option-toggle app teardown after the navigation cases passed; the directly related Search navigation subset and the new real Search animation test both pass independently.
