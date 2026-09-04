# Move tabs and Split Right Windows package manifest

- Build date: 2026-09-03 (America/Los_Angeles).
- Source SHA: `b60e6b9a0ba5d7c060a18a02f03e0a853077009f`.
- Application/source/test commit: `dd5e1dadb4d550095c8718c2f758685be38fd36f`; subsequent commits through the source SHA record documentation and acceptance.
- Target: Microsoft Windows x64; desktop package version: `0.20.0-rc.1`.
- Packaging branch: `codex/package-move-tabs-split-right-b60e6b9a`.

## Environment and commands

Windows `10.0.26200`, Node.js `v24.18.0`, pnpm `10.33.4`, Electron `42.1.0`, electron-builder `26.15.3`.

A new isolated worktree at `C:\Users\1407\.codex\worktrees\pkb60e6\Marktext` started clean at the source SHA. Neither `packages/desktop/out` nor `dist` existed. Dependencies were freshly linked from the frozen lockfile, reusing the pnpm download store. No source version or publishing configuration was changed.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm tsx scripts/postinstall.ts
pnpm run build:win:x64
```

All three commands completed with exit status 0. The desktop x64 script invokes locale minification, `electron-rebuild`, `electron-vite build`, and `electron-builder --win --x64 --publish never`. Postinstall rebuilt `ced`, `keytar`, `native-keymap`, and `uiohook-napi` for Electron. The fresh application build took 2.56 s for main, 43 ms for preload and 31.74 s for renderer.

The generated renderer `packages/desktop/out/renderer/assets/index-CJE3hkgP.js` has SHA-256 `90D627F83EB9596E6CD57DC4758093A24781C2DFE99514CFB4120A66F945A344`. This is a fresh packaging build, separate from the earlier development-build artifact in the acceptance evidence. The packaged `app.asar/package.json` independently reports `marktext` version `0.20.0-rc.1`; the monorepo root's `0.20.0-beta.4` is not the desktop distribution version.

## Deliverables and verification

| File                                              | Bytes     | SHA-256                                                            |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `marktext-win-x64-0.20.0-rc.1-setup.exe`          | 125834192 | `C18D91561B2486BEFFBD79A6A269611C6319B6CA602AD10A1B467FC85727B9BF` |
| `marktext-win-x64-0.20.0-rc.1.zip`                | 173409247 | `A417A3E99E306DD661AE5136CCC13FA4E9BAA6AA060D1F4BBCFF57C1F6F38F16` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | 131901    | `DFA5851CDAC0CECAAF136B41F16A367E29052E67E9148A35B3C329749A830B40` |
| `latest.yml`                                      | 379       | `5CD7EE8B4397F3168067432BF0FCB3C7F5543D5B13D64875ECD0EE35EE56ED77` |

The NSIS target is an interactive per-user installer with a selectable installation directory. The ZIP is an extractable distribution, not a separate electron-builder `portable` executable target.

- 7-Zip 24.09 archive tests returned exit status 0 and `Everything is Ok` for both ZIP (130 files, 61 folders) and NSIS embedded payload (131 files, 61 folders).
- The installer has valid `MZ` and `PE\0\0` signatures.
- `Get-AuthenticodeSignature` reports `NotSigned` for both the installer and unpacked `marktext.exe`, with no signer or timestamp certificate. Builder signtool messages do not establish certificate signing.
- `latest.yml` matches the actual installer byte size and SHA-512.
- The blockmap successfully gunzips and parses as version 2 JSON with one file entry.
- `dist/win-unpacked/resources/app.asar.unpacked/node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe` exists and `--version` succeeds, reporting ripgrep 15.0.0 with PCRE2 10.45.
- All four delivery files were copied into the new delivery directory and their SHA-256 values compared successfully against the original build outputs. The coordinator independently checked installer/ZIP sizes and hashes and both executable signing statuses.

## Packaged startup and GUI smoke boundary

The coordinator launched `C:\Users\1407\.codex\worktrees\pkb60e6\Marktext\dist\win-unpacked\marktext.exe` using only the dedicated profile `C:\Users\1407\.codex\worktrees\pkb60e6\package-smoke\profile` and temporary A/B/C fixtures in its sibling `fixtures` directory. The profile initially specified only `autoSave=false` and `language=en`, without relaxing security settings. The main process remained alive with a nonzero window handle titled `A.md`; the isolated main log contained migration/language information and no error at inspection.

**Packaged Move/Split Right/shared-edit GUI behavior smoke: Pending.** Desktop activation returned `GetCursorPos failed` / access denied (`0x80070005`); after refreshing the target, capture remained black and accessibility data was unavailable. UI input stopped. This environment-access limitation is not evidence of an application defect, but process startup and window title do not establish GUI behavior acceptance. No packaged Move/Split/shared-edit pass is claimed. The prior development-build user-confirmed Windows checks 1–8 remain valid within their separately documented scope.

## Non-blocking warnings

- Vite reported four CodeMirror modules imported both dynamically and statically, preventing those imports from becoming separate chunks.
- electron-builder suggested removing the redundant `@electron/rebuild` development dependency.
- electron-builder reported duplicate references while resolving the pnpm dependency graph.
- pnpm 10 packaging omitted optional ripgrep binaries for non-target platforms and architectures; the required Windows x64 binary was verified above.
- 7-Zip reported data after the NSIS embedded archive (the installer tail), while returning exit status 0 and `Everything is Ok`.

## Storage and validation boundaries

The new delivery directory is `E:\Program Files\Marktext-builds\b60e6b9a`, with companion `SHA256SUMS.txt` and `BUILD-INFO.txt` verification notes. The unpacked application remains in the isolated packaging worktree for follow-up GUI smoke. These machine-specific paths are not release URLs or reproducibility dependencies. Binaries, unpacked output and temporary acceptance materials remain outside Git.

The previous delivery in `E:\Program Files\Marktext-builds\cbdfdb4f` was preserved. Read-only SHA-256 checks matched its historical manifest: installer `E0D98D4D626C700EDBC935FF97690433239D68C0FA39EBF90450D3F2407342A9`, ZIP `DB825A2BF0ACE68DAD6D9F4710FE024DB63E6BECEDF14DB933FE9B5CFC9B623E`.

No installer was launched, no everyday profile was modified, and no push or publication was performed. Existing user MarkText processes and the earlier package worktree were not stopped or replaced. This packaging run does not claim a new full unit, lint or E2E suite pass; prior focused automated checks and user-confirmed Windows checks 1–8 remain recorded in [the acceptance evidence](move-tabs-and-split-right.md). Linux/macOS remain untested.
