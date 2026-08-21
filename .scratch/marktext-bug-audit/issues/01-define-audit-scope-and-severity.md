# Define the bug-audit scope and severity model

Type: `grilling`
Status: `resolved`
Blocked by:

## Question

Which MarkText surfaces belong in the first bug-audit batch, and how should findings be ranked across data loss, crashes, broken core workflows, incorrect document rendering or serialization, accessibility, performance and cosmetic defects?

## Comments

- Start from user-visible behavior on Windows and existing regression coverage.
- Keep already resolved word-count and switch-contrast reports as baseline checks.
- Exclude feature requests and the completed Typora-inspired shell redesign.

## Resolution

- Audit file open/save/recovery, editor input, WYSIWYG/source round trips, tabs, import/export and functional Preferences behavior on Windows first.
- Use active exploration, automated tests and user-reported defects from the current branch as the initial candidate sources. An upstream GitHub issue sweep is a separate future batch.
- Rank findings as:
  - P0: data loss, file corruption or serious security defects.
  - P1: crashes, inability to open/save, or a completely blocked core workflow.
  - P2: incorrect behavior, rendering or serialization, or a key accessibility failure.
  - P3: minor interaction, performance or visual defects.
- Within a severity, prioritize broader impact and more stable reproduction.
- Stop after five confirmed defects. If a P0 is confirmed, stop exploration and enter remediation immediately.
- Keep the resolved word-count and switch-contrast cases as baseline regression checks; they do not consume finding slots unless they regress.
