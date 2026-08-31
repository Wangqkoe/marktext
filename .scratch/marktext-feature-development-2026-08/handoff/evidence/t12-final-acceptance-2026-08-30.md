# T12 final acceptance evidence — 2026-08-30

## Current decision

T12 is **reopened: final-candidate generation and same-package regression are
pending**. The `Completed / Accepted` conclusion below remains the accurate
historical result for the `57d2ae4d` artifact, but it is not the current final
acceptance state. A newly reported P1, [STAB-012](stab-012-recovery-startup-close-2026-08-30.md), found that this old final package created both a recovery
window and an extra ordinary window after a no-target CrashDraft restart. The
user also observed unconfirmed disappearance/abnormal close behavior for its
Recovered Draft. Its production repair `810db72d` is integrated at `85e5b61e` and
has passed ticket-level automation, independent review, and isolated manual
retest. That retest package is not a final candidate built from `85e5b61e`.

Do not claim T12 as currently Accepted, the old artifact as current-final, or
the STAB-012 retest as a complete matrix round. Generate a traceable Windows
package from `85e5b61e` (or a later documentation-only descendant), then complete
the final-candidate/same-package regression gates before a new final review or
Acceptance. This remains local-only; no push or publication is authorized.

## Historical accepted decision

T12 was `Completed / Accepted` for the previous stabilization round. The
independent final audit passed with 0 blockers. The audited integration tree was
clean at `6fdb3ac3`; its product head was
`57d2ae4d6435b157d3e82c5abc094167d5edb3c0`, and later commits were documentation
only. Active P0/P1 was 0 at that time.

## Final artifact and evidence index

The formerly effective final Windows unpacked artifact was the STAB-011 artifact:

- Path: `C:\Users\1407\.codex\worktrees\98fa\Marktext\dist\t12-final-57d2ae4d6435b157d3e82c5abc094167d5edb3c0\win-unpacked`
- Contents: 131 files, 476,433,733 bytes.
- `marktext.exe` SHA-256: `31559389FB1ED274512EA277798A9D1FCC9A5D98226F194242ABFE0E4C6DD23E`.
- `resources\app.asar` SHA-256: `94384F8856BD3BA26CA53F39495DC880F4943FBD53D6C80BED43B894E49A8D4E`.
- `icudtl.dat` SHA-256: `C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.

The final Details delta, regenerated-package provenance, automatic checks, and
fresh-profile manual 6/6 are recorded in [STAB-011 evidence](stab-011-details-floating-edit-2026-08-30.md).
Historical Windows build-readiness automation is retained at [T12 readiness
evidence](t12-windows-trial-readiness-2026-08-27.md), while its manual rows keep
their recorded, unclaimed status.
Earlier scoped manual/automatic evidence remains indexed by the stabilization
[triage queue](../../../marktext-workspace-stabilization/triage-queue.md) and
[manual regression matrix](../../../marktext-workspace-stabilization/manual-regression-matrix.md).
The STAB-012 repair and its intentionally limited manual replay are in
[STAB-012 evidence](stab-012-recovery-startup-close-2026-08-30.md); they reopen,
rather than satisfy, the current final-candidate gate.

## Stale-package rejection and narrow inheritance rule

The initial `57d2ae4d` package reused stale `packages/desktop/out`: its
`app.asar` hash exactly matched the old `4669eeec` artifact despite a reported
Desktop 9/10. It was rejected and is not acceptance evidence. The output was
regenerated from target HEAD; the final artifact passed Desktop Details 10/10 and
its renderer bundle directly contains `block.enterSourceEditing()`.

The product delta from `4669eeec` to `57d2ae4d` is fixed and independently
reviewed: four PreviewToolBar HTML-edit route lines plus the corresponding
regression test. It does not touch startup, file I/O, window close, Move, Open,
Split, recovery, or IPC. Therefore evidence for those untouched paths on the old
artifact is inherited only for this fixed delta, while every affected Details
gate was rerun on the proven target package (including the final manual 6/6).

This is a strict, narrow exception to an otherwise same-artifact manual matrix:
inheritance is allowed only when all of the following are true: the delta is
fixed and independently reviewed as local; target-package provenance proves the
new code is present; and every affected gate is rerun on that target package. It
does not authorize general cross-package reuse or turn untested rows into passes.

## Remaining records and unclaimed boundaries

The following are not claimed as passed by this closeout: screen-reader behavior,
PDF visual inspection, real power-loss, remote/assistive input, and mixed-DPI or
multi-display physical operation. V1 disables unsupported external drag there and
retains menu Move. STAB-005 and STAB-009 remain deferred/P2 records. Existing
lint warnings and the workflow's specific `out`/`asar` wording are P2 records.

The independent final audit classified these as non-blocking records at the time.
The later STAB-012 P1 report is distinct: it reopens the final-candidate gate and
invalidates the old artifact for current final acceptance.

## Commit relationship

`12e26548eac4ff0980b6527e738d4b848c07a78b` is the STAB-011 implementation;
`57d2ae4d6435b157d3e82c5abc094167d5edb3c0` is its integration cherry-pick;
`e21b77c6aa30e75129c1ef2f43ec22c0e25bfcf1` records STAB-011 evidence; and the
audited `6fdb3ac3` integration tree adds documentation only after the product
head.
