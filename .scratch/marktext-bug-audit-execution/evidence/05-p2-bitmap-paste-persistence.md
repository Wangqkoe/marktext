# Candidate evidence record: `05-P2-bitmap-paste-persistence`

## Identity and environment

- Observed: 2026-08-23, America/Los_Angeles.
- Git commit: `f16e121f` (product baseline `d213fc75`).
- Worktree state before evidence edits: only unrelated untracked `CONTEXT.md`.
- Windows 11 Pro 10.0.26200 x64; MarkText `0.20.0-rc.1`; Electron 42.1.0.
- Profile mode: two fresh isolated profiles under `C:\Users\1407\AppData\Local\Temp\marktext-ticket05-m3-bitmap-manual-9c5d9182bd094583bbf62e5674e712e1` and `C:\Users\1407\AppData\Local\Temp\marktext-ticket05-m3-bitmap-repeat-manual-f1847e45534442ddb7f61f957d2fa03a`.

## Input and controlled clean state

- Controlled PNG: four colored quadrants, black-and-white target, and red triangle; source SHA-256 `D607765BD9A4206F6B3EA51BFB6F69A5DFA1E58A74D6EF2C77E289FF027DD4DB`.
- Both profiles were preconfigured from the project default preferences with `imageInsertAction: folder`, `imagePreferRelativeDirectory: true`, `imageRelativeDirectoryBase: file`, and `imageRelativeDirectoryName: assets`.
- Each saved controlled Markdown document was opened in its own profile. The PNG was opened in Paint, selected with `Ctrl+A`, copied with `Ctrl+C`, then pasted at the marked editor paragraph with `Ctrl+V`.

## Expected and actual behavior

- Expected basis: the configured folder action with relative directory means binary clipboard images should be persisted to the document's `assets` directory and inserted with an `assets/` relative Markdown reference. This is the image-paste contract in `packages/desktop/test/PARITY_QA.md` § PG5 and the project image-action policy.
- Actual application evidence, trial 1: the editor buffer contained exactly one `data:image/png;base64,...` reference; no `assets/` reference or asset file existed. Decoding the data URL produced 1,262,886 PNG bytes, SHA-256 `406A39B346ECEA43DAF5AFA1503B08998A17C85D6566028182C0985FA247D00C`.
- Actual application evidence, trial 2: the same configuration and manual clipboard sequence produced exactly the same data URL form and decoded SHA-256; again zero asset files and zero relative-asset references.
- The image rendered in both user-operated editors. The issue is persistence-policy noncompliance, not bitmap delivery failure.

## Reproduction and classification

- Attempts/failures: `2/2` fresh profiles.
- Catching checklist: Paint select-all/copy → MarkText paragraph paste → profile buffer, Markdown-reference, decoded-byte hash, and `assets` directory inspection.
- Severity: P2. The bitmap remains embedded and viewable, but a configured portable-assets policy is silently ignored, producing an oversized nonportable data URI instead of the requested on-disk asset.
- Final disposition: confirmed deterministic.
- Next action: Ticket 06 should specify a test-first remediation at the binary clipboard image-action seam; no repair is made in this audit ticket.
