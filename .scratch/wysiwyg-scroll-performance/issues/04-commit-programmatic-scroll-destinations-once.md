# 04: Commit programmatic scroll destinations once

**What to build:** Preserve the existing visual behavior of TOC navigation, search navigation, typewriter positioning, and other established animated WYSIWYG positioning while keeping animation intermediates local to the surface. A completed animation commits only its final destination, and a cancelled, replaced, stale, or same-value animation cannot publish duplicate or late workspace updates.

**Blocked by:** 01: Idle-commit WYSIWYG scrolling without Outline churn

**Status:** ready-for-agent

- [ ] TOC navigation follows its existing visual motion and reaches the same visible destination as before the change.
- [ ] Search-result navigation follows its existing visual motion and reaches the same visible destination as before the change.
- [ ] Typewriter positioning and every other existing animated WYSIWYG positioning path retain their established visual semantics.
- [ ] Animation intermediate positions remain Live Scroll Position changes on the active surface and do not publish workspace projections or rebuild Outline content per frame.
- [ ] A normally completed animation commits exactly one final finite position after reaching its destination.
- [ ] A final destination equal to the current Committed Scroll Position produces no workspace notification.
- [ ] Starting a replacement animation invalidates the earlier animation's pending completion so only the replacement may commit.
- [ ] Cancelling navigation, changing View ownership, or disposing the surface prevents stale completion callbacks from committing later.
- [ ] Real-renderer coverage exercises the actual TOC, search, and typewriter entry points and observes visible motion, final convergence, notification counts, and stable Outline projection.
- [ ] Native user scrolling that interrupts or follows programmatic motion resolves to the latest current-owner position without an obsolete animation destination winning later.
