# T12 — Windows trial, final independent review, and user acceptance

Wave: 7 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T11

## Result

Produce final acceptance evidence from a clean integrated Windows build and obtain
the two distinct final gates: independent Standards + Spec review, then user
Acceptance. This ticket changes only evidence/checklists; it does not fix code.

Inputs: [V1 Spec](../v1-spec.md), [acceptance matrix](../acceptance-matrix.md), all
prior ticket evidence.

## Ownership and boundary

Own only new files in `.scratch/marktext-feature-development-2026-08/handoff/evidence/`
and final matrix status updates. Never edit product code, prototypes, resolved
Issues or map under this ticket. Any defect gets a new owner ticket and blocks
completion when critical.

Record OS/version, Electron/build commit, install/build provenance, display count,
resolution/scale, hardware/input/accessibility context and observed results. Cover
Windows single-primary physical external release; verify unsupported/mixed-DPI
fallback disables detach but menu Move works. Exercise Move/Open, last tab,
dirty/untitled/history, split/restore, disk conflicts, details source/preview,
keyboard/theme/reduced motion/disableHtml/round-trip/export.

## Acceptance and handoff

On the coordination branch run matrix A01–A14 commands, `git diff --check`, and
clean status. Final review must be independent terra/high and explicitly report
Standards and Spec outcomes. All critical defects must be zero; `Untested` cannot
pass a required gate. Request user Acceptance only after review passes. Commit only
evidence/matrix changes, with no push.
