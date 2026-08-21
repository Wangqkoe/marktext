# Choose the exploratory surface matrix

Type: `grilling`
Status: `ready-for-agent`
Blocked by: 01

## Question

Which document fixtures, editor modes, file operations, sidebar and tab transitions, preferences, themes, window states and restart scenarios provide the smallest high-yield exploratory matrix for discovering reproducible defects?

## Comments

- Reuse existing E2E fixtures and isolated user-data directories where possible.
- Include save/reload and source/WYSIWYG round trips because defects there can affect user data.
- Do not infer cross-platform behavior from Windows-only observations.
