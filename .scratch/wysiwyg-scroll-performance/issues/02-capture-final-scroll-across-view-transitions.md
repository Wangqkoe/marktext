# 02: Capture final scroll across View transitions

**What to build:** Preserve the user's latest visible WYSIWYG position when a View changes pane, tab, or editing mode before the idle boundary has elapsed. Each transition must capture the outgoing surface at the command boundary; Split Right starts the new right-side View at that captured position while leaving the original View in place, and the two resulting Views then scroll independently.

**Blocked by:** 01: Idle-commit WYSIWYG scrolling without Outline churn

**Status:** implemented

- [x] Switching away from a tab immediately after scrolling captures the outgoing surface's latest Live Scroll Position before the next View is activated.
- [x] Returning to the tab during the same application session restores the captured final position rather than the last idle-committed intermediate position.
- [x] Switching between WYSIWYG and Source captures the outgoing surface before mode replacement and uses a deterministic, current View position for the transition.
- [x] Split Right captures the source View when the command executes and opens the right-side View at that latest visible position while the original tab remains on the left.
- [x] After Split Right completes, left and right Views own independent Live Scroll Position and Committed Scroll Position values; scrolling either side does not move or overwrite the other.
- [x] Move to Left and Move to Right capture the moved View before the pane transition and preserve its latest visible reading position in the destination pane.
- [x] Each transition invalidates or supersedes any earlier pending idle candidate so it cannot later restore an obsolete position.
- [x] Real pane-composition coverage exercises tab switching, mode switching, Split Right, Move to Left, and Move to Right through their user-facing commands.
- [x] Transition capture does not add custom scroll physics or alter the established tab, pane, or mode-switching semantics beyond position continuity.

## Evidence

- RED: the WYSIWYG-to-Source command test captured workspace `scrollTop: 900`, but the new Source surface still displayed `0`.
- RED: the Source-to-WYSIWYG command test left Source at `600`, but the replacement View and WYSIWYG surface restored the older `0`.
- RED: Split Right captured the original left View at `800`, but the newly mounted right View's normalization flush overwrote its inherited position with pre-restore DOM `0`.
- GREEN: `view-modes.spec.ts` covers both mode directions through `sourceCodeModeMenuItem`; Source keeps scroll-only observations local until the existing pane command flushes them.
- GREEN: `tab-switch-cursor.spec.ts` proves an immediate switch captures the final Live Scroll Position instead of the older idle-committed value, restores it on return, and does not admit a later obsolete callback.
- GREEN: `split-workspace.spec.ts` exercises the real `Split Right`, `Move to Right`, and `Move to Left` context-menu commands, including inherited initial position and independent left/right Live and Committed positions.
- Regression: five related unit files pass (88 tests), the renderer scroll-performance E2E passes (3 tests), typecheck and production build pass, and changed-file lint has no errors. The full desktop unit run has 77 files / 1,033 tests passing and the unchanged `source-code-image-action.spec.ts` setup failure (`computed is not defined`) recorded by ticket 01; the combined pane/tab/mode E2E run has 23 tests passing and one skipped, with only the unchanged dirty-undo describe timing out in `afterAll app.close()` after its assertions pass.
- Out of scope and not claimed here: Move to New Window, close/window-close, unmount/refresh concurrency hardening (ticket 03); TOC/search/typewriter animation completion (ticket 04); installed-build, physical touchpad/thumb, and cross-platform validation (ticket 05).

### Independent assertion repair (2026-09-07)

- Environment: Windows 11 Pro `10.0.26200` x64, Node `v24.18.0`, pnpm `10.33.4`, Electron `v42.1.0`; Playwright ran headless at `1280x720` with one worker.
- FALSE-POSITIVE PROOF — Passed: `node -e "const older=1200,captured=3000; const currentAssertion=older>1000 && Math.abs(older-captured)<captured; console.log(JSON.stringify({older,captured,currentAssertion,distance:Math.abs(older-captured),threshold:captured})) ; if(!currentAssertion) process.exit(1)"` reported `currentAssertion: true`, proving the former relation admitted the obsolete `1200` value.
- RED — Failed as expected: after temporarily substituting the known obsolete committed value as the return candidate, `pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/tab-switch-cursor.spec.ts --grep "scrollTop is restored" --workers=1` failed 1/1 with received distance `1800` versus the strict `<= 1` tolerance. The temporary substitution was then removed.
- GREEN — Passed: the same focused command passed 1/1 against the renderer's actual `scrollTop`; final sensitivity run `pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/tab-switch-cursor.spec.ts --grep "scrollTop is restored" --repeat-each=3 --workers=1` passed 3/3 with no failures or skips.
- The final assertion first proves the current layout can express a clamped target strictly beyond the older committed position, then requires the renderer's restored value to be within one pixel of `min(captured, maxScrollTop)`. This admits real layout clamp and rejects restoration to `1200` when the latest Live Scroll Position is `3000`.
- Necessary regression — Failed with known existing teardown only: `pnpm --dir packages/desktop exec playwright test --config=test/e2e/playwright.config.ts test/e2e/tab-switch-cursor.spec.ts --workers=1` ended with 2 passed and 1 failed; the failed undo-history describe exceeded 30 seconds in `afterAll app.close()` after its behavior assertion, matching the pre-existing failure already recorded above. The repaired scroll test passed in that run; no tests were skipped.
- Passed: fresh `pnpm build`; `pnpm --filter marktext typecheck`; `pnpm exec eslint packages/desktop/test/e2e/tab-switch-cursor.spec.ts`; and `git diff --check`. Build emitted only the existing Vite dynamic/static import warnings; ESLint emitted only the existing module-type warning; `git diff --check` emitted only the working-copy LF-to-CRLF notice.
- Failed, non-blocking baseline style item: `pnpm exec prettier --check packages/desktop/test/e2e/tab-switch-cursor.spec.ts` reports that the file needs formatting. Applying the current formatter rewrites many unrelated pre-existing regions, so those changes were reverted to keep this repair scoped; ESLint and diff checks pass.
- Unavailable: none. Untested by this assertion-only repair: ticket 03 lifecycle/concurrency work, ticket 04 programmatic destinations, and ticket 05 installed-build/physical-input/cross-platform validation. No production code changed.
