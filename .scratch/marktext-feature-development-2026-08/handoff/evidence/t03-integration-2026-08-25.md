# T03 integration evidence — 2026-08-25

This report records evidence inherited by the local integration of commit
`1aa17aac6da3ef23610067b7f264bb38a835da4e`. The execution record is
[codex task 01a03965-378c-7060-a2fa-bd43333e6256](codex://threads/01a03965-378c-7060-a2fa-bd43333e6256).

## Environment and provenance

- Verified implementation commit: `1aa17aac6da3ef23610067b7f264bb38a835da4e`.
- Verification environment: Windows Electron for E2E and Node/Vitest for unit
  tests, from the same-SHA verified task worktree.
- The integration worktree had no `node_modules`, so repeating dependency-backed
  commands there was **Unavailable**. Integration was fast-forward-only to the
  same verified SHA; this is evidence inheritance, not a code-test failure.

## Precisely confirmed commands and results

| Area | Exact command | Environment | Result |
| --- | --- | --- | --- |
| A03 split Electron proof | `pnpm -C packages/desktop exec playwright test test/e2e/split-workspace.spec.ts` | Windows Electron/Playwright | **Passed** — 4/4 |
| Workspace runtime | `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts` | Node/Vitest | **Passed** — 42/42 |
| DocumentIO/coordinator/routing | `pnpm -C packages/desktop exec vitest run test/unit/specs/document-io-coordinator.spec.ts test/unit/specs/document-io-electron-adapter.spec.ts` | Node/Vitest | **Passed** — 17/17 |
| Typecheck | `pnpm -C packages/desktop typecheck` | Node/TypeScript | **Passed** |
| Desktop build | `pnpm -C packages/desktop build` | Node/build toolchain | **Passed** |
| Diff check | `git diff --check` | Git | **Passed** |

The A03 proof covers two independent pane compositions against one Controller,
focused-pane command isolation, and split geometry/focus cases.

## Evidence that remains a record item

The task record reports source/#781 regression 9/9, tab history/caret/scroll
3/3, and auto-focus/body/blank/overflow 4/4. Their exact test-selection
commands cannot be recovered from the retained record, so these aggregate items
are **Untested** record items here and are not Passed gates. The broad legacy tabs
history helper uses `getMarkdownContent` and can perturb history through
repeated Source round-trips; authoritative no-perturbation Item 252 passed.

Other known non-blocking records are the close-saved zero-tab expectation versus
V1's all-empty clean New Tab rule, 39 existing workspace-runtime formatting lint
errors, 7 baseline warnings, the existing Vite dynamic-import warning, and the
focused `tabs.vue` wrappers' Duplicated Code judgment call.
