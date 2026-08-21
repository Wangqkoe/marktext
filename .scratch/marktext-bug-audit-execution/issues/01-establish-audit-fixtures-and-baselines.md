# 01: Establish audit fixtures, evidence records and regression baselines

**What to build:** Create a repeatable audit starting point that can launch MarkText with controlled documents and isolated state, record every observation consistently, and prove that the two previously repaired user reports remain fixed before new discovery begins.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] F1 provides a blank unsaved document without relying on state from an earlier run.
- [ ] F2 reuses the canonical all-blocks document without leaving tracked-content modifications behind.
- [ ] F3 reproducibly creates a temporary document under a path containing spaces and Chinese characters, with CJK text, emoji, CRLF line endings and a relative image reference.
- [ ] F4 reproducibly generates a medium-to-large document suitable for input, scrolling, mode-switch and save stability checks.
- [ ] Independent flows receive fresh user-data directories, while restart/persistence work can deliberately relaunch against one separately identified shared directory.
- [ ] A candidate evidence record captures commit and environment, fixture, clean-state steps, expected-behavior basis, actual application-level evidence, reproduction rate, catching command/checklist, severity, impact and final disposition.
- [ ] The candidate record supports every approved triage category without silently dropping inconclusive or non-product findings.
- [ ] The loaded-document word-count regression passes under the controlled audit baseline.
- [ ] The unchecked Preferences switch-contrast regression passes under the controlled audit baseline.
- [ ] Commands and generated-artifact locations are documented, original user files remain read-only, and no product repair is made in this ticket.
- [ ] All changes are committed locally and are not pushed to GitHub.
