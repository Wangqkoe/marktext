# Choose the shell structure and behavior

Type: `grilling`
Status: `resolved`
Blocked by: 01

## Question

Which shell regions should replace the current layout, and how should existing MarkText capabilities behave within them?

## Answer

- Replace the 45px activity rail with a Typora-style full docked sidebar. Hiding it removes the entire sidebar rather than leaving a narrow rail.
- Preserve MarkText capabilities by default, but reorganize their entry points to fit the new hierarchy.
- Keep MarkText's tab bar as a separate compact second row and retain its current visibility preference.
- Add a distinct, persistent bottom status bar and move word count there. The corrected active-tab word-count state remains the data source.
- Keep `editorLineWidth` authoritative while adjusting defaults, surrounding spacing, and responsive constraints to suit the new shell.
- Use the custom Windows title bar as the detailed visual baseline; native title bars need functional compatibility rather than pixel equivalence.

## Comments

- Resolved from the user's acceptance of all recommended shell decisions.
