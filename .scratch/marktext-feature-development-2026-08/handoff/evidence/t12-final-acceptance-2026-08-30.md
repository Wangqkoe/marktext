# T12 final acceptance evidence — 2026-08-30

## Current decision

T12 is **Completed / Accepted**. The current final candidate was built from source
HEAD `f6dcf9dbb949a972c4d3609294b858ab2d46b1d0`; its same-package automatic and
user-manual recovery/close gates passed. Independent final audit task
`01a05600-a111-71d1-952e-f79e64ebe20d` returned `PASS` with 0 blockers and
concluded that recording these facts is sufficient to close T12.

This conclusion is local-only. It does not authorize a push, publication, or
release distribution, and it does not turn supplementary `Untested` or
`Unavailable` environments into `Passed` results.

## Accepted candidate identity and build provenance

- Unpacked path:
  `C:\Users\1407\.codex\worktrees\dbc4\Marktext\dist\t12-final-f6dcf9db\win-unpacked`.
- Build source HEAD: `f6dcf9dbb949a972c4d3609294b858ab2d46b1d0`.
- Build worktree: `C:\Users\1407\.codex\worktrees\dbc4\Marktext`, clean at the
  recorded source HEAD before the build.
- Environment: Microsoft Windows 11 Pro 64-bit, version `10.0.26200` / build
  `26200`; Node `v24.18.0`; pnpm `10.33.4`; timezone
  `America/Los_Angeles` / `Pacific Standard Time`; current display `AppliedDPI`
  96 (100% scale).
- `marktext.exe` SHA-256:
  `7376677D7AA63841098B46D6AAD54F23676D394AC4D68AB5C1F89DFA1655218D`.
- `resources\app.asar` SHA-256:
  `97E4EF543A79BC756A3DAA0206D7A689E72876119FEA87DA5DF3FA6873098C2F`.
- `icudtl.dat` SHA-256:
  `C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.
- Original package manifest: 129 files / 476,334,302 bytes.
- Builder-log directory:
  `C:\Users\1407\AppData\Local\Temp\marktext-t12-rebuild-dce66f7b-c996-4318-bb28-974a34f5dbad`.

### Clean build and package commands

The candidate task ran these commands from the clean build-worktree repository
root, in this order:

1. `pnpm --filter marktext build` — **Passed**. This regenerated
   `packages/desktop/out` from `f6dcf9db`; the subsequent builder did not reuse a
   pre-existing/stale `out`. Trace files are
   `01-pnpm-filter-marktext-build.stdout.log` and
   `01-pnpm-filter-marktext-build.stderr.log` in the log directory above. The
   stderr trace contains only the recorded Vite dynamic-import chunk warnings;
   it is not an empty file.
2. `pnpm --filter marktext exec electron-builder --win --x64 --dir --publish never`
   — **Passed**. Trace files are
   `02-pnpm-filter-marktext-electron-builder.stdout.log` and
   `02-pnpm-filter-marktext-electron-builder.stderr.log`. The builder stderr is
   empty; stdout records `resolvedPackageManager=pnpm` and `pm=pnpm`.

Coordination-machine inspection also found the
`@vscode/ripgrep-win32-x64` manifest inside the resulting asar and found the
unpacked `rg.exe` present and runnable.

The first candidate run added the expected 157-byte runtime `debug.log` to the
unpacked directory. The post-run directory therefore recomputed as 130 files /
476,334,459 bytes. This is a runtime record item, not a source/package candidate
change; the original package manifest above remains the candidate identity.

## Evidence by observer

### Packaged automatic black-box evidence

The packaged harness command was not a repository script. PowerShell set
`MT_CANDIDATE` and `MT_LOG_ROOT`, then invoked Node plus Playwright `_electron`
with an inline/base64 harness. The complete invocation is retained in task
`01a055bc-3421-7cf3-8af6-466bb0a65233`; machine-decidable output is retained as
`03-packaged-stab012-blackbox.stdout.log` and
`03-packaged-stab012-blackbox-result.json` in the builder-log directory.

- **Passed — normal no-target:** isolated profile
  `C:\Users\1407\AppData\Local\Temp\marktext-t12-final-packaged-pnpm-AyVzk3`
  produced `BrowserWindow=1`; the exact candidate/profile process tree then
  reached zero. The `normal-single-window` and `normal-exit` events are in the
  `03` JSON/log.
- **Passed — CrashDraft recovery:** the same profile checkpointed marker
  `T12_PACKAGED_PNPM_STAB012_1788148049237`, then the harness precisely
  force-terminated the process tree. No-target restart produced
  `BrowserWindow=1`, `logicalWindows=1`, and `markerPresent=true`. Automatic
  Discard created `bXQtMA.tombstone.json`, and the final exact process list was
  empty. The `checkpoint`, `forced-tree-exit`, `recovery-single-window`,
  `discard-tombstone`, and `recovery-discard-normal-exit` events are in the `03`
  JSON/log; stdout ends with `PACKAGED_STAB012_BLACKBOX_PASS`.
- **Automation limitation:** this harness stub did not accept or simulate the
  native Save / Don't Save / Cancel dialog. That gate remained assigned to the
  same-package user trial below.

### Coordination-task machine actions and inspection

- Build provenance, package manifests, hashes, package-manager resolution, empty
  builder stderr, packaged ripgrep manifest, and runnable unpacked `rg.exe`
  matched the identity recorded above. The build command's separate stderr trace
  contains only the recorded Vite warnings described above.
- The same-package manual profile was
  `C:\Users\1407\AppData\Local\Temp\marktext-t12-final-manual-f6dcf9db-70c5e345-07fc-4811-a25e-f151df4a7afa`.
- The initial main PID was `14268`; its exact candidate/profile process tree had
  5 processes. The coordination task confirmed the checkpoint, precisely
  terminated that tree, and restarted the same candidate/profile. The restarted
  main PID was `58796`, again with an exact tree of 5 processes.
- Machine evidence root:
  `C:\Users\1407\AppData\Local\Temp\marktext-t12-final-manual-f6dcf9db-70c5e345-07fc-4811-a25e-f151df4a7afa\crash-drafts`.
  `bXQtMA.2.draft.json` was timestamped 2026-08-30 20:53:51 -07:00; draft and
  commit files for revisions 2–7 all matched the entered marker.
- `bXQtMA.tombstone.json`, at the same evidence root, was timestamped
  2026-08-30 21:03:57 -07:00 and records revision 7 / `discarded`.
  `clean-shutdown.json` was timestamped 2026-08-30 21:04:00 -07:00 and records
  `clean=true`.
- After manual acceptance, the exact candidate/profile process count was zero.

### User same-package manual acceptance

The user reported the following actions and observations on the accepted
candidate/profile; they are not represented as automated, coordination-machine,
or auditor-observed:

1. A fresh profile showed one `BrowserWindow`. The user entered
   `T12_FINAL_NATIVE_DIALOG_F6DCF9DB`.
2. After the coordination task's termination/restart, the user observed one
   `BrowserWindow` with logical tabs `Recovered Draft` + `Untitled-1`; Recovered
   Draft contained the marker.
3. Closing the recovered tab displayed the real Save / Don't Save / Cancel dialog.
4. Cancel retained the recovered tab, its content, and the two-tab logical state.
5. Closing again and choosing Don't Save removed the recovered tab, leaving only
   `Untitled-1`.
6. Closing the remaining `Untitled-1` closed the window and the entire process;
   final state was 0 windows / 0 processes, and no replacement New Tab or extra
   window appeared.

The timestamps above are profile-file machine evidence. The UI clicks and visible
window/tab states are the user's contemporaneous statements; no screen recording
was retained, and these facts are not represented as auditor observations.

### Independent final audit

Task `01a05600-a111-71d1-952e-f79e64ebe20d` independently reviewed the final
candidate closeout and returned `PASS`, 0 blockers. Its disposition is that T12
is sufficient to close once the same-package facts above are recorded. The audit
did not perform or claim the user's native-dialog actions itself.

For target-package provenance, the audit directly inspected
`resources\app.asar` from the fixed candidate, found the
`recoveryWindowCreated` guard in its `out/main/index.js`, and matched the asar to
SHA-256 `97E4EF543A79BC756A3DAA0206D7A689E72876119FEA87DA5DF3FA6873098C2F`.
Together with the recorded build-before-builder order, this proves the STAB-012
repair is present in the accepted package. This was fixed-artifact inspection,
not a claim that the commands were rerun during this documentation amendment.

## Historical `57d2ae4d` decision and reopening

T12 was `Completed / Accepted` for the previous stabilization round. The
independent final audit passed with 0 blockers. The audited integration tree was
clean at `6fdb3ac3`; its product head was
`57d2ae4d6435b157d3e82c5abc094167d5edb3c0`, and later commits were documentation
only. Active P0/P1 was 0 at that time.

STAB-012 subsequently invalidated that old package as the current final
candidate: no-target CrashDraft restart created a recovery window plus an extra
ordinary window, and the recovered close path required replay. Repair
`810db72d39b2ce29db9d3dfbecfca26be6e9a0c5` was integrated at
`85e5b61eaa18f6971338b5e1b2bdb8bb6bc57805`. Its ticket-scope evidence remains
in [STAB-012 evidence](stab-012-recovery-startup-close-2026-08-30.md). The later
`f6dcf9db` candidate and current evidence above supersede the reopening condition.

## Final artifact and evidence index

The formerly effective Windows unpacked artifact was the STAB-011 artifact. It is
retained only as historical evidence and is not the current accepted candidate:

- Path: `C:\Users\1407\.codex\worktrees\98fa\Marktext\dist\t12-final-57d2ae4d6435b157d3e82c5abc094167d5edb3c0\win-unpacked`
- Contents: 131 files, 476,433,733 bytes.
- `marktext.exe` SHA-256: `31559389FB1ED274512EA277798A9D1FCC9A5D98226F194242ABFE0E4C6DD23E`.
- `resources\app.asar` SHA-256: `94384F8856BD3BA26CA53F39495DC880F4943FBD53D6C80BED43B894E49A8D4E`.
- `icudtl.dat` SHA-256: `C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.

The final Details delta, regenerated-package provenance, automatic checks, and
fresh-profile manual 6/6 are recorded in [STAB-011 evidence](stab-011-details-floating-edit-2026-08-30.md).
Historical Windows build-readiness automation is retained at [T12 readiness
evidence](t12-windows-trial-readiness-2026-08-27.md), while its manual rows keep
their recorded, unclaimed status.
Earlier scoped manual/automatic evidence remains indexed by the stabilization
[triage queue](../../../marktext-workspace-stabilization/triage-queue.md) and
[manual regression matrix](../../../marktext-workspace-stabilization/manual-regression-matrix.md).
The STAB-012 repair and its intentionally limited ticket-scope replay are in
[STAB-012 evidence](stab-012-recovery-startup-close-2026-08-30.md). They explain
why the `57d2ae4d` package was rejected; the later `f6dcf9db` same-package evidence
above closes the final-candidate gate.

## Stale-package rejection and narrow inheritance rule

The initial `57d2ae4d` package reused stale `packages/desktop/out`: its
`app.asar` hash exactly matched the old `4669eeec` artifact despite a reported
Desktop 9/10. It was rejected and is not acceptance evidence. The output was
regenerated from target HEAD; the final artifact passed Desktop Details 10/10 and
its renderer bundle directly contains `block.enterSourceEditing()`.

The product delta from `4669eeec` to `57d2ae4d` is fixed and independently
reviewed: four PreviewToolBar HTML-edit route lines plus the corresponding
regression test. It does not touch startup, file I/O, window close, Move, Open,
Split, recovery, or IPC. Therefore evidence for those untouched paths on the old
artifact is inherited only for this fixed delta, while every affected Details
gate was rerun on the proven target package (including the final manual 6/6).

This is a strict, narrow exception to an otherwise same-artifact manual matrix:
inheritance is allowed only when all of the following are true: the delta is
fixed and independently reviewed as local; target-package provenance proves the
new code is present; and every affected gate is rerun on that target package. It
does not authorize general cross-package reuse or turn untested rows into passes.

## Remaining records and unclaimed boundaries

The following are not claimed as passed by this closeout: screen-reader behavior,
PDF visual inspection, real power-loss, remote/assistive input, and mixed-DPI or
multi-display physical operation. V1 disables unsupported external drag there and
retains menu Move. STAB-005 and STAB-009 remain deferred/P2 records. Existing
lint warnings and the workflow's specific `out`/`asar` wording are P2 records.

The historical audit and the current independent final audit classify these as
non-blocking records. STAB-012 invalidated the old artifact, but the accepted
`f6dcf9db` candidate has now passed the affected same-package recovery/close gate.

## Commit relationship

`12e26548eac4ff0980b6527e738d4b848c07a78b` is the STAB-011 implementation;
`57d2ae4d6435b157d3e82c5abc094167d5edb3c0` is its integration cherry-pick;
`e21b77c6aa30e75129c1ef2f43ec22c0e25bfcf1` records STAB-011 evidence; and the
audited `6fdb3ac3` integration tree adds documentation only after the product
head. STAB-012 repair `810db72d39b2ce29db9d3dfbecfca26be6e9a0c5` is integrated
as `85e5b61eaa18f6971338b5e1b2bdb8bb6bc57805`; the accepted final candidate is
built from `f6dcf9dbb949a972c4d3609294b858ab2d46b1d0`.
