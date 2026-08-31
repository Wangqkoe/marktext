# T11 — Cross-feature E2E and coordination-branch integration

Wave: 9 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T03–T10,
including T04b and T02 production completion

## Result

T06's automated integration prerequisite is now satisfied and T11 is unblocked
to proceed. T11 is not complete: it still owns composed dual-surface/E2E
evidence, temporary-fallback removal, and its stated integration checks.

Add only end-to-end/integration evidence that exercises the composed product and
re-run proportional checks after every coordination-branch merge. No production
feature fixes belong here; failures return to their owner ticket.

Inputs: [V1 Spec](../v1-spec.md), [acceptance matrix](../acceptance-matrix.md).

## Ownership and boundary

Own new tests named `packages/desktop/test/e2e/workspace-transfer.spec.ts` and
`workspace-details-composition.spec.ts`, plus integration evidence under
`.scratch/marktext-feature-development-2026-08/handoff/evidence/`. Do not edit
production paths or tests owned by T03/T06/T10; T06 owns
`workspace-startup-policy.spec.ts`, which T11 runs as an integration prerequisite.

Cover Move/Open + dirty/untitled/last-tab/history, split + focused command routing,
the T04b coordinator/typed transport path through the composed product,
CrashDraftRecovery force-kill/power-loss recovery for dirty saved and untitled
content, CrashDraft corrupt-latest fallback warning and DiskRevision-conflicted
recovered copy, MoveRecovery partial salvage, watcher conflict/CAS observable behavior,
endpoint reload rejection, default-off ordinary restart, explicit-file-only startup
in parallel with both emergency sources, absent restore setting, unchanged dirty
save/discard/cancel exit, clean-exit no restore, retained legacy normal snapshot
data, and details source/preview/theme/export while panes exist. State
which tests use deterministic adapters versus real Electron.

## Current status — 2026-08-31

T11 composed integration evidence is complete for the automated scope: workspace
unit 8 files / 123 tests and related Electron E2E 64/64 passed; Standards and
Spec review both PASS. No residual processes, profiles, or harness remain.
Physical Windows right-tab split drag and drag-out-of-window Move remain pending
manual user Acceptance.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec playwright test test/e2e/workspace-transfer.spec.ts test/e2e/workspace-details-composition.spec.ts`,
`pnpm -C packages/desktop exec playwright test test/e2e/workspace-startup-policy.spec.ts`,
`pnpm -C packages/desktop test:unit`, `pnpm -C packages/desktop typecheck`,
`pnpm lint`, and `pnpm -C packages/desktop build` when the environment can build. Record each matrix status/evidence; no test skips without
reason. Manual composed workflow checks clean restart, explicit-file-only launch,
CrashDraft and Move recovery under default-off, dirty-exit decisions, retained
legacy normal data, two panes plus Move/Open/details. Commit
only E2E/evidence. Independent terra/high Standards + Spec reviews classify every
failure and confirm integration did not weaken ownership/recovery behavior.
