# 04: Audit large documents and Windows boundary configurations

**What to build:** Verify that representative core editing operations remain stable with a medium-to-large document and across the approved Windows theme, size, zoom and title-bar boundaries, without expanding into a full configuration Cartesian product.

**Blocked by:** 03: Audit tabs, unsaved documents and restart recovery.

**Status:** ready-for-agent

- [ ] W4 runs F4 under E1 and checks input responsiveness, scrolling, source-mode transition, tab switching, save completion and absence of renderer/process errors.
- [ ] Performance observations use a documented bounded operation and distinguish a repeatable product regression from host-load noise.
- [ ] E2 runs a dark-theme representative workflow without loss of operability or hidden functional state.
- [ ] E3 runs navigation and save smokes at 640×480.
- [ ] E4 runs input, source-mode and menu-operation smokes at 125% application zoom.
- [ ] E5 runs native-title-bar launch, edit, save and restart smokes.
- [ ] Only the E1 baseline receives the complete workflow; no unapproved matrix combinations are added.
- [ ] Visual findings include computed geometry/style, accessibility or hit-testing evidence rather than relying on screenshots alone.
- [ ] Every anomaly is recorded and classified, and the P0/fifth-defect early-stop rule is enforced.
- [ ] Audit artifacts and any harness changes are committed locally and are not pushed to GitHub.
