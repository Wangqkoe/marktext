# Candidate evidence record: `W1-SYNTHETIC-KEYBOARD-INPUT-INTERMITTENT`

## Identity and environment

- Observed at (local date/time and timezone): 2026-08-22 -07:00 during Ticket 02A post-review verification.
- Environment: Windows 64-bit, Playwright Electron E2E, isolated disposable W1 profile and F2 fixture.
- Product modules changed by Ticket 02A: main-process file watcher only; the observed path is renderer focus and synthetic keyboard input.

## Input and controlled clean state

- Launch the F2 all-blocks fixture, place the caret in the first paragraph and call `page.keyboard.type(' W1-WYSIWYG-AUDIT')`.
- Continue through source-mode edit, undo/redo, save, close and reopen when the initial input succeeds.

## Expected and actual behavior

- Expected: the complete marker is inserted at the selected paragraph and the saved document reopens byte-for-byte as captured before save.
- Actual intermittent observations: synthetic typing sometimes stopped after a prefix such as `W1-WYSIWYG-` or `W1-WYSIWYG-AUD`; one repetition reopened with the final `i` inserted into front matter, consistent with automation focus/timing drift.
- Normal control: the same case passed in the final 8-worker full E2E suite, and its file-integrity/source/save path has passed earlier audit runs. All watcher-specific regressions pass independently and under parallel repetition.

## Reproduction and classification

- Related-set run: 1/1 truncated-input failure while the other 22 related tests passed.
- Isolated repeat: 1/3 passed; one truncated input and one reopen/focus mismatch.
- Final full-suite run: passed.
- Classification: automation/inconclusive, low impact; no confirmed product defect or severity is assigned.
- Rationale: the evidence is limited to synthetic input/focus control and has no demonstrated manual reproduction, crash, corruption or connection to the watcher repair.
- Next action: record and defer under the approved review policy. If revisited, first replace the synthetic typing seam with a deterministic editor action or collect a manual reproduction before proposing product changes.
