# T05 first-phase evidence: installed Windows scroll acceptance

Date: 2026-09-07 (America/Los_Angeles)

Status: **initial installed performance phase Passed; Windows manual acceptance exposed one
blocking window-close defect; the repair passes development-build automation; fresh-package
manual re-verification is Pending.** This is not final ticket acceptance.

## Identity and build

- Required production baseline: `ef5a10d062098baacdc39f278e5ab361691a0904`.
- Clean harness/measured HEAD: `5bcd571eb41043d65fa41e62cdaaa2e8f5183119` on
  `codex/wysiwyg-scroll-05-installed-acceptance`.
- `git diff --quiet ef5a10d... -- packages scripts package.json pnpm-lock.yaml
  pnpm-workspace.yaml eslint.config.js` returned 0. Thus the harness/config commits add no
  production input change.
- Harness SHA-256: `fd82985207fce72574b7cf36688a7095f4a5df64695ddd279fcfcb2b4dc963ed`.
- Standalone safe builder config SHA-256:
  `aba2575aa294f6710fbd4d8dc2332f930838df2565f6b3f132df475579029f9c`.
- Fixture: exactly 400 H2 headings, each followed by one paragraph; SHA-256
  `95e48ed46076223854eb4a1f9b9f1359eff954cffca1bb361f43ea3a74e98ae5`.
- Exact build sequence: locale minification, `electron-rebuild`, `electron-vite build`, then
  `electron-builder --win nsis zip --x64 --publish never` with the committed standalone T05
  config and a new output directory. Every command returned 0. Full log:
  `C:\Users\1407\.codex\artifacts\marktext-t05-ef5a10d-20260907-03\fresh-build.log`
  (89,854 bytes; SHA-256 `a4d22df02caa64d905f10d9a86626cc9a7f23a518bb48e6d4f206eddf24d3d87`).
- Fresh `packages/desktop/out`: 878 files, 24,000,277 bytes. Sorted SHA-256 manifest:
  `production-out-files.sha256` (manifest SHA-256
  `afabc64a33575ff49884a642f417286f7444e28490f1cee9d38f2368e06a29d5`).
- Final package tree: 136 files, 776,213,308 bytes. Sorted SHA-256 manifest:
  `package-files.sha256` (manifest SHA-256
  `5d51f206e1fbf70e8cc671dec030a1d188bfbd4c0b58f1374b6bba19c4735259`).
- Packaged `app.asar` SHA-256:
  `82a699f9cedc101c91c90b46e36e5b8808624a4366eed1b869ef12af954d9a3a`.

Final artifacts are under the new directory
`C:\Users\1407\.codex\artifacts\marktext-t05-ef5a10d-20260907-03\package`:

| Artifact | Bytes | SHA-256 | Authenticode |
| --- | ---: | --- | --- |
| `marktext-scroll-acceptance-t05-safe-win-x64-0.20.0-rc.1-setup.exe` | 125,831,761 | `1a428d3ead26e9d6fbd3a002f365100963bef4b12f027d3ca3d8512850799af3` | NotSigned |
| `marktext-scroll-acceptance-t05-safe-win-x64-0.20.0-rc.1.zip` | 173,420,410 | `7bfe71cc4dc11939261667778283eb7eeb601701ead34976c6072e2446a286b7` | Not applicable |
| installed/unpacked `marktext-scroll-acceptance-t05-safe.exe` | 226,508,288 | `1367e59f4cbed064dd7bda096879c70cd02d9093cfcd2eb7b5ced6ff439e353e` | NotSigned |

The installed executable and the final `win-unpacked` executable have the same SHA-256.

## Isolation and installer safety

The usable isolated installation is
`C:\Users\1407\.codex\installed\marktext-t05-ef5a10d-safe`. Its identity is
`com.github.marktext.marktext.scroll-acceptance-t05-safe`, product/uninstall name is
`MarkText Scroll Acceptance T05 Safe`, desktop and Start Menu shortcuts are disabled, and the
standalone config contains no `fileAssociations`. The accepted fresh install used `/S` with
`/D=<that path>`. Its before/after gate proved:

- the existing production `marktext` uninstall entry was byte-for-byte unchanged;
- the existing desktop and Start Menu shortcuts were unchanged;
- `.md`, `.markdown`, `.mmd`, `.mdown`, `.mdtxt`, `.mdtext`, `.mdx`, and
  `MarkText.Document` registry state was unchanged; and
- exactly one separately named T05 Safe uninstall entry was added.

Profiles are caller-owned below
`C:\Users\1407\.codex\artifacts\marktext-t05-ef5a10d-20260907-03\profiles`; no daily profile is
read or written. Each automated launch recorded the runtime's actual `userData` path. The
harness retained all profiles and proved that every discovered installed-executable PID exited
inside 15 seconds after the controlled close. Failures abort rather than start another trial.

Two safety incidents are retained rather than hidden:

1. An earlier config inherited the production `fileAssociations` array despite specifying `[]`.
   Its safety gate caught six changed defaults, and all six were restored and verified from the
   before snapshot. That failed package/install remains under the `-01` artifact root.
2. Reinstalling the final standalone identity over its already isolated `-02` location invoked
   the old custom uninstaller, which removed the association keys before copying `-03`. The
   gate caught this. All seven extension defaults, six empty `OpenWithProgids/Markdown` values,
   and the complete production `MarkText.Document` ProgID/icon/open command were recreated from
   the before snapshot and re-verified. The final installed exe equals the `-03` package exe.
   Therefore fresh isolated install is the supported procedure; in-place reinstall/uninstall is
   unsafe and must not be used for cleanup.

The failed-reinstall log is
`C:\Users\1407\.codex\artifacts\marktext-t05-ef5a10d-20260907-03\isolated-reinstall.log`
(SHA-256 `68e798c74c8a29ffb71058944794f9b070505cdf4de3742ae0758daf55b559aa`).

## Environment

- Windows 11 Pro `10.0.26200`, x64.
- Intel Core i7-10700, 16 logical processors, 34,060,939,264 bytes RAM.
- NVIDIA GTX 1070 active mode `2560x1440` at 144 Hz; `AppliedDPI=96` (nominal 100%).
- Harness Node `v24.18.0`; pnpm `10.33.4`.
- Installed MarkText `0.20.0-rc.1`; actual packaged runtime Electron `42.1.0`, Chromium
  `148.0.7778.97`, embedded Node `24.15.0`; `app.isPackaged=true`.
- Each measured window/viewport was `1280x720`, device scale factor 1, visual viewport scale 1.

## Three-run installed WYSIWYG result

Input semantics are 80 Playwright `page.mouse.wheel(0, 300)` pulses delivered to the real
installed WYSIWYG surface. All 240 renderer wheel events were `isTrusted=true`. This is an
automated Chromium protocol, **not** a physical mouse or touchpad claim.

| Run | Idle median / p95 / max (ms) | Active gaps; median / p95 / max (ms) | `>50 ms` | First input to move | Start → response → final / max |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | 7.0 / 7.1 / 8.2 | 313; 6.9 / 13.9 / 111.0 | 1/313 = 0.3195% | 1.7 ms | 0 → 300 → 24,000 / 36,575 |
| 2 | 6.9 / 7.2 / 7.7 | 292; 7.0 / 14.0 / 118.2 | 1/292 = 0.3425% | 2.0 ms | 0 → 300 → 24,000 / 36,575 |
| 3 | 6.9 / 7.0 / 7.5 | 308; 7.0 / 13.9 / 118.1 | 1/308 = 0.3247% | 2.1 ms | 0 → 300 → 24,000 / 36,575 |

Median per-run proportion is **0.3247%**, so the `<=5%` installed WYSIWYG threshold is
**Passed**. Idle cadence is about 6.9-7.0 ms, so the raw 50 ms criterion remains applicable; no
calibrated substitute was used.

In every run the workspace revision and Committed Scroll Position remained unchanged throughout
the active burst, the marked Outline DOM node remained connected, and the DOM moved immediately.
After 250 ms, exactly one workspace revision converged from `scrollTop=0` to the DOM's final
`24,000`; Outline identity remained connected. Thus the deterministic installed gate for no
active projection publish/no TOC-Outline rebuild/final convergence is **Passed**.

Raw evidence is [05-installed-scroll-acceptance.raw.json](./05-installed-scroll-acceptance.raw.json)
(106,996 bytes; SHA-256 `73c9a5f92ce2d48c07aaad491a80fdc6140e43670029ccc27f18156b2f2437b1`).
The full console log is `installed-acceptance.log` in the `-03` artifact root (SHA-256
`2e54d46e8cadf9ceef61f579ab02e7ac808320a012b511c1d409f48b3215efbe`).

## Automated matrix and limits

| Surface | Fixture/input | Cadence and frame gaps | Response/final | Windows outcome | Limits |
| --- | --- | --- | --- | --- | --- |
| WYSIWYG | 400 headings; 80 trusted automated wheel pulses x3 | raw retained above; median `>50 ms` 0.3247% | 1.7/2.0/2.1 ms first move; final converged once | Passed | not physical input |
| Source | same document; 20 trusted automated wheel pulses | 102 gaps; median 6.9 ms, p95/max 7.1 ms, 0 over 50 ms | first scroll 11.1 ms | Passed | 400-heading scale only; T06 owns 10k/50k capacity |
| Files / Folder tree | no Folder root | not sampled | not sampled | Untested | needs a dense folder fixture and manual global-interaction smoke |
| Outline | 400 rows; 20 trusted automated wheel pulses | 74 gaps; median 7.0 ms, p95 7.1 ms, max 7.3 ms, 0 over 50 ms | first scroll 0.3 ms | Passed | not physical input |
| Search | exact `Heading 250`; production animated destination | 51 gaps; median 7.0 ms, p95 13.8 ms, max 145.9 ms, 2 over 50 ms | 578 ms through polling/completion; converged once to 22,471 | Passed | programmatic navigation, not wheel/physical input |
| Preferences | default settings window | not sampled | not sampled | Untested | separate-window overflow fixture remains manual/phase 2 |
| Opened files region | one open Document here | not sampled | not sampled | Untested | link T07 exact 20/100/150 evidence; physical thumb/touchpad unavailable there |
| Tab-strip horizontal | one tab | not sampled | not sampled | Untested | needs many long-name tabs and horizontal wheel/shift semantics |
| Image-viewer zoom | no image | not sampled | not sampled | Untested | requires image fixture and explicit zoom input semantics |
| Command palette | overflowing production command list; 20 trusted wheel pulses | 71 gaps; median 6.9 ms, p95 7.3 ms, max 7.5 ms, 0 over 50 ms | first scroll 0.8 ms | Passed | not physical input |
| Other scrollable popup | no second representative popup | not sampled | not sampled | Untested | no general claim |

Linux and macOS installation, performance, and physical input are **Untested**.

T06 remains an independent result: 10k Source is P2/degraded and 50k Source is a confirmed
P1/high capacity defect. T07 remains independent: Opened Files has P2/medium scale pressure and a
startup delivery race. Neither changes the Passed WYSIWYG threshold, and neither is claimed fixed.

## Windows manual attempt and blocking follow-up

The user exercised the first installed package with a physical mouse wheel and the physical
scrollbar thumb. Wheel scrolling and thumb dragging were reported normal, responsive, able to
reach the requested positions, and free of obvious stalls or crashes. No physical touchpad was
available, so touchpad input is **Unavailable**, not Passed. The user also reported that the
sampled switching, pane movement, position-continuity and close checks passed except for this
exact sequence:

1. Move a Document View with **Move to New Window**.
2. Click the target window's top-right, window-level close button.
3. The View closes, but the BrowserWindow remains open with `New Tab`.

The defect was reproduced without user data by creating a synthetic valid committed crash-draft
pair, opening a normal saved Document, invoking the production Move menu callback, and clicking
the production title-bar close control. Before the repair, both the retained installed executable
and the development build produced the same failure:

```text
Expected: { windowCount: 1, targetClosed: true, targetTabs: [] }
Received: { windowCount: 2, targetClosed: false, targetTabs: ["New Tab"] }
```

The causal boundary was `PaneEditorComposition.closeForWindowExit()`: it durably closed the
current window's Documents, then treated the process-wide `mark-clean` response
`{ durable: false, reason: "unresolved crash drafts remain" }` as a reason to keep this already
emptied window open. The minimal repair distinguishes that process-dirty state from a genuine
clean-marker durability failure. It allows the current window to close but does not mark the
process clean and does not delete, tombstone, save, discard or otherwise resolve the unrelated
recovery draft.

Independent Spec review then found a second blocking boundary: the ordinary dirty-Document
Discard path did not check whether its own crash-draft disposition was durable before committing
the local close. Combined with the first repair, a failed local tombstone could therefore be
mistaken for an unrelated recovery draft. The review repair checks that disposition result and
returns a failed close before `commit-authorized`; a focused public-workspace regression verifies
that the original Document and View remain present and accept a subsequent edit.

Focused results after the repair:

- the public `closeForWindowExit()` unit contract passes when another recovery draft remains;
- a local discard/tombstone durability failure blocks window exit and leaves its Document and
  View usable;
- a negative unit case still returns false for a `clean-marker` durability failure;
- the real development-build Electron sequence now destroys the transfer target, retains the
  recovery window, and confirms the committed crash draft is still recoverable; and
- all 15 related Move/transfer/reopen Electron cases and all 20 startup/recovery Electron cases
  pass.

These automated results do not update the identity of the installed artifact above. That retained
executable is intentionally still the known-red build and is useful only as pre-fix evidence.

## Pending fresh-package manual re-verification

A fresh isolated Windows package must be built from the repaired source before final acceptance.
Do not use the old installed identity to approve the repaired behavior. In the new package, repeat
the Move to New Window sequence above and verify that the target BrowserWindow closes, the source
window remains usable, and the moved file can be opened again. Also perform a risk-proportional
smoke of the previously passed wheel, scrollbar-thumb, switching, Split Right and Move to
Left/Right paths. Record the physical touchpad as unavailable unless a device is actually present.
Windows final acceptance remains **Pending**; Linux and macOS remain **Untested**.

Cleanup boundary: the safe install directory and the `-03` profiles/artifacts are T05-owned.
Do not run either generated uninstaller because the repository's current `customUnInstall`
deletes global MarkText associations. After acceptance, cleanup must first snapshot associations,
terminate only verified T05 executable PIDs, remove only the exact T05-owned directories, remove
only the two T05 uninstall registry keys, and verify the daily MarkText install/profile,
associations, and shortcuts remain unchanged.
