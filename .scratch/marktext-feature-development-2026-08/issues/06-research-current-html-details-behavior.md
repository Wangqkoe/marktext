# 复现并界定 HTML details 当前行为

Type: `research`
Status: `resolved`
Blocked by: 01

## Question

Using the real application or a reliable harness, establish current raw HTML `details`/`summary` behavior: inactive preview versus source editing, `open`, keyboard interaction, themes, `disableHtml`, round-trip, sanitization, and export. Record evidence only; do not implement a fix.

## Comments

- Findings must distinguish browser-native behavior from MarkText-owned rendering and event handling.

## Answer

See [current raw-HTML `details` behavior](../research/html-details-current-behavior.md). The current preview inserts sanitized HTML as a real browser element while active editing shows raw source; actual browser interaction, theme, and desktop-runtime evidence remains untested in this worktree.
