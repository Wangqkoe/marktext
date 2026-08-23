# Final Windows x64 build and archive evidence

- Result: success (exit code 0)
- Source branch: `codex/latex-math-delimiters-v0.20.0`
- Source commit: `0b8fb2ad68d761e862af74540a489fb6bf6b24bf`
- Application version: `0.20.0-rc.1`
- Build command: `pnpm build:win:x64`
- Build started (UTC): `2026-08-23T10:05:05.6199723Z`
- Build completed (UTC): `2026-08-23T10:08:04Z` (latest installer artifact timestamp)
- Environment: Node `v24.18.0`; pnpm `10.33.4`; Windows `10.0.26200` (electron-builder report).
- Archive: `E:\Program Files\Marktext\dist\final-0.20.0-rc.1-0b8fb2ad`
- Publishing: `--publish never`; this was local-only work. No release or push was performed.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `marktext-win-x64-0.20.0-rc.1-setup.exe` | 125301564 | `31103bfd120fbe380f3ac3eac5463ddef2b936c2633e7db5c947771da324bf7c` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | 131772 | `16472bf2be339f074383255bfcf1a13a132610ca190421e6400fff64645a8451` |
| `marktext-win-x64-0.20.0-rc.1.zip` | 172668667 | `018903394c6a655189754faed64bc20cce2a8ed705e0ba6710a8afd08336721e` |
| `latest.yml` | 379 | `5f91dee958a70a6c74277eebc3e76d2fe00cdedb4b510bc513acb63b97d7e19e` |

All files were present, non-zero, and verified after copy by matching size and SHA-256.

The complete final acceptance record remains [02-final-batch-acceptance-rerun.md](02-final-batch-acceptance-rerun.md). This task only built and verified the Windows x64 artifacts; it did not re-run the full test/acceptance suite and does not alter any existing acceptance conclusion.

## Delegation correction

An incorrectly created subtask was immediately interrupted before it made changes. Follow-up checks found no related build process, no `dist` directory, and no worktree changes at that point. The build and all subsequent archive and evidence work were completed directly in this worktree. No residual impact was identified.
