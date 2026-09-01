# Desktop UI and Folder navigation Windows package manifest

- Build date: 2026-09-01 (America/Los_Angeles)
- Long-term integration branch: `codex/marktext-feature-development-2026-08`
- Source SHA: `cbdfdb4f36bd5bfda919ce363ca09e82ce9f1074`
- Target: Microsoft Windows x64
- Package version: `0.20.0-rc.1`

## Environment and commands

- Windows `10.0.26200`
- Node.js `v24.18.0`
- pnpm `10.33.4`
- Electron `v42.1.0`
- electron-builder `26.15.3`

The fresh packaging run used the repository's release flow and completed with exit status 0 for every command:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm tsx scripts/postinstall.ts
pnpm run build:win:x64
```

Neither `packages/desktop/out` nor `dist` existed before this run. The pnpm content-addressed download store was reused, but dependencies were linked from the frozen lockfile and the repository postinstall rebuilt the Electron native modules before packaging.

## Deliverables

| File                                              | Type                                               | Bytes     | SHA-256                                                            |
| ------------------------------------------------- | -------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `marktext-win-x64-0.20.0-rc.1-setup.exe`          | Windows x64 NSIS installer                         | 125829174 | `E0D98D4D626C700EDBC935FF97690433239D68C0FA39EBF90450D3F2407342A9` |
| `marktext-win-x64-0.20.0-rc.1.zip`                | Windows x64 ZIP distribution                       | 173399758 | `DB825A2BF0ACE68DAD6D9F4710FE024DB63E6BECEDF14DB933FE9B5CFC9B623E` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | gzip-compressed electron-updater blockmap, JSON v2 | 132027    | `838F851FDECBFECA13829E7AB98C85ADD9458D84B2FC26A14CC8D8B7D7ABE220` |
| `latest.yml`                                      | electron-updater metadata                          | 379       | `B4B9EB3F4088ED6597C00C824FB4BC99A0E0E041842103D706DA61A116460917` |

The NSIS target is an interactive, per-user installer with a selectable installation directory. The ZIP is the corresponding extractable distribution; the build did not define a separate electron-builder `portable` executable target.

## Signing and verification

- Windows `Get-AuthenticodeSignature` returned `NotSigned` for the NSIS installer and unpacked `marktext.exe`; neither file has a signer or timestamp certificate. electron-builder's signtool processing messages did not constitute certificate signing.
- The installer has valid `MZ` and `PE\0\0` signatures.
- 7-Zip 24.09 tested the ZIP with exit status 0 and `Everything is Ok` (130 files, 61 folders).
- 7-Zip 24.09 tested the NSIS embedded payload with exit status 0 and `Everything is Ok` (131 files, 61 folders). Its data-after-archive message described the expected installer tail rather than an integrity failure.
- `latest.yml` records the generated installer's actual byte size and matching SHA-512.
- The blockmap successfully decompressed as gzip and parsed as version 2 JSON with one file entry.
- An isolated unpacked startup smoke used a dedicated `--user-data-dir`. The main process remained alive, created a nonzero window handle titled `Untitled-1`, and launched the expected five Electron processes. No MarkText process existed before the smoke; all five test processes and the isolated profile were removed afterward.

## Non-blocking warnings

- Vite reported four CodeMirror modules that were both dynamically and statically imported, so those imports could not be split into separate chunks.
- electron-builder suggested removing the redundant `@electron/rebuild` development dependency.
- electron-builder reported duplicate dependency references while resolving the pnpm graph.
- pnpm 10 packaging omitted optional ripgrep binaries for non-target platforms and architectures; the required `@vscode/ripgrep-win32-x64` binary is present in the package.
- 7-Zip reported data after the NSIS embedded archive while still returning exit status 0 and `Everything is Ok`.

These warnings did not prevent dependency installation, native rebuild, packaging, integrity validation, or startup smoke.

## Storage boundary

The verified files were copied to `E:\Program Files\Marktext-builds\cbdfdb4f` as a local delivery location. That machine-specific path is not a reproducibility dependency or a release URL. The installer, ZIP, unpacked application, blockmap, updater metadata, build output, and other binaries remain outside Git; this manifest is the durable repository record. No push or publication was performed.
