# 05: Audit real Windows integration boundaries

**What to build:** Exercise the small set of operating-system interactions that automation cannot model faithfully, producing exact repeatable Windows evidence without treating unavailable optional dependencies as passing.

**Blocked by:** 04: Audit large documents and Windows boundary configurations.

**Status:** ready-for-agent

**Current lifecycle:** `ready-for-agent`, but currently blocked by Ticket 04. Do not begin it until Ticket 04 is resolved.

- [ ] M1 checks real system Open, Save As and export dialogs with controlled source and destination files and verifies the resulting application and disk state.
- [ ] M2 repeats the real external-file modification checks for both a clean document and one with unsaved changes.
- [ ] M3 checks a real clipboard bitmap paste and a local-image drag/drop, including the selected image persistence policy and resulting on-disk/reference state.
- [ ] M4 closes and restarts MarkText with an unsaved document, recording recovery, prompt and persisted-content behavior.
- [ ] M5 invokes import without Pandoc, verifies the missing-dependency notice and confirms the editor remains usable afterward.
- [ ] No optional dependency is installed solely for this audit; unavailable conversion remains explicitly recorded as unavailable.
- [ ] A product defect requires 2/2 manual reproduction, persistent output or application-state evidence and an exact bounded checklist.
- [ ] Conflicting manual and automated evidence is resolved through fresh state, minimized input, a normal control and a second observation method.
- [ ] Every observation receives a retained disposition, and the P0/fifth-defect stop rule remains active.
- [ ] Evidence artifacts are committed locally when appropriate, original user files remain uncommitted and read-only, and nothing is pushed to GitHub.
