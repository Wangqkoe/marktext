# 04: Audit large documents and Windows boundary configurations

**What to build:** Verify that representative core editing operations remain stable with a medium-to-large document and across the approved Windows theme, size, zoom and title-bar boundaries, without expanding into a full configuration Cartesian product.

**Blocked by:** 03: Audit tabs, unsaved documents and restart recovery.

**Status:** resolved

**Current lifecycle:** `resolved`. Ticket 03 was accepted before execution; Ticket 05 is now unblocked. This ticket does not execute Ticket 05.

- [x] W4 runs F4 under E1 and checks input responsiveness, scrolling, source-mode transition, tab switching, save completion and absence of renderer/process errors.
- [x] Performance observations use a documented bounded operation and distinguish a repeatable product regression from host-load noise.
- [x] E2 runs a dark-theme representative workflow without loss of operability or hidden functional state.
- [x] E3 runs navigation and save smokes at 640×480.
- [x] E4 runs input, source-mode and menu-operation smokes at 125% application zoom.
- [x] E5 runs native-title-bar launch, edit, save and restart smokes.
- [x] Only the E1 baseline receives the complete workflow; no unapproved matrix combinations are added.
- [x] Visual findings include computed geometry/style, accessibility or hit-testing evidence rather than relying on screenshots alone.
- [x] Every anomaly is recorded and classified, and the P0/fifth-defect early-stop rule is enforced.
- [x] Audit artifacts and any harness changes are committed locally and are not pushed to GitHub.

## Resolution

- The focused Electron W4/W5 audit passed 5/5; the exact evidence and bounded performance control are in [`04-w4-w5-results.md`](../evidence/04-w4-w5-results.md).
- No Ticket 04 product candidate was observed. The repeated F4 source-mode cost was below the predeclared response boundary and is retained as a non-defect performance observation with an F2 control, not misclassified as host or product failure.
- No P0/P1 event and no fifth confirmed product defect occurred. The accepted P0/02A watcher work and deferred find-navigation P2 were not reopened.
- Ticket 05 is unlocked but intentionally not started by this ticket.
