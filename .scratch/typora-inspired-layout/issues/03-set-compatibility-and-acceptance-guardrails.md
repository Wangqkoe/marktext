# Set compatibility and acceptance guardrails

Type: `grilling`
Status: `resolved`
Blocked by: 01, 02

## Question

What platform, theme, preference, and rollout constraints define an acceptable replacement shell?

## Answer

- Windows is the primary acceptance platform.
- The light application shell is the Typora-inspired visual-match baseline.
- The dark application shell must remain usable through semantic theme variables, but it does not require pixel matching.
- macOS and Linux must not regress functionally, including native-title-bar configurations.
- The new shell replaces the old globally. There is no parallel optional shell.
- Existing stored preferences must be preserved or migrated, with deterministic defaults where old state no longer maps directly.
- Acceptance must cover layout geometry, keyboard/menu entry points, sidebar/tab/status state transitions, persisted preferences, and cross-platform smoke behavior.

## Comments

- Resolved from the user's acceptance of all recommended compatibility and rollout decisions.
