# 01: Establish audit fixtures, evidence records and regression baselines

**What to build:** Create a repeatable audit starting point that can launch MarkText with controlled documents and isolated state, record every observation consistently, and prove that the two previously repaired user reports remain fixed before new discovery begins.

**Blocked by:** None (can start immediately).

**Status:** implemented-awaiting-review

- [x] F1 provides a blank unsaved document without relying on state from an earlier run.
- [x] F2 reuses the canonical all-blocks document without leaving tracked-content modifications behind.
- [x] F3 reproducibly creates a temporary document under a path containing spaces and Chinese characters, with CJK text, emoji, CRLF line endings and a relative image reference.
- [x] F4 reproducibly generates a medium-to-large document suitable for input, scrolling, mode-switch and save stability checks.
- [x] Independent flows receive fresh user-data directories, while restart/persistence work can deliberately relaunch against one separately identified shared directory.
- [x] A candidate evidence record captures commit and environment, fixture, clean-state steps, expected-behavior basis, actual application-level evidence, reproduction rate, catching command/checklist, severity, impact and final disposition.
- [x] The candidate record supports every approved triage category without silently dropping inconclusive or non-product findings.
- [x] The loaded-document word-count regression passes under the controlled audit baseline.
- [x] The unchecked Preferences switch-contrast regression passes under the controlled audit baseline.
- [x] Commands and generated-artifact locations are documented, original user files remain read-only, and no product repair is made in this ticket.
- [x] All changes are committed locally and are not pushed to GitHub.
