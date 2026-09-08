# WYSIWYG scroll phase cleanup ledger

Date: 2026-09-08 (America/Los_Angeles)

Status: **Git registrations and merged phase refs were cleaned; protected application state is unchanged. Filesystem package/install cleanup is retained as an explicit residual because the authorized PowerShell mutation was rejected before execution.** No uninstaller was run.

## Recovery archive

Before removing any Git registration or branch, cleanup created and verified:

- bundle: `C:\Users\1407\.codex\artifacts\marktext-t05-6a3dc45-repaired-20260907-01\cleanup\wysiwyg-scroll-phase-refs-20260907.bundle`;
- bytes: `92,087,664`;
- SHA-256: `4fa228619b35d5921b8ca35828fb2d3becd67a86b621422947025250d393d925`;
- heads: 18, comprising all 17 `codex/wysiwyg-scroll-*` branch tips and detached T06 evidence commit `35f93b483942f5dc4bc4d57aa932120ad23ebcb0`; and
- verification: `git bundle verify` returned 0 and `git bundle list-heads` returned all 18 expected refs.

The retained verification files are `bundle-verify.log` (SHA-256 `992f5df37b279fd3abf6f032139067b4a4fb393ddf5f737099dac4a3285872e2`) and `bundle-heads.txt` (SHA-256 `b65ecbbdc84877c520684f1d8b356afd1664bc4d11bde0f4cc6b2141347fc8ea`) beside the bundle. The temporary local `refs/archive/...` ref used to name the detached commit was deleted only after verification.

The before and after machine-readable inventories are also retained there:

- `cleanup-before.json`: 23,874 bytes; SHA-256 `2eee93ba2d89323c64386e3bea0b01c7602bc83685ff0e3329c0b7d00648593e`.
- `cleanup-after.json`: 18,066 bytes; SHA-256 `ab430454679e003535c430c7d02335b6aed2e74b866666f0c95e8eb86f68333a`.

The before inventory's `Files` field is `1` for six multi-file protected trees because the `Measure-Object` result was inadvertently counted as a one-element array. Its byte totals and sorted path/length/mtime metadata SHA-256 values are valid. The after inventory contains the correct file counts, and all seven byte totals and metadata hashes match the before inventory.

## Protected state

Immediately before mutation, all 23 association query results matched `associations-before.json` byte-for-byte, all four relevant uninstall entries were captured, both production shortcuts were hashed, and there were zero processes whose exact executable path was below `C:\Users\1407\.codex\installed\marktext-t05-*`.

The final check proved:

- all 23 association targets still match the reference, with zero mismatches;
- the production uninstall entry `80b8d59a-8e25-5f52-8f55-48f4c6ccbd23`, repaired entry `6046d1a6-e89d-5a5a-b212-28bbc5652f25`, and two retained old T05 entries have zero before/after differences;
- the desktop and Start Menu shortcut hashes have zero before/after differences;
- the daily install, daily profile, repaired install, repaired package, retained profiles, fixture and registry-backup trees have identical byte totals and metadata hashes;
- zero exact T05 executable processes were present after cleanup; and
- no uninstaller, installer, application executable, `taskkill`, file-association write or profile write was invoked.

The retained repaired installer remains:

`C:\Users\1407\.codex\artifacts\marktext-t05-6a3dc45-repaired-20260907-01\package\marktext-scroll-acceptance-t05-repaired-6a3dc45-win-x64-0.20.0-rc.1-setup.exe`

Its final SHA-256 is the required `f63370247302b3350b3c729695bb33a542484e9bb03ed432e78d5360a83dc8a3`. The complete repaired artifact root, repaired installation at `C:\Users\1407\.codex\installed\marktext-t05-6a3dc45-repaired`, its uninstall entry, profiles, fixture, logs, registry backups, ZIP and `win-unpacked` tree are retained.

The daily installation at `E:\Users\1407\AppData\Local\Programs\marktext`, daily profile at `C:\Users\1407\AppData\Roaming\marktext`, production uninstall entry and production shortcuts were not touched.

## Git cleanup

The before inventory contained these 14 registered phase worktrees. Each had a clean normal status and no ordinary untracked files; each contained ignored `node_modules`. The detached `1f4a` T06 task directory had already disappeared as an application-archive side effect before this before snapshot, and commit `35f93b48` was included in the bundle before stale metadata was pruned.

| Worktree | HEAD | Final-coordinate ancestor | Git registration after cleanup | Filesystem result |
| --- | --- | --- | --- | --- |
| `3d9b` | `d9c97636` | yes | absent | residual directory |
| `4303` | `16ae5c96` | no; patch-equivalent commit is upstream | absent | residual directory; first removal reported `Filename too long` |
| `4476` | `b60dd577` | yes | absent | residual directory |
| `6078` | `175cf2e5` | yes | absent | residual directory |
| `629b` | `bd293146` | yes | absent | residual directory |
| `6f84` | `f15604ca` | yes | absent | residual directory |
| `7669` | `8eba102d` | no; patch-equivalent commit is upstream | absent | residual directory |
| `7c0a` | `1de76b87` | yes | absent | residual directory |
| `8b95` | `0ca7237c` | no; patch-equivalent commit is upstream | absent | residual directory |
| `8ed5` | `a1e7cf8a` | no; patch-equivalent commits are upstream | absent | residual directory |
| `cb6b` | `f20ed395` | yes | absent | residual directory |
| `d1b3` | `303dfa39` | yes | absent | residual directory |
| `scroll05` | `ecf2d2c2` | yes | absent | residual directory |
| `scroll05-package2` | `b35f7225` | yes | absent | residual directory |

`git worktree list` now contains exactly the three protected worktrees: the formal repository at `E:\Program Files\Marktext`, this coordinating `d3af` worktree, and `E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08`.

The initial `4303` removal removed Git administration and then returned:

```text
error: failed to delete 'C:/Users/1407/.codex/worktrees/4303/Marktext': Filename too long
```

The remaining removals used `git -c core.longpaths=true worktree remove`. They returned 0 and removed all Git registrations, but final `Test-Path` checks corrected the earlier progress reporting: **zero of the 14 filesystem directories was completely deleted**. Every directory remains without `.git`; `3d9b` and `4303` retain `node_modules`, `packages`, `scripts` and four top-level package/readme files, while the other twelve retain `node_modules` and `packages`. No reclaimed-byte total is claimed.

Thirteen branch tips that are ancestors of `1fa46c7277b42b1ef53035a5eb928b652e9fe309` were deleted with `git branch -d`: both T03 refs, all three T05 refs, all four T06 refs and all four T07 refs. Four non-ancestor phase refs remain because cleanup did not force-delete them:

- `codex/wysiwyg-scroll-01-idle-commit` at `16ae5c96`;
- `codex/wysiwyg-scroll-02-view-transitions` at `0ca7237c`;
- `codex/wysiwyg-scroll-02-view-transitions-repair` at `a1e7cf8a`; and
- `codex/wysiwyg-scroll-04-programmatic-final` at `8eba102d`.

`git cherry` marked their commits `-`, showing patch-equivalent changes upstream, and the verified bundle provides a second recovery path. They remain only because `git branch -d` cannot remove non-ancestor tips and cleanup did not use force.

## Filesystem and registry cleanup residual

The authorized deletion set was exactly:

- old installs `C:\Users\1407\.codex\installed\marktext-t05-ef5a10d` and `C:\Users\1407\.codex\installed\marktext-t05-ef5a10d-safe`;
- their exact uninstall keys `5db268dd-accd-5303-98ab-479c4b2bad30` and `41bf11fe-a9a0-5b02-8a88-95cceca372d9`; and
- only the `package` subdirectories below old artifact roots `marktext-t05-ef5a10d-20260907-01`, `-02` and `-03`.

The five filesystem targets contained 3,282,768,437 bytes in the before inventory. Their resolved absolute paths were inside the exact allowed installed/artifact roots, none of the target roots was a reparse point, both registry identities matched their exact DisplayName/Icon/uninstall path, and no T05 executable process was running. The single PowerShell mutation request was rejected before `CreateProcess`, so none of it executed. The returned text was:

```text
Script error:
exec_command failed: CreateProcess { message: "Rejected(\"...3230 chars truncated...\" rejected: blocked by policy)" }
```

The tool exposed no reason more specific than `blocked by policy`; the elided portion was the already-validated PowerShell command that would have called `Remove-Item -LiteralPath -Recurse -Force` on the five exact paths, then `Remove-Item` on the two exact registry keys. Cleanup did not retry through another deletion mechanism. Therefore the actual result is **0/5 authorized filesystem targets deleted, 0/2 old uninstall keys deleted, and 0 of their 3,282,768,437 candidate bytes claimed reclaimed**. All old root-level logs, raw JSON, profiles and manifests also remain.

## Retained evidence and pending work

All existing Markdown reports, raw JSON, build/install/regression logs, registry exports, manifests, fixtures and physical-test recording references remain. The raw evidence keeps historical runtime paths intentionally; the durable checked-in copy is now below `C:\Users\1407\.codex\worktrees\d3af\Marktext\.scratch\wysiwyg-scroll-performance\evidence`.

The completed application task titled `启动 T06 物理滚动条验收` was archived by the coordinator; its data remains recoverable, and detached evidence commit `35f93b48` is in the verified bundle.

No product development was performed during cleanup. The Source 50k capacity defect remains only as recorded in [Ticket 06](../issues/06-investigate-source-large-document-capacity.md) and its evidence; Opened Files scale pressure/startup delivery remains only as recorded in [Ticket 07](../issues/07-investigate-opened-files-scale-pressure.md) and its evidence. This cleanup does not claim either problem fixed.
