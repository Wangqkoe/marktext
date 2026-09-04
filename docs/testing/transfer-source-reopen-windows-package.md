# Transfer source reopen Windows repair package

- Build date: 2026-09-03 (America/Los_Angeles).
- Reviewed source SHA: `8027278bad98e2f3ad9c6b58f90de39bc0bd35cf`.
- Target: Windows x64; desktop version: `0.20.0-rc.1` (unchanged).
- Branch: `codex/package-transfer-source-reopen`.
- Repair evidence: [source reopen regression](transfer-source-reopen.md).

## Fresh-build provenance

The isolated worktree `C:\Users\1407\.codex\worktrees\pkreopen\Marktext` started clean at `911a6f23`, installed dependencies and ran postinstall, then fast-forwarded to the reviewed fix SHA before building. Neither `packages/desktop/out` nor `dist` existed before the build. No development `out` was reused and no source, version or publishing configuration was changed by packaging.

Environment: Windows `10.0.26200`, Node.js `v24.18.0`, pnpm `10.33.4`, Electron `42.1.0`, electron-builder `26.15.3`.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm tsx scripts/postinstall.ts
git merge --ff-only 8027278bad98e2f3ad9c6b58f90de39bc0bd35cf
pnpm run build:win:x64
```

All commands completed with exit status 0. The formal x64 script runs locale minification, Electron native rebuild, Vite production build and `electron-builder --win --x64 --publish never`. The new application build took 2.14 s for main, 39 ms for preload and 26.16 s for renderer. The packaged `app.asar/package.json` independently reports `marktext` version `0.20.0-rc.1`.

Fresh packaging renderer: `packages/desktop/out/renderer/assets/index-jgf4u3Nb.js`, SHA-256 `70599090F3FE746FD529165FD829DB6097387785D2818636D4111CC4689A52A4`. This is not the separate development renderer hash.

## Deliverables and package validation

| File                                              | Bytes     | SHA-256                                                            |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `marktext-win-x64-0.20.0-rc.1-setup.exe`          | 125833902 | `BD187AA7580912E338A3045EC885EF3DB27A6523ECAC4FC1D427E0DBB249A787` |
| `marktext-win-x64-0.20.0-rc.1.zip`                | 173408422 | `357A4D023CB5CBF6CB6C6CE3A2710786369CA282F2E767EBE270EE57218B8C57` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` | 132249    | `91428704BA558A262DA3301796FB5C7F9F7D4A9DAEA51BBACD3EBA06E66AAF48` |
| `latest.yml`                                      | 379       | `A83FA86DD3A1975A940E9B92389EBAEA3A0CE91EBF58752CDAE90AC6DE22EE40` |

- 7-Zip 24.09 returned exit 0 and `Everything is Ok` for ZIP (130 files, 61 folders) and NSIS embedded payload (131 files, 61 folders).
- Installer `MZ` and `PE\0\0` headers are valid.
- Installer and unpacked `marktext.exe` both report `NotSigned` with no signer or timestamp certificate; builder signtool output does not imply certificate signing.
- `latest.yml` installer byte size and SHA-512 match the actual installer.
- Blockmap gzip decompression and JSON parsing succeeded: version 2, one file entry.
- Packaged `resources/app.asar.unpacked/node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe` exists and runs `--version` successfully (ripgrep 15.0.0, PCRE2 10.45).
- All four files were copied to the new delivery directory and SHA-256 matched against build originals.

## Actual packaged-application regression

The coordinator verified the actual new executable `C:\Users\1407\.codex\worktrees\pkreopen\Marktext\dist\win-unpacked\marktext.exe` using repository-external Electron-protocol harnesses and new isolated profiles. No development build or old package was substituted.

```powershell
$repairExe = 'C:\Users\1407\.codex\worktrees\pkreopen\Marktext\dist\win-unpacked\marktext.exe'
$repairProbe = 'C:\Users\1407\AppData\Local\Temp\marktext-transfer-close-reopen-diagnostic-20260903\probe.cjs'
node $repairProbe --mode package --executable-path $repairExe --context --wait-completed --entry file-open --repeat 2
node $repairProbe --mode package --executable-path $repairExe --context --wait-completed --entry sidebar --repeat 2
node 'C:\Users\1407\AppData\Local\Temp\marktext-transfer-close-reopen-diagnostic-20260903\package-view-smoke.cjs' --mode package --executable-path $repairExe
```

- **File > Open: 2/2 passed**, exit 0.
- **Files sidebar: 2/2 passed**, exit 0.
- **Integrated Move/Split/shared-edit smoke: passed**, exit 0, 4.223 s. It covered Move Right/Left; genuine Split Right retaining the left view and sharing the document; repeated split reuse with no third pane; no Split Left and disabled right-pane Split Right; shared marker synchronization; and normal File Save of temporary content.

The four original-bug probe executions awaited transfer `completed` before closing the target, then verified source-tab/body restoration and disk integrity. They used neither a compensating close notification nor an application restart to repair state. All five test instances closed normally with `app.close` / exit 0. These are two package reopen scenarios each repeated twice plus one integrated view smoke, not five new formal E2E test cases; they are separate from the 27 distinct source Electron tests.

Local logs in the diagnostic directory: `evidence-package-context-move-1788500279166.ndjson` (File Open), `evidence-package-context-move-1788500293043.ndjson` (sidebar), and `evidence-view-smoke-package-1788500306843.ndjson` (view smoke). These machine-specific paths are supporting artifacts, not repository dependencies. Physical human acceptance of this new repair remains **Pending**.

## Non-blocking warnings

- Four CodeMirror modules have both static and dynamic imports, preventing those imports from splitting into separate chunks.
- electron-builder suggests removing redundant `@electron/rebuild` and reports duplicate pnpm dependency references.
- Optional ripgrep binaries for non-target platforms/architectures are omitted by pnpm 10 packaging; target Windows x64 is checked separately.
- 7-Zip reported data after the embedded NSIS archive (installer tail) but returned exit 0 and `Everything is Ok`.

## Storage and acceptance boundaries

New delivery: `E:\Program Files\Marktext-builds\8027278b`, including companion `BUILD-INFO.txt` and `SHA256SUMS.txt`. The earlier `cbdfdb4f` and `b60e6b9a` deliveries are preserved, not overwritten; read-only installer/ZIP SHA-256 checks for both still matched their original manifests. Binaries and unpacked build output remain outside Git. The old `b60e6b9a` package remains affected by the reproduced source-reopen defect; its historical GUI Pending record is not converted to a pass by the replacement package.

The installer is an interactive per-user NSIS installer with selectable location; ZIP is the extractable distribution, not a separate portable-executable target. No installer was launched, no everyday profile or user process was changed, and no push or publication was performed. New-fix human acceptance remains Pending; Linux/macOS are Untested. Automated package results do not imply physical human desktop acceptance.
