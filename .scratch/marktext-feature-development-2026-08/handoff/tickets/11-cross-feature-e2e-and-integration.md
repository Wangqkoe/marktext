# T11 — Cross-feature E2E and coordination-branch integration

Wave: 6 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: T03–T10

## Result

Add only end-to-end/integration evidence that exercises the composed product and
re-run proportional checks after every coordination-branch merge. No production
feature fixes belong here; failures return to their owner ticket.

Inputs: [V1 Spec](../v1-spec.md), [acceptance matrix](../acceptance-matrix.md).

## Ownership and boundary

Own new tests named `packages/desktop/test/e2e/workspace-transfer.spec.ts` and
`workspace-details-composition.spec.ts`, plus integration evidence under
`.scratch/marktext-feature-development-2026-08/handoff/evidence/`. Do not edit
production paths or tests owned by T03/T06/T10.

Cover Move/Open + dirty/untitled/last-tab/history, split + focused command routing,
restart/session partial salvage, watcher conflict/CAS observable behavior, endpoint
reload rejection, and details source/preview/theme/export while panes exist. State
which tests use deterministic adapters versus real Electron.

## Acceptance and handoff

Run `pnpm --filter marktext test:unit`, `pnpm --filter marktext test:e2e`,
`pnpm --filter marktext typecheck`, `pnpm lint`, and desktop build smoke if the
environment can build. Record each matrix status/evidence; no test skips without
reason. Manual composed workflow checks two panes plus Move/Open/details. Commit
only E2E/evidence. Independent terra/high Standards + Spec reviews classify every
failure and confirm integration did not weaken ownership/recovery behavior.
