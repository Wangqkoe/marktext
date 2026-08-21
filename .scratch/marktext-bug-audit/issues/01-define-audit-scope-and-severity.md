# Define the bug-audit scope and severity model

Type: `grilling`
Status: `ready-for-agent`
Blocked by:

## Question

Which MarkText surfaces belong in the first bug-audit batch, and how should findings be ranked across data loss, crashes, broken core workflows, incorrect document rendering or serialization, accessibility, performance and cosmetic defects?

## Comments

- Start from user-visible behavior on Windows and existing regression coverage.
- Keep already resolved word-count and switch-contrast reports as baseline checks.
- Exclude feature requests and the completed Typora-inspired shell redesign.
