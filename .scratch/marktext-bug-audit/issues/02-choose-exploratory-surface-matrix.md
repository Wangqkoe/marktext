# Choose the exploratory surface matrix

Type: `grilling`
Status: `resolved`
Blocked by: 01

## Question

Which document fixtures, editor modes, file operations, sidebar and tab transitions, preferences, themes, window states and restart scenarios provide the smallest high-yield exploratory matrix for discovering reproducible defects?

## Comments

- Reuse existing E2E fixtures and isolated user-data directories where possible.
- Include save/reload and source/WYSIWYG round trips because defects there can affect user data.
- Do not infer cross-platform behavior from Windows-only observations.

## Resolution

Use risk-weighted pairwise coverage, not a full Cartesian product. Each independent flow receives a fresh isolated user-data directory; one shared directory is reserved for restart, session and preference persistence.

### Fixtures

- F1: blank unsaved document.
- F2: the existing canonical `test/e2e/data/all-blocks.md` fixture.
- F3: a temporary edge document under a path containing spaces and Chinese characters, with CJK text, emoji, CRLF line endings and a relative image reference.
- F4: a generated medium-to-large document for one input, scroll, mode-switch and save stability smoke.

### Windows configurations

- E1: light theme, custom title bar, 1280×720 and 100% application zoom; run the complete workflow here.
- E2: dark theme at the baseline size; run a representative workflow only.
- E3: 640×480; run navigation and save smokes only.
- E4: 125% application zoom; run input, source-mode and menu-operation smokes only.
- E5: native title bar; run launch, edit, save and restart smokes only.

These observations support Windows claims only. Do not infer macOS or Linux behavior from them.

### Functional preferences

Cover only settings that change a core workflow or persisted result:

- auto-save and its delay;
- startup document and layout restoration;
- theme selection;
- image insertion policy;
- persisted source-mode and tab-bar state.

Do not audit Preferences visual layout. Expand to another setting only after direct defect evidence.

### Real-Windows boundaries

- M1: system open, Save As and export dialogs.
- M2: external modification of both a clean file and a file with unsaved changes.
- M3: bitmap clipboard paste and local-image drag/drop, including the configured persistence policy.
- M4: application close and restart with an unsaved document.
- M5: import without Pandoc, including the error notice and subsequent application state.

Do not install optional tools solely for this audit. If Pandoc is absent, record conversion as unavailable after verifying the missing-dependency path.

### Paired workflows

- W1 = F2 + E1: open, render, WYSIWYG edit, source edit, return, undo/redo, save, compare disk content and reload.
- W2 = F1 + E1: create, switch between two tabs, close while unsaved, restart with the shared user-data directory, restore, Save As and reopen.
- W3 = F3 + E1: exercise the Unicode path, CRLF preservation, relative image, auto-save and clean/dirty external-change states.
- W4 = F4 + E1: smoke input, scrolling, source-mode switching, tab switching and save stability.
- W5 = F2 paired separately with E2–E5: run only the representative boundary operations specified above.
- W6 = M1–M5: run one explicit real-Windows procedure per boundary.

### Execution and expansion

Run in this order:

1. Recheck the resolved word-count and unchecked-switch contrast baselines.
2. Run W1 and W3 for disk integrity, save and external-change behavior.
3. Run W2 for unsaved state, tabs and restart recovery.
4. Run W4 and W5 for large-document and configuration-boundary smokes.
5. Run W6 for real Windows integration.

Stop immediately if a P0 is confirmed. Otherwise stop the batch after five confirmed defects. Freeze this matrix during exploration; add only the smallest scenario needed to isolate an anomaly, and record the reason for that addition.
