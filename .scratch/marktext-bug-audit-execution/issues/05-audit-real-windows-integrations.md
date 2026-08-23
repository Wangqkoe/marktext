# 05: Audit real Windows integration boundaries

**What to build:** Exercise the small set of operating-system interactions that automation cannot model faithfully, producing exact repeatable Windows evidence without treating unavailable optional dependencies as passing.

**Blocked by:** 04: Audit large documents and Windows boundary configurations.

**Status:** resolved

**Current lifecycle:** `resolved`. Ticket 04 was resolved before this resumed manual run. Ticket 05 completed the frozen M1–M5 Windows matrix on controlled temporary data; Ticket 06 is now the frontier, but is not executed here.

- [x] M1 checks real system Open, Save As and export dialogs with controlled source and destination files and verifies the resulting application and disk state.
- [x] M2 repeats the real external-file modification checks for both a clean document and one with unsaved changes.
- [x] M3 checks a real clipboard bitmap paste and a local-image drag/drop, including the selected image persistence policy and resulting on-disk/reference state.
- [x] M4 closes and restarts MarkText with an unsaved document, recording recovery, prompt and persisted-content behavior.
- [x] M5 invokes import without Pandoc, verifies the missing-dependency notice and confirms the editor remains usable afterward.
- [x] No optional dependency was installed; Pandoc conversion is explicitly unavailable.
- [x] Both confirmed deterministic candidates have 2/2 fresh-profile manual reproduction, persistent application-state evidence and bounded checklists.
- [x] Conflicting capture evidence was resolved through fresh state, minimized input, a normal control and a second observation method.
- [x] Every observation has a disposition; no P0/P1 or fifth-confirmed-defect early stop occurred.
- [x] Evidence is retained locally; no user document is committed or modified, and nothing is pushed.

## Resolution

The real-Windows evidence is recorded in [`../evidence/05-real-windows-integration-results.md`](../evidence/05-real-windows-integration-results.md). M1, M2, M3 local drag/drop, and M4 passed their bounded checks. Pandoc conversion remains unavailable by design. The audit confirmed two deterministic P2 findings: bitmap clipboard paste ignores the configured folder/relative-assets persistence policy, and the missing-Pandoc notification displays raw localization keys. Ticket 06 is unblocked to consolidate all Tickets 01–05; this ticket does not implement either finding.
