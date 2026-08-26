# T05 TabTransfer WAL/MoveRecovery integration evidence — 2026-08-25

## Integration and review

T05 branch: `codex/t05-tab-transfer-wal-recovery-core`.
Integration baseline: `4728129a0790b2def5e96a22172746e0fff6750b`.
Final integrated HEAD: `3d6790cf5397dfde9b8dafbd92c0f63d3cba0a6a`.

The four local T05 commits are:

1. `02cb5e5833151a8c7659ffd093dcbe4faefd1e05` — initial core.
2. `1c134563f13cd07b7f9a23da375fa08b0abc583d` — recovery hardening.
3. `24486754e4ad2bb4821e7cd68d676a17bc6b7aa3` — identity, single-flight,
   and ACK-loss gaps.
4. `3d6790cf5397dfde9b8dafbd92c0f63d3cba0a6a` — final recovery races.

Independent terra/high Standards and Spec reviews both finished `Passed` with
zero blocking findings. This was the final result after three rounds of
blocking review findings and repair; the intermediate failures are historical
review context, not current failed gates.

The integrated T05 scope is limited to
`packages/desktop/src/main/tabTransfer/index.ts`, `memory.ts`, `types.ts`, and
the three exact unit specs:

- `packages/desktop/test/unit/specs/tab-transfer-core.spec.ts`
- `packages/desktop/test/unit/specs/tab-transfer-recovery.spec.ts`
- `packages/desktop/test/unit/specs/tab-transfer-emergency-recovery.spec.ts`

No IPC, windows, preload, renderer, menu, E2E, normal workspace restore, or
CrashDraftRecovery wiring is claimed. T05 remains the MoveRecovery/WAL core;
production Electron integration remains T06 scope.

## Precisely confirmed commands and results

All commands below were run in the Windows local T05 worktree at the final
integrated commit. No retained trace artifact was produced; the console result
is the evidence artifact for each command.

| Evidence | Status | Exact command, environment, result, artifact/trace |
| --- | --- | --- |
| T05 core/recovery/emergency unit suite | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts`; Windows local T05 worktree; 3 files / 32 tests passed, exit 0; console evidence, no retained trace. |
| T05 typecheck | Passed | `pnpm -C packages/desktop typecheck`; Windows local T05 worktree; exit 0; console evidence, no separate artifact. |
| T05 scoped ESLint | Passed | `pnpm -C packages/desktop exec eslint src/main/tabTransfer/index.ts src/main/tabTransfer/memory.ts src/main/tabTransfer/types.ts test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts`; Windows local T05 worktree; exit 0; console evidence, no retained trace. The only output was the `MODULE_TYPELESS_PACKAGE_JSON` performance warning, recorded as a non-blocking item. |
| Integrated diff check | Passed | `git diff 4728129a0790b2def5e96a22172746e0fff6750b...3d6790cf5397dfde9b8dafbd92c0f63d3cba0a6a --check`; Windows local T05 worktree; exit 0; console evidence, no retained trace. |

## Implementation and test coverage

The evidence covers WAL `intent`/`observed`, capsule digest with independent
salvage identity, revision fence, idempotency, epoch capability, source-dead
forward recovery, reserve → fsync migration → materialize, complete endpoint
reuse, durable abort, per-transfer attempt single-flight with public pending
separation, the real command-applied/ACK-lost/restart five-stage matrix,
corruption, last-tab behavior, and the unique-owner invariant.

One non-blocking review record item remains: Memory capability validation
authenticates the endpoint that receives the command but does not re-check the
other endpoint's current epoch from the capability. No observable ownership
risk is present in this core; the T06 production IPC adapter must make and
verify this semantic choice explicitly.

T05 does not claim CrashDraftRecovery, production Electron wiring, or normal
workspace restore.
