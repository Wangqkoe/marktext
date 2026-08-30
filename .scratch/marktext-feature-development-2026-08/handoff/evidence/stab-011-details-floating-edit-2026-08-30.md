# STAB-011 Details floating-edit evidence — 2026-08-30

## Disposition

STAB-011 is `Closed / Manual-retest Passed` for the existing raw-HTML Details
floating edit entry. The repair restores source/preview transitions through that
entry; it does not change Details disclosure behavior.

## Original failure and diagnostic evidence

From Details preview, the existing HTML-block floating-toolbar pencil entered
local source, but physical Escape did not return to preview. After manually using
Preview, the same floating edit entry could no longer visibly show source. Clicking
an outside paragraph immediately exits local source and leaves the disclosure in
an acceptable state; that behavior is accepted and was not changed.

The runtime memory probe on the old formal artifact `4669eeec` established that
the clicked target is the `i.icon` inside `.mu-preview-tools li.item.edit`, not a
new `.mu-details-source-action`. Physical Escape reaches the renderer root and
normally bubbles. The old toolbar route only called `setCursor`, bypassing
`HTMLBlock.enterSourceEditing()`. After Preview, the block retains
`mu-html-preview-mode`; using the floating edit entry again produces
`mu-html-preview-mode mu-active`, whose source is hidden by CSS.

## Minimal repair and review

Implementation commit `12e26548eac4ff0980b6527e738d4b848c07a78b` changes only
the PreviewToolBar HTML edit route (4 lines) and adds 22 lines of Desktop
regression coverage. The route now uses `block.enterSourceEditing()`; the
MathBlock route remains unchanged. The integration cherry-pick is
`57d2ae4d6435b157d3e82c5abc094167d5edb3c0`.

Independent review passed both axes: Standards `PASS` (0 blockers, 0 records)
and Spec `PASS` (0 blockers). The Spec review records that outside-paragraph exit
has no new dedicated test, but the repair does not touch that common path, so it
is non-blocking.

## Automated and artifact provenance

The independent validation tree at `12e26548` was clean. Desktop Details tests
passed 10/10; Muya Details tests passed 6/6. Product-file ESLint had 0 findings;
Desktop-test ESLint had 0 errors and two existing `no-non-null-assertion`
warnings (record only).

An initial package attempt at `57d2ae4d` was invalid: it reused stale
`packages/desktop/out`, and its `app.asar` SHA-256 was exactly the old
`4669eeec` artifact even though a Desktop run reported 9/10. That package is not
acceptance evidence. After removing the stale output and regenerating from the
target HEAD, Desktop passed 10/10 and inspection of the final `app.asar` directly
confirmed that the renderer bundle contains `block.enterSourceEditing()`.

Valid final artifact:

- Path: `C:\Users\1407\.codex\worktrees\98fa\Marktext\dist\t12-final-57d2ae4d6435b157d3e82c5abc094167d5edb3c0\win-unpacked`
- Contents: 131 files, 476,433,733 bytes.
- `marktext.exe` SHA-256: `31559389FB1ED274512EA277798A9D1FCC9A5D98226F194242ABFE0E4C6DD23E`.
- `resources\app.asar` SHA-256: `94384F8856BD3BA26CA53F39495DC880F4943FBD53D6C80BED43B894E49A8D4E`.
- `icudtl.dat` SHA-256: `C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.

## Final manual retest

On 2026-08-30, the same final artifact with fresh profile
`marktext-stab011-final-57d2ae4d-manual-01` passed all six observations:

1. The floating pencil first enters source.
2. Physical Escape returns to collapsed preview.
3. The same floating entry enters source again.
4. Preview returns to preview.
5. The same floating entry enters source again.
6. Clicking `Outside paragraph for Escape ownership.` immediately exits source
   while the collapsed disclosure state remains.

The user confirmed: “全部符合预期”.

## Records and boundaries

Screen-reader behavior, PDF visual inspection, the full T12/manual matrix, and
final Review/Acceptance are not claimed by this scoped retest. The old `4669`
evidence directory was not changed.
