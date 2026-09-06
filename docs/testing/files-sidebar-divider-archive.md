# Files sidebar divider archive and cleanup ledger

This ledger is the durable hand-off for the Files sidebar divider work. It records what must remain after the associated Codex tasks, worktrees, build directories, and temporary evidence are cleaned up. The detailed behavioral contract and evidence remain in the [specification](../specs/files-sidebar-divider.md), [development validation record](files-sidebar-divider.md), and [Windows package record](files-sidebar-divider-windows-package.md).

## Durable archive

| Item                                       | Archived value                               |
| ------------------------------------------ | -------------------------------------------- |
| Specification                              | `e2ba0adbc2244404e7f6e8bb7566e35715a28a68`   |
| Product implementation                     | `f93434a67bc4291d4c2facaa34c21df21b315237`   |
| Test follow-up                             | `0ec0fbef0ea8c4cb7c246c38a9c7be46235d23ed`   |
| Automated validation record                | `b56da30055bafc13d41ea8e8ec6b6a4251b0177b`   |
| Windows development-build human acceptance | `04efefc6432f9375d30974c63631b4103d820c91`   |
| Restart-persistence human acceptance       | `c7ec1d9947967d568ead4232dba89f11d6b6555f`   |
| Windows package record / cleanup baseline  | `a6c0a73951c6e642dc4a0e51f204169a9cbc3e8d`   |
| Long-term integration branch               | `codex/marktext-feature-development-2026-08` |
| Delivery directory                         | `E:\Program Files\Marktext-builds\f93434a6`  |

At cleanup planning time, the long-term integration branch and the feature-record, package, and cleanup branches all contained `a6c0a739`; the package and cleanup worktrees were also at that commit. This ledger must be integrated into `codex/marktext-feature-development-2026-08` before deleting its temporary cleanup branch or worktree.

The Windows x64 development build passed all eight user acceptance checks and the same-profile restart-persistence follow-up on 2026-09-06. The unpacked Windows package subsequently passed three effective runs of its eight-stage automated smoke scenario. Physical human acceptance of the packaged installer remains **Pending**. Linux and macOS remain **Untested**.

## Retained distribution

The delivery directory is the only build-output location intended for retention. It contains the unsigned setup executable, ZIP, updater metadata, and their build and checksum records. Nothing was installed, published, pushed, or signed.

| Artifact                                          | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `marktext-win-x64-0.20.0-rc.1-setup.exe`          | `3852E7CE6915B64389BAEC8F25D0E966E0A11748FF8D5B8CB781A8367DCFBDBF` |
| `marktext-win-x64-0.20.0-rc.1.zip`                | `BADA4D97BB33E1D390AD7832F818E6873382B1209A7335F343EAB284C1BBEFF5` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | `B8CBCAA0834CEA5710D74881B93E40EA87E146286B6D410068FA0C8FAF12437B` |
| `latest.yml`                                      | `04BCAC9A273325BC8B2AAF2D9D52A97A930365ED7CB3C0A275C1F4392F89062A` |

Retain `BUILD-INFO.txt` and `SHA256SUMS.txt` beside these artifacts. The installer is unsigned, so Windows may display a security warning.

## Cleanup disposition

The following disposition is intentionally conservative. Removal should happen only after this ledger is present on the long-term branch and each named worktree is clean.

### Retain

- `codex/marktext-feature-development-2026-08` and its worktree at `E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08` as the continuing development line.
- `E:\Program Files\Marktext-builds\f93434a6` as the verified Windows delivery.
- The three repository records linked at the top of this ledger.
- The package smoke evidence under `C:\Users\1407\AppData\Local\Temp\marktext-package-smoke-f93434a6-20260906T1324Z` until packaged-build physical acceptance is complete or explicitly waived. It is supplementary evidence; the durable result is already summarized in the package record.

### Safe to remove after integration checks

- Worktree `C:\Users\1407\.codex\worktrees\pkdivider\Marktext`, including its generated `dist`, dependencies, and other reproducible build output, after confirming it is clean and the delivery hashes still match `SHA256SUMS.txt`.
- Worktree `C:\Users\1407\.codex\worktrees\d3af\Marktext` after this ledger is integrated and the coordinating task no longer needs it.
- Branches `codex/files-sidebar-divider-spec`, `codex/package-files-sidebar-divider`, and `codex/record-files-sidebar-cleanup` after their required commits are reachable from the retained long-term branch and no worktree uses them.
- Superseded prototype branch `codex/prototype-sidebar-spacing-divider`, provided its useful design conclusions are confirmed to be represented by the specification and no active task still references it.
- Isolated development-acceptance fixtures `C:\Users\1407\AppData\Local\Temp\marktext-divider-acceptance-787109c73775401c81dad1a40c5fea42` and `C:\Users\1407\AppData\Local\Temp\marktext-divider-acceptance-9f94f8dd76614e82b2a3566dc4a4dcca` after confirming no owned test process still uses them.
- The retained package-smoke temp directory after packaged-build physical acceptance is completed or waived; the repository record and delivery checksums are sufficient for long-term history.
- Completed divider implementation, documentation, launch, acceptance, packaging, and review Codex tasks, including the task roles `document_files_sidebar_divider`, `launch_divider_acceptance`, `manual_acceptance_launch`, and `package_files_sidebar_divider`, once no follow-up message is pending. Archive them rather than deleting repository history.

Do not treat unrelated packaging worktrees (`ce20`, `pkb60e6`, and `pkreopen`) or their branches as part of this feature's cleanup. Their owners and retained deliveries must be audited separately.

## Cleanup gates

Before removing any item above:

1. Confirm this ledger is reachable from `codex/marktext-feature-development-2026-08` and that the retained worktree is clean.
2. Recompute the four delivery SHA-256 values and compare them with `E:\Program Files\Marktext-builds\f93434a6\SHA256SUMS.txt`.
3. Confirm every temporary worktree is clean, no active process is using it, and all unique commits are reachable from the retained branch.
4. Remove worktrees before deleting their branches; prune only stale worktree metadata afterward.
5. Keep the package-smoke evidence while packaged-build physical acceptance is pending unless the user explicitly chooses to discard it.
6. Archive only completed Codex tasks; keep the coordinating task until cleanup and its verification are recorded.

No filesystem resource, task, worktree, branch, or build artifact was deleted while creating this ledger.
