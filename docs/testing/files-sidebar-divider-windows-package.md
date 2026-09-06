# Files sidebar divider Windows package

- Package status: Windows x64 build and automated package smoke **Passed**.
- Physical package acceptance: **Pending**.
- Linux/macOS: **Untested**.
- Signing: setup and unpacked executables are **unsigned** (`NotSigned`).
- Distribution boundary: copied to `E:\Program Files\Marktext-builds\f93434a6`; not installed, published, or pushed.

## Provenance

| Role                   | Commit                                     |
| ---------------------- | ------------------------------------------ |
| Specification baseline | `e2ba0adbc2244404e7f6e8bb7566e35715a28a68` |
| Application source     | `f93434a67bc4291d4c2facaa34c21df21b315237` |
| Test follow-up         | `0ec0fbef0ea8c4cb7c246c38a9c7be46235d23ed` |
| Final build HEAD       | `c7ec1d9947967d568ead4232dba89f11d6b6555f` |

The package was built from a clean, newly created worktree at the final build HEAD on branch `codex/package-files-sidebar-divider`. The application source file `packages/desktop/src/renderer/src/components/sideBar/tree.vue` at that HEAD was byte-identical to the application-source commit.

The earlier Windows development-build physical acceptance passed all eight numbered checks on 2026-09-06. Its subsequent same-profile restart-persistence follow-up also passed. Those are historical development-build results, not physical acceptance of this package.

## Fresh build

Environment:

- Windows x64
- Node.js `v24.18.0`
- pnpm `10.33.4`
- Electron `42.1.0`
- electron-builder `26.15.3`

| Stage                                             | Result         | Elapsed |
| ------------------------------------------------- | -------------- | ------: |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed, exit 0 |  64.6 s |
| `pnpm tsx scripts/postinstall.ts`                 | Passed, exit 0 |  46.7 s |
| `pnpm run build:win:x64`                          | Passed, exit 0 | 329.7 s |

The successful build emitted four existing CodeMirror static/dynamic import warnings. electron-builder also reported duplicate dependency references and that non-Windows/non-x64 optional ripgrep packages were not bundled. The required Windows x64 ripgrep binary was present and executable, so these remain record-level warnings rather than blockers.

## Release artifacts

| Artifact                                          |       Bytes | SHA-256                                                            |
| ------------------------------------------------- | ----------: | ------------------------------------------------------------------ |
| `marktext-win-x64-0.20.0-rc.1-setup.exe`          | 125,836,351 | `3852E7CE6915B64389BAEC8F25D0E966E0A11748FF8D5B8CB781A8367DCFBDBF` |
| `marktext-win-x64-0.20.0-rc.1.zip`                | 173,413,066 | `BADA4D97BB33E1D390AD7832F818E6873382B1209A7335F343EAB284C1BBEFF5` |
| `marktext-win-x64-0.20.0-rc.1-setup.exe.blockmap` |     131,347 | `B8CBCAA0834CEA5710D74881B93E40EA87E146286B6D410068FA0C8FAF12437B` |
| `latest.yml`                                      |         379 | `04BCAC9A273325BC8B2AAF2D9D52A97A930365ED7CB3C0A275C1F4392F89062A` |

The four files were copied into a newly created delivery directory, and every copied SHA-256 matched its build output. The delivery directory also contains `SHA256SUMS.txt` and `BUILD-INFO.txt`.

## Package integrity checks

- `latest.yml` records setup size `125836351` and base64 SHA-512 `Co6P3BJOVNLB/Zabtf8SbNLpCRxVzCy4LDXpE8iRO0hFQuVbb8kYyU37mNNv/eRaFs2ZwxllqkfJIYCcM3wlCQ==`; both match the setup executable.
- The `.blockmap` decompresses as gzip and parses as version 2 JSON.
- Setup and unpacked executables have valid `MZ` PE headers and both report Authenticode status `NotSigned`.
- 7-Zip 24.09 complete tests passed for the ZIP and setup payload. The NSIS container reports its expected trailing-data warning while also reporting `Everything is Ok`; all 131 payload files extracted, and the extracted `marktext.exe` SHA-256 matched the unpacked executable.
- `app.asar` declares package `marktext`, version `0.20.0-rc.1`, and main entry `./out/main/index.js`.
- Packaged `@vscode/ripgrep-win32-x64` exists and `rg --version` reports ripgrep `15.0.0` with PCRE2.
- The production renderer bundle contains the persistence key `side-bar-files-divider-ratio` and implementation markers `sidebar-divider` and `row-resize`. No divider debug instrumentation was found.

## Automated package smoke

The unpacked packaged executable was launched directly through Playwright Electron using only fresh, isolated profiles and filesystem fixtures. Each owned application instance was closed normally. No existing MarkText/Electron instance or user profile was operated, and the package was not installed.

Two owner runs and one coordinator rerun passed the same package scenario. These are repetitions of one scenario and do not increase its distinct test count. The coordinator also visually inspected all four screenshots from its rerun.

The scenario verified:

1. The no-root Files view retained Open Folder and showed a default midpoint divider with a `5px` hit target and `row-resize` cursor.
2. Real pointer dragging moved the divider live to about `0.68`, while pointerup persisted the resulting local-storage ratio.
3. Opening a real fixture containing 45 Markdown files and 12 directories, then adding enough Opened Files DOM rows, did not move the divider.
4. Both content regions overflowed and scrolled independently while their titles remained fixed.
5. Double-click reset geometry and persistence to `0.5`.
6. Collapsing Opened Files retained its allocated blank height and left the divider operable.
7. Outline hid the divider and returning to Files restored it; disabling and re-enabling the Opened Files preference likewise hid and restored it.
8. A final drag to about `0.7`, normal close, and relaunch with the same isolated profile restored the ratio.

The first harness attempt timed out before the overflow stage because it called a renderer-only project seam that does not populate packaged folder contents. The harness was corrected to use the packaged application's main-process folder-open seam. Both subsequent owner runs and the independent coordinator rerun passed. This was a harness correction, not a product failure.

Evidence is retained outside the repository under `C:\Users\1407\AppData\Local\Temp\marktext-package-smoke-f93434a6-20260906T1324Z`, including the standalone script, JSON reports, and screenshots.

## Remaining acceptance

Physical human acceptance of the packaged build remains **Pending**. The successful historical Windows development-build acceptance does not replace that package-specific check. Linux and macOS remain **Untested**. The unsigned package was not installed, and nothing was published or pushed.
