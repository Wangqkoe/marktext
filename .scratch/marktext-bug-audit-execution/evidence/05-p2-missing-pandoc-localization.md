# Candidate evidence record: `05-P2-missing-pandoc-localization`

## Identity and environment

- Observed: 2026-08-23, America/Los_Angeles.
- Git commit: `f16e121f` (product baseline `d213fc75`).
- Windows 11 Pro 10.0.26200 x64; MarkText `0.20.0-rc.1`; Electron 42.1.0.
- `Get-Command pandoc.exe, pandoc` returned no command. Pandoc was not installed or substituted.
- Profile mode: two fresh isolated profiles under `C:\Users\1407\AppData\Local\Temp\marktext-ticket05-m5-import-manual-12984b42b32a4372aec2b5db800eaca4` and `C:\Users\1407\AppData\Local\Temp\marktext-ticket05-m5-import-repeat-manual-e252e20d1fe045b493d18dee1bcdfe0e`.

## Input and controlled clean state

- Each profile opened a saved controlled Markdown document and invoked the real File → Import menu path. No import source was selected because the main-process import action checks for Pandoc and notifies before opening the file dialog.
- The user did not install Pandoc or follow the notification's external-link confirmation.

## Expected and actual behavior

- Expected basis: missing Pandoc must produce a user-readable dependency warning; `packages/desktop/src/main/menu/actions/file.ts` explicitly supplies localized `dialog.importWarning` and `dialog.installPandoc` strings to the renderer notification.
- Actual manual evidence, trial 1: the missing-dependency notice appeared, but its title and body were literal `dialog.importWarning` and `dialog.installPandoc`; it offered notification `×` and `√` controls. Dismissing it with `×` left the editor running and able to hold `M5-EDITOR-USABLE-MARKER-12984B42` as unsaved content.
- Actual manual evidence, trial 2: a fresh profile invoking the same Import path displayed the same two raw keys.
- Conversion did not occur and remains unavailable as required because Pandoc is absent.

## Reproduction and classification

- Attempts/failures: `2/2` fresh profiles.
- Catching checklist: verify Pandoc absence → File → Import → record title/body → avoid confirmation/install action.
- Severity: P2. The optional feature fails safely and the editor stays usable, but the missing-dependency warning is not intelligible to end users.
- Final disposition: confirmed deterministic.
- Next action: Ticket 06 should specify a localized-notification regression at the renderer notification/i18n seam; no repair is made in this audit ticket.
