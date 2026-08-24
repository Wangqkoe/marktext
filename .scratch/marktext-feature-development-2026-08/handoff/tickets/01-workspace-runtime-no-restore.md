# T01 — Workspace runtime foundation (normal restore off)

Wave: 1 · Risk/model: high — `gpt-5.6-terra` / `high` · Depends on: V1 Spec, [启动常规恢复与紧急恢复边界](../../issues/12-define-startup-restore-emergency-recovery-boundary.md)

## Result

Create the deep deterministic WorkspaceController runtime: typed command/result/
projection/EditorLease contract, pane/view/document invariants, ports/interfaces,
deterministic memory adapters, DefaultStartupPolicy, typed CrashDraftRecovery and
MoveRecovery boundaries plus a unified emergency-scan input. The runtime works without a normal workspace session,
codec, or `load()`: no explicit StartupIntent produces one clean New Tab, explicit
intent seeds/opens only requested targets. It does not wire current Vue editor,
file observation, Electron startup, normal restore, settings, or transfer.

Inputs: [V1 Spec](../v1-spec.md); [Issue 04](../../issues/04-design-pane-scoped-workspace-model.md);
[Issue 11](../../issues/11-design-workspace-controller-interface.md); and
[Issue 12](../../issues/12-define-startup-restore-emergency-recovery-boundary.md).

## Ownership and boundary

Create `packages/desktop/src/shared/workspace/{types.ts,startup.ts,index.ts}` for
runtime/startup types and `packages/desktop/src/renderer/src/workspace/` for the
controller, ports and memory adapters. Create exact tests
`packages/desktop/test/unit/specs/{workspace-runtime,workspace-startup-policy}.spec.ts`.
Main imports shared types only; it must never import renderer. Do not edit existing
`store/editor.ts`, `components/editorWithTabs/*`, `src/main/*`, preload,
`editorBufferStore`, preference schema/UI, or a normal session codec/store.

NormalWorkspaceRestore's future normal snapshot/store and codec are separate from
emergency safety truth. T01 defines memory substitutes for CrashDraftRecovery and
MoveRecovery, but does no production persistence. Its CrashDraft substitute models
stable Document identity; saved FileKey/DiskRevision baseline; versioned,
digest-checked envelope; monotonic document revision; durable-ACK-before-advance;
and interrupted/corrupt-latest fallback to the last valid revision, including stale
ACK rejection. This is a deterministic atomicity simulation, never filesystem I/O.
T02 is retained only as an intermediate migration; T02b owns production
PaneEditorAdapter, controller composition and the one-way projection mirror. T04 owns production file observation/save work; T05 owns only
MoveRecovery; T06 owns production CrashDraftRecovery store/lifecycle, clean-shutdown
boundary, and both-source Electron scanning.
Do not resurrect normal restore from `codex/workspace-restore-option@7636e01a` or
merge its Controller wholesale.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts test/unit/specs/workspace-startup-policy.spec.ts`,
`pnpm -C packages/desktop typecheck`, and `git diff --check`. Tests cover
two-pane/path invariants, stale lease/capability rejection, immutable projection,
no-target clean New Tab, explicit-target-only seed, unified scan of both emergency
inputs, and no normal snapshot/codec/load call. They distinguish a dirty saved or
untitled CrashDraft input from a MoveRecovery input and prove memory monotonicity,
atomic durable-ACK behavior, stale-ACK rejection, and corrupt/interrupted latest
fallback without discarding the last valid draft.

Regression: existing unit suite. Commit only new runtime/shared module/tests.
Independent terra/high Standards and Spec reviews are required before T02b/T05 use
the interface; reviewers verify no ambient global-state or implicit normal restore.
