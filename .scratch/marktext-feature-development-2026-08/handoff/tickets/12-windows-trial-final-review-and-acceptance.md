# T12 — Windows trial and readiness evidence

Wave: 10 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T11

## Result

**Completed / Accepted (2026-08-30).** The independent final audit passed with 0
blockers and active P0/P1 is 0. The final artifact, narrow same-artifact
inheritance exception, remaining unclaimed rows, and local-only disposition are
recorded in [T12 final acceptance evidence](../evidence/t12-final-acceptance-2026-08-30.md).
The historical readiness evidence below remains evidence for its recorded scope;
it is not rewritten as a blanket manual-matrix pass.

Produce clean-build and Windows-trial readiness evidence for the coordination
task. It neither organizes independent review nor requests or announces user
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
dirty/untitled/history, live split behavior, disk conflicts, details source/preview,
keyboard/theme/reduced motion/disableHtml/round-trip/export.

Also record that normal restart creates one clean New Tab, explicit associated/CLI
launch opens only its target(s), no unavailable restore setting is visible, and
dirty normal-exit save/discard/cancel confirmation is unchanged. Under default-off,
force crash/power loss after dirty saved and untitled edits to show CrashDraftRecovery,
then separately exercise MoveRecovery; explicit targets must not suppress either.
Verify clean exit does not restore old tabs/split and no-restore launch leaves legacy
normal `editorBufferStore` data intact. Record a CrashDraft corrupt-latest fallback
warning and changed-disk conflicted recovered copy where fault/environment evidence
permits. Do not treat ordinary workspace state as recovery evidence.

## Acceptance and handoff

The final audit and Acceptance disposition are recorded in the linked final
evidence. It preserves `Untested` labels for unclaimed environments and permits
only the documented narrow inheritance exception; it does not convert all matrix
rows to `Passed`. This ticket's changes remain evidence/matrix only, with no push.
