# Files sidebar divider archive and cleanup ledger

This ledger is the durable hand-off and completed cleanup record for the Files sidebar divider work. The detailed behavioral contract and evidence remain in the [specification](../specs/files-sidebar-divider.md), [development validation record](files-sidebar-divider.md), and [Windows package record](files-sidebar-divider-windows-package.md).

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

The initial archive ledger commit `a5d75629a7baf8dafc1229e78f338749d59dc90a` was fast-forwarded into `codex/marktext-feature-development-2026-08` before cleanup. A previously retained documentation patch at `2822f5e1` was checked with `git cherry`; its cherry-pick was empty because the same change was already integrated.

The Windows x64 development build passed all eight user acceptance checks and the same-profile restart-persistence follow-up on 2026-09-06. The unpacked Windows package subsequently passed three effective runs of its eight-stage automated smoke scenario. Physical human acceptance of the packaged installer remains **Pending**. Linux and macOS remain **Untested**.

## Retained distribution

The delivery directory is the only build-output location intended for retention. It contains the unsigned setup executable, ZIP, updater metadata, and their build and checksum records. Nothing was installed, published, pushed, or signed.

| Artifact                                          | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `marktext-win-x64-0.20.0-rc.1-setup.exe`          | `3852E7CE6915B64389BAEC8F25D0E966E0A11748FF8D5B8CB781A8367DCFBDBF` |
| `marktext-win-x64-0.20.0-rc.1.zip`                | `BADA4D97BB33E1D390AD7832F818E6873382B1209A7335F343EAB284C1BBEFF5` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | `B8CBCAA0834CEA5710D74881B93E40EA87E146286B6D410068FA0C8FAF12437B` |
| `latest.yml`                                      | `04BCAC9A273325BC8B2AAF2D9D52A97A930365ED7CB3C0A275C1F4392F89062A` |

`BUILD-INFO.txt` and `SHA256SUMS.txt` remain beside these artifacts. The four distribution hashes were recomputed after cleanup and still match. The installer is unsigned, so Windows may display a security warning.

## Preserved package evidence

Before deleting the package-smoke temporary directory, its independent coordinator result was distilled into `E:\Program Files\Marktext-builds\f93434a6\evidence`. That retained directory contains `report.json`, four screenshots, `README.txt`, and `EVIDENCE-SHA256SUMS.txt`. The five evidence-file hashes were verified after copying:

| Evidence file            | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `report.json`            | `30F1549E160A01952C227437FAD3C332E5F44BCEB6593E4E23D5EA40DDD2A314` |
| `01-default-no-root.png` | `DA9F9C9279ED3B7ADE297BBDECAAEB74D2A722BF03045E10004F9353389F7E33` |
| `02-overflow.png`        | `47F557CB188AB902E055AD03E19142D786CD83F7C83618E8FBDF7242DAE4454B` |
| `03-before-restart.png`  | `F6C90090EF350428AE9A202F92F77BC61E24364827398F8E119DAB29075F342C` |
| `04-after-restart.png`   | `A3F17CA5274B0F0598B866E878AC20EDAB174C82A01C05BA56785B3DE69D5B36` |

The source smoke directory was deleted only after this copy and verification. The delivery-level evidence now remains available while packaged-build physical acceptance is pending.

## Actual cleanup result

The completed cleanup removed **13,050,672,804 bytes** in total (approximately **12.154 GiB** or **13.051 GB**) of reproducible or superseded data.

### Removed worktrees

All four packaging worktrees were clean before removal:

| Worktree                                            | Bytes removed |
| --------------------------------------------------- | ------------: |
| `C:\Users\1407\.codex\worktrees\ce20\Marktext`      | 2,456,468,582 |
| `C:\Users\1407\.codex\worktrees\pkb60e6\Marktext`   | 2,456,644,197 |
| `C:\Users\1407\.codex\worktrees\pkdivider\Marktext` | 2,456,777,325 |
| `C:\Users\1407\.codex\worktrees\pkreopen\Marktext`  | 2,456,698,244 |

Git worktree removal encountered Windows `Filename too long` errors. Worktree metadata was removed first; remaining directories were then deleted with Node `fs.rmSync` only after validating the exact paths and required path prefixes. No broad or unresolved path was used.

### Removed superseded deliveries and temporary evidence

| Removed directory                                                                               | Bytes removed |
| ----------------------------------------------------------------------------------------------- | ------------: |
| `E:\Program Files\Marktext-builds\cbdfdb4f`                                                     |   299,364,236 |
| `E:\Program Files\Marktext-builds\b60e6b9a`                                                     |   775,988,782 |
| `E:\Program Files\Marktext-builds\8027278b`                                                     |   775,997,206 |
| `C:\Users\1407\AppData\Local\Temp\marktext-package-smoke-f93434a6-20260906T1324Z`               |   484,198,452 |
| `C:\Users\1407\AppData\Local\Temp\marktext-divider-acceptance-787109c73775401c81dad1a40c5fea42` |       409,687 |
| `C:\Users\1407\AppData\Local\Temp\marktext-divider-acceptance-9f94f8dd76614e82b2a3566dc4a4dcca` |    10,146,779 |

The three old package deliveries had been superseded by the retained `f93434a6` delivery. The smoke result and screenshots were preserved in the retained delivery before their source directory was removed.

### Global MarkText temporary-directory sweep

A subsequent audit of `%TEMP%` found 749 top-level `marktext-*` historical test, manual-acceptance, and diagnostic entries left by multiple earlier MarkText stages, not only the Files sidebar divider work. The scan accounted for **877,979,314 bytes** (approximately **0.818 GiB**), containing 18,644 directories and 7,202 files, with no scan errors.

Before deletion, a `Win32_Process` inspection confirmed that no Electron or MarkText process referenced any of these temporary paths. The only MarkText-related process was the retained final-delivery installer, PID `19644`, running from the delivery directory; it was not touched.

One Node process enumerated the exact Temp root and validated both the parent directory and required `marktext-` name prefix before removing each entry. All 749 entries were removed successfully, leaving zero matching top-level entries. The final `f93434a6` delivery and its compact `evidence` directory are outside `%TEMP%` and remained intact.

### Removed branches

The following local branches were deleted after their retained work and documentation were confirmed integrated:

- `codex/package-desktop-ui-folder-navigation-cbdfdb4f`
- `codex/package-move-tabs-split-right-b60e6b9a`
- `codex/package-transfer-source-reopen`
- `codex/package-files-sidebar-divider`
- `codex/files-sidebar-divider-spec`
- `codex/prototype-sidebar-spacing-divider`

The long-term branch `codex/marktext-feature-development-2026-08` and the active documentation branch `codex/record-files-sidebar-cleanup` were retained. The current `d3af` worktree was also retained because the coordinating task was still running; it can be removed after this final record is integrated and the task ends.

### Archived Codex tasks

Thirty-two completed MarkText coordination, prototype, T00-T07, review, and packaging tasks were submitted through the Codex archive API, and all 32 calls succeeded. The live MarkText task list then contained only the current coordinating task. The explicit archived list exposed two top-level tasks; the remaining archived entries are historical or delegated tasks.

## Boundaries and remaining work

- Retained: `codex/marktext-feature-development-2026-08`, its worktree, the current cleanup branch/worktree while active, the three repository records, and `E:\Program Files\Marktext-builds\f93434a6` with its extracted evidence.
- Pending: physical human acceptance of the packaged installer.
- Untested: Linux and macOS.
- Untouched: the main worktree at `E:\Program Files\Marktext`, which already contained user changes before cleanup.
- No repository content was pushed, and no source file was modified as part of cleanup documentation.
