# Final task archive and worktree cleanup

## Execution record

- Executed (UTC): `2026-08-23T10:14:35Z` through `2026-08-23T10:32Z`.
- Fixed main worktree: `E:\Program Files\Marktext`.
- Main branch and initial/final pre-evidence HEAD: `codex/latex-math-delimiters-v0.20.0` at `5d911642c10f8fe74d4f790f2a6d760a8b414747` (the requested start commit).
- This task's current worktree, `C:\Users\1407\.codex\worktrees\fee8\Marktext`, was excluded throughout and retained.
- The main worktree's untracked `CONTEXT.md` was retained, not modified, and not staged.  Its SHA-256 was `45B398BE8F4039FF9F3923748DCFC452ECF3BEA1F06717BD83FB26EA58B492EC`.

## Read-only worktree audit

All detached Codex worktrees were either clean or had exactly one untracked file, `CONTEXT.md`.  Every present copy of that file matched the main-worktree SHA-256 above byte-for-byte.  Each detached HEAD was not an ancestry ancestor of the current main HEAD, but `git cherry -v <main> <head>` reported only `-` entries: patch-equivalent/integrated into main.  No audit target had a protecting branch or exact tag, and the patch-equivalence evidence means no archive tag was required.

| Worktree suffix | HEAD | Status | Integration evidence | Result |
| --- | --- | --- | --- | --- |
| `0298` | `249c428d` | `?? CONTEXT.md` | patch-equivalent | Git registration removed; physical residual remains (see below) |
| `16ba` | `b2bf4c37` | `?? CONTEXT.md` | patch-equivalent | Git registration removed; physical residual remains (see below) |
| `1af9` | `1c41984f` | `?? CONTEXT.md` | patch-equivalent | Git registration removed; physical residual remains (see below) |
| `393b` | `2a89a868` | clean | patch-equivalent | removed |
| `4678` | `35c38a5f` | `?? CONTEXT.md` | patch-equivalent | removed |
| `4853` | `134b9e2a` | `?? CONTEXT.md` | patch-equivalent | registration removed; empty physical residual remains |
| `4bc7` | `13c15beea` | `?? CONTEXT.md` | patch-equivalent | removed |
| `6288` | `d3b523ae` | `?? CONTEXT.md` | patch-equivalent | removed |
| `7846` | `c7627730` | `?? CONTEXT.md` | patch-equivalent | removed |
| `86df` | `4747c03a` | `?? CONTEXT.md` | patch-equivalent | removed |
| `9f52` | `efb52ab` | `?? CONTEXT.md` | patch-equivalent | removed |
| `b25e` | `c34317d` | `?? CONTEXT.md` | patch-equivalent | registration removed; empty physical residual remains |
| `b8ab` | `482bc4bd` | `?? CONTEXT.md` | patch-equivalent | removed |
| prototype | `0a2d74c5` | clean | deliberately not integrated; protected by `codex/prototype-typora-shell` | worktree removed; branch retained |

The prototype branch was rechecked after removal and remains at `0a2d74c56af3bf95e14c595d37e673c31cd4f7f8`.  No `archive/worktree-*` tag was created: every detached target was proven patch-equivalent, and the prototype had its protected branch.

## Worktree-removal exceptions

Each target path was resolved and restricted to `C:\Users\1407\.codex\worktrees\<id>\Marktext`, except the exact permitted prototype path.  `git worktree remove --force` and `git worktree prune` were used; no worktree directory was manually deleted.

Windows/Git could not finish filesystem deletion for these paths:

- `0298`, `16ba`, and `1af9`: a long-path failure left 23,688, 23,690, and 23,688 files respectively.
- `4853` and `b25e`: `Permission denied`; their Git registrations were pruned and their remaining directories were empty at final inspection.

They are intentionally left as physical residuals because the task explicitly prohibited manually deleting worktree directories.  They no longer appear in `git worktree list`.

Final registered worktrees:

```text
E:/Program Files/Marktext                         codex/latex-math-delimiters-v0.20.0
C:/Users/1407/.codex/worktrees/fee8/Marktext      detached at 5d911642
```

## Final build archive and old-output cleanup

The protected archive `E:\Program Files\Marktext\dist\final-0.20.0-rc.1-0b8fb2ad` was never modified.  Its four `SHA256SUMS.txt` entries were rechecked and all matched:

| File | SHA-256 |
| --- | --- |
| `marktext-win-x64-0.20.0-rc.1-setup.exe` | `31103bfd120fbe380f3ac3eac5463ddef2b936c2633e7db5c947771da324bf7c` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | `16472bf2be339f074383255bfcf1a13a132610ca190421e6400fff64645a8451` |
| `marktext-win-x64-0.20.0-rc.1.zip` | `018903394c6a655189754faed64bc20cce2a8ed705e0ba6710a8afd08336721e` |
| `latest.yml` | `5f91dee958a70a6c74277eebc3e76d2fe00cdedb4b510bc513acb63b97d7e19e` |

The seven other direct children of `dist` were audited as 2026-08-20 Windows-build outputs: `marktext-win-x64-0.20.0-rc.1`, `win-unpacked`, `builder-debug.yml`, `latest.yml`, the setup EXE, its blockmap, and the ZIP.  No output was deleted.  The execution environment rejected the explicitly required `PowerShell Remove-Item -LiteralPath` command even for the single verified literal `builder-debug.yml`; no deletion bypass was used.  These items remain and can be rebuilt from the historical source, but local deletion would not have been directly reversible.

## Unexecuted items and final safeguards

- Physical worktree residuals listed above need a later cleanup after resolving Windows path/permission conditions, using an approved method consistent with the no-manual-worktree-delete constraint.
- The seven verified old build outputs remain because the required deletion command was blocked by the execution environment.
- No task/session archival or deletion was performed.
- No remote operation or push was performed.
