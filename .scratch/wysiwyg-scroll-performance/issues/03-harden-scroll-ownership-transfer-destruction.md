# 03: Harden scroll ownership across transfer and destruction

**What to build:** Keep the final current-session WYSIWYG position safe when a View is transferred to a new window or its surface is closed, refreshed, or destroyed, even when scroll convergence races with another workspace mutation. Only the current View lease may commit the latest position, bounded retry may recover from a temporary conflict, and scroll-only work must remain isolated from document content, history, dirty state, and persistence.

**Blocked by:** 02: Capture final scroll across View transitions

**Status:** ready-for-agent

- [ ] Move to New Window captures the source surface's latest Live Scroll Position before ownership transfers, and the destination View opens at that position.
- [ ] Closing a tab or window invalidates its pending idle work so no callback from the destroyed surface can update a surviving or replacement View.
- [ ] Editor unmount and refresh capture the latest finite position at the lifecycle boundary and fence callbacks owned by the replaced surface.
- [ ] When a temporary workspace mutation rejects an ordinary idle commit, the system retains only the newest candidate for the current lease and retries it a bounded number of times.
- [ ] Repeated scroll events or mutation conflicts cannot accumulate an unbounded number of timers, animation-frame callbacks, or retries.
- [ ] A stale lease, transferred lease, permanently fenced View, disposed surface, or superseded generation is rejected without retrying or overwriting its successor.
- [ ] If lifecycle capture and pending adapter or idle work overlap, the latest valid observation for the current owner wins in a deterministic order.
- [ ] Forced late timer and callback tests prove that an old surface cannot change the successor View's Committed Scroll Position.
- [ ] Scroll-only capture carries only a finite position value and cannot overwrite Markdown, portable history, selection, dirty state, or other editor data with an older snapshot.
- [ ] Scroll-only lifecycle work does not create an unintended DocumentIO write or crash draft, while legitimate concurrent content and history updates continue to follow existing ownership rules.
- [ ] The behavior remains current-session continuity only; no cross-restart or crash-recovery persistence is introduced.
