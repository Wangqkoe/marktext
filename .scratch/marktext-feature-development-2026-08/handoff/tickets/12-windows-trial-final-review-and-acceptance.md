# T12 — Windows trial and readiness evidence

Wave: 10 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T11

## Result

**Current status — automated evidence complete; final user Acceptance pending
(2026-08-31).** The current package at
`C:\Users\1407\.codex\worktrees\bc8b\Marktext\dist\win-unpacked` was built from
production commit `e223b0e3dd554b11a730f675eee2834961412d17`. Integrated
`82dd4cf0d0d6d4b71c20d496bf31ac8726bcdb09` contains only test formatting and is
not package provenance. Packaged R1–R5, related E2E 64/64, typecheck, build and
scoped lint (0 errors / 63 warnings) passed; Standards and Spec passed. Physical
Windows right-tab split drag and drag-out-of-window Move remain pending final
user Acceptance.

**Completed / Accepted — final candidate and same-package regression passed
(2026-08-30).** The accepted Windows candidate was built from source HEAD
`f6dcf9dbb949a972c4d3609294b858ab2d46b1d0` at
`C:\Users\1407\.codex\worktrees\dbc4\Marktext\dist\t12-final-f6dcf9db\win-unpacked`.
Its packaged black-box gate covered normal no-target startup/exit and the
CrashDraft checkpoint → exact forced termination → no-target recovery → Discard
→ tombstone → exact-PID exit path. The user then completed the same-package
native recovery/close trial: one window, recovered marker, real
Save/Don't Save/Cancel, Cancel retention, Don't Save discard, and full process
exit. Coordination-machine inspection matched draft revisions 2–7, the commit
record, the revision-7 discarded tombstone, `clean-shutdown=true`, and zero exact
candidate/profile processes. Independent final audit task
`01a05600-a111-71d1-952e-f79e64ebe20d` returned `PASS` with 0 blockers and found
the recorded same-package evidence sufficient to close T12. See [T12 final
acceptance evidence](../evidence/t12-final-acceptance-2026-08-30.md) and
[STAB-012 evidence](../evidence/stab-012-recovery-startup-close-2026-08-30.md).

The prior `57d2ae4d` acceptance and subsequent STAB-012 reopening remain
historical evidence only. They are not the identity or disposition of the final
accepted candidate, and no untested platform or assistive-technology row is
converted to `Passed`.

The coverage list below is retained as the historical T12 input. The final audit
disposition separates the accepted supported/local A14 gate from supplementary
unclaimed environments; see the linked final evidence and acceptance matrix.

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

The current final audit/Acceptance disposition, exact candidate identity,
same-package automatic and manual evidence, and historical reopening lineage are
recorded in the linked final evidence. Screen-reader, PDF visual, real power-loss,
remote/assistive, and mixed-DPI/multi-display physical operation retain their
recorded `Untested`/`Unavailable` boundaries. This ticket changes evidence and
status documents only; it does not authorize publication or a push.
