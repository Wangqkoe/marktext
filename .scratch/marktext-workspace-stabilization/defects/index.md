# Workspace stabilization defect ledger

This is the sole local defect ledger. Do not create a second Wayfinder or edit
resolved Issues. Entries report observed facts; they do not infer unreported bugs.

## STAB-001 — packaged Windows app does not exit on fresh smoke

- Severity / rationale: P1 confirmed; the packaged app can remain alive after the
  final supported window close, making a core lifecycle unavailable.
- Status / owner: `Verified / Closed`; ticket-level automated acceptance and the
  recorded physical manual-close acceptance are satisfied. The overall Workspace
  stabilization stage remains in progress.
- Environment and profile: Windows unpacked, fresh smoke profile.
- Artifact and source SHA: `fdda9330`; `C:\Users\1407\.codex\worktrees\7d74\Marktext\dist\win-unpacked`.
  Exact executable SHA-256 `C2059DDF1D3EE1D163BD781B7C5F1F56EDB7C783981A817DDB94151DCC558878`;
  `resources\app.asar` SHA-256 `73188C7FD3E34FDAF419BAFD69CE0654FAFEAA4A429EEE6EBD53DCCF8CD2445D`.
- Reproduction rate: the minimum stable red is B 1x1, 2/2 failures; B 1x2 and
  B 2x1 each failed 1/2, B 2x2 failed 2/2, and dual-window quit failed 1/2.
- Accurate entry and steps: launch that exact unpacked artifact, then use Alt+F4,
  title-bar X, Ctrl+Shift+W, Ctrl+Q, or `CloseMainWindow`. Cover the reported
  single-window packaged failure and the user-reported multi-window layouts with
  logical tab counts 1x1, 1x2, 2x1, and 2x2. In each layout, exercise
  representative close-tab, Alt+F4, and title-bar-X sequences on each window and
  then on the final remaining window.
- Expected / actual: application exits / window returns to or retains New Tab and
  the same executable child process remains.
- Evidence: `events.ndjson` beside the command below records three runs plus one
  harness/tool error. The valid A and B packaged rounds are traceable by their
  existing stdout/events timestamps; `matrix.json` covers only the final round,
  not both. A 1x2 native `SC_CLOSE` passed 2/2 and A 1x2 title-bar X passed 2/2.
  The harness's `a-tab-last-semantic` expects a replacement New Tab after closing
  the ordinary final tab, contrary to current product acceptance; exclude that
  harness error from the failure matrix. Events show ordinary final-tab close
  reaches zero window/process as required. The first actual erroneous transition
  is two windows -> close one -> one window -> final title-bar close: expected
  zero windows and zero exact-artifact processes, but the exact artifact remains
  alive. Automated E2E's prior 29/29 pass does not demonstrate packaged exit.
- Red command: actually run: `& 'C:\Users\1407\AppData\Local\Temp\stb001-96c37fafc05e49f5856901746a5bd549\stb001.ps1' -Mode full`.
- Root-cause boundary: narrowed only to `EditorWindow native close ->
  mt::ask-for-close -> renderer workspace.closeForWindowExit() ->
  mt::close-window -> WindowManager.forceClose()` handoff; no specific code root
  cause is asserted. Windows rejected physical `SetForegroundWindow`, so injected
  Alt+F4/mouse-X automation is `Unavailable`; packaged native WM_SYSCOMMAND/
  `SC_CLOSE` and existing renderer title-X/close/quit paths are valid substitutes.
  The physical manual retest is complete on the implementation-equivalent artifact:
  the user used Ctrl+N to create a second window, then closed the two windows with
  Alt+F4 and the title-bar X respectively; both windows and the process exited
  normally. This records only those completed steps, not all close combinations.
- Integrated repair and provenance: implementation branch commit `28afe83f` is
  integrated by `18ddfe27db10fcea2412ac066ce6e6a20af2536f`
  (`fix(desktop): preserve close handoff across hash navigation`). The recorded
  implementation tests and build passed; the traceable artifact hashes are exe
  `2A467D5F457A83695788242A15A3B43D994F222E87DA19C5D37CECC24A00A478` and
  `app.asar` `C140C4CD70DB7BCE9B39FB8F59FD66DD747D493FF9649F22DA721D20DE8B26BB`.
- Independent integration verification: at integration HEAD `18ddfe27`, the new
  dual-window E2E passed 5/5; adjacent CrashDraft/startup/MoveRecovery/tab-transfer
  unit tests passed 64/64; the cross-document reload old-receipt-revocation E2E,
  typecheck, and Windows x64 build all passed. The packaged dual-window close
  scenario passed 3/3 with zero replacement windows, zero remaining `MarkText.exe`
  processes, and no forced cleanup. Its distinct integration-artifact SHA-256 values
  are `MarkText.exe` `A9BB4C10BEB24D00983F99BCA0E4945F308F136C54D26203208415E4FDAA46B1`
  and `app.asar` `5FBB2D7F27D27DBECBAC04761A2D5D25EB1437443DD0E2156AA9F3A241A5E7B6`.
- Independent review: Standards PASS (0 blockers, 0 records); Spec PASS (0
  blockers, 0 records). Spec notes that the test's active hash navigation is a
  root-cause amplifier rather than a literal user step, but the baseline exact
  red, repair 5/5, packaged scenario 5/5, and manual Alt+F4/title-bar-X passes
  make the evidence sufficient.
- Root-cause / behavior boundary: same-document/hash navigation retains the
  close-handoff endpoint. Cross-document navigation and destroy still revoke or
  clean it up. This does not change ordinary final-tab close semantics or the
  replacement-page behavior when Move exhausts a source window.
- Acceptance / required regression: satisfied by the 5/5 dual-window E2E and the
  3/3 packaged dual-window close validation: the first window and then the final
  window close within five seconds, with zero BrowserWindows and exact processes,
  and no replacement New Tab. Dirty and emergency semantics remain preserved.
- Record items / exclusions: exclude the PowerShell/Get-FileHash tool error and
  the erroneous ordinary-last-tab harness expectation. GPU/network/Crashpad/
  No-buffer logs have no stable correlation with this failure.

## STAB-002 — opening a valid Markdown document fails or opens New Tab

- Severity / rationale: P1 confirmed; File > Open is a supported core workflow,
  and a valid selected document remains a blank New Tab rather than opening.
- Status / owner: `Verified / Closed`; the Workspace stabilization stage remains
  in progress.
- Integrated repair / provenance: production commits `64695b24` and `c0feefc6`.
  Follow-up lint-only `cd64cfc3` is not in this worktree; its independent review
  was a mechanical/Standards PASS, Workspace runtime passed 47/47, and its scoped
  lint had 0 errors. The complete code change also passed independent
  Standards and Spec review with 0 blockers.
- Independent integration verification: at `379fa6e5`,
  `workspace-native-file-open.spec.ts --repeat-each=5` passed 20/20 through the
  public-menu native-dialog response seam. Startup/no-restore/dirty/Split/Move and
  STAB-001 close adjacency passed 35/35; Workspace units passed 81/81; desktop
  typecheck and Windows x64 build passed. The integration unpacked artifact hashes
  are exe `CDB66BCBF80F01610F66BCAD6F9776188A8D2259C7FF469C6698319684AC063A` and
  `app.asar` `1F905007B6CF921FAA6E6A90B733B03F4CB20A23B22169B2B4BD24D9B8E31DC5`.
- Packaged evidence boundary: the repair task's real native File > Open
  fresh-profile 2/2 passed on its repair-branch artifact, hashes exe
  `96A8C399AEADAF4FFD860CDC378867151C88A99FF250173E4B6B016AD082C4BB` and
  `app.asar` `58A3CC22EDC6D8E70B2F36B42277A0221F8C037D4B77E76BBFDC1E92A65F8E68`.
  The independent integration task's real native dialog remains `Unavailable`;
  this is not an integration packaged 2/2 claim. Windows association/double-click
  remains `Unavailable`; the registry was not modified.
- Acceptance: clean blank replacement, dirty/non-empty retention, batch open,
  duplicate activation, focused-pane routing, metadata preservation, and required
  Workspace adjacencies are covered by the recorded automation and reviews.

## STAB-005 — second-instance rejects separated --user-data-dir value

- Severity / rationale: P2 confirmed; the separated `--user-data-dir` form can
  show an error dialog and prevent a file from being delivered to an existing
  instance, while the user command and existing harness use the green equals form.
- Status / owner: `Red-capable / Deferred record`; it does not block STAB-002 and
  is not part of the current repair.
- Actual red: the exact integration artifact with separated argv
  `--user-data-dir`, `<profile>`, `<file>` produced `ArgError: option requires
  argument: --user-data-dir` in the second instance and did not deliver the file,
  1/1. Verified profile evidence is
  `C:\Users\1407\AppData\Local\Temp\marktext-stab002-independent-1518fe8750934b5d9db8afba8bcd7d9c\profile-1`.
- Green control: with fresh profiles, primary
  `--user-data-dir=<profile> file1` and secondary
  `file2 --user-data-dir=<same-profile>` passed consecutively 2/2: two documents
  and two tabs, secondary active, and no Error window. Evidence roots are
  `C:\Users\1407\AppData\Local\Temp\marktext-stab002-ab-A1-fa1c755fadd748cbbecc7154c63298de`
  and `C:\Users\1407\AppData\Local\Temp\marktext-stab002-ab-A2-1a87f3bf7fd747f0a586653ab94fc767`.
- Provenance / boundary: second-instance parse behavior and the parser spec date
  to 2019, rather than this repair. User commands and the existing harness use
  the equals form.
- Future acceptance: both separated and equals argv forms must avoid an error
  dialog and correctly deliver the requested file to the existing instance.

## STAB-004 — tab reorder versus Split hit area

- Severity / rationale: P1 confirmed; tab-bar dragging triggers Split rather than
  reliably reordering a core workspace tab gesture.
- Status / owner: `Verified / Closed`; the repair is integrated and independent
  Standards and Spec reviews both PASS with 0 blockers. The overall Workspace
  stabilization stage remains in progress.
- Integrated repair / provenance: production change `abfdb3f9` and the two-tab
  regression `4b489a7f` are integrated at `5cd3c0b57fa6d45f2e724219a2c60f1f6cb9afa0`.
- Required behavior: exactly two tabs dragged within title/tab space only reorder,
  show no Split preview, and release with one pane. A release below title space at
  the document area's left/right edge Splits; 719px disables Split while 720px
  permits it.
- Independent integration verification: `split-workspace.spec.ts` with
  `--repeat-each=10` passed 50/50. Two-tab title-bar reorders passed in both
  directions 10/10 with no preview and one pane after release; document left/right,
  title, and 719/720 cases each passed 10/10. `native-gesture` plus
  `move-action-preflight` passed 15/15. Desktop typecheck, scoped lint, and the
  Windows x64 build passed.
- Artifact hashes (Windows x64 integration build): zip
  `C6F150F74BAB11DECF1113C75C384E2B76EEFDD0646E8560FC95E14F89FB0E31`; setup
  `7303076613608B60F25D870E1501B8E8273B4FF9D02B19786C1054563DD1E65E`; blockmap
  `7D281874D1DD4E79CE4CB25299D3679DE961B29B48FEEC203B9B976EEB549EDC`.
- Evidence boundary: integration verification found no directly reusable packaged
  harness, so this entry makes no packaged-automation claim. The repair task's
  temporary artifact harness recorded consecutive 10/10 passes in each reorder
  direction and two all-green rounds for title/document/719/720; that is repair-
  branch evidence only. Real OS drag-out-of-window Move remains a manual boundary
  and adjacency scope, not an unpassed requirement for this ticket.
- Record items / exclusions: single-tab hidden/multi-tab visible is a green state,
  not a separate defect. GPU/network/Crashpad logs have no stable correlation.

## STAB-P001 — distinguish filesystem Move To from window Move

- Classification / rationale: Confirmed process/test-guide record, not product
  P1. It does not block release unless its own operation loses data.
- Status / owner: `Closed` as the incorrect test chain; retain the filesystem
  behavior check in the matrix.
- Evidence: File > Move To sends `mt::editor-move-file`, then uses
  `dialog.showSaveDialog` and `fsRename`; it moves the current file to a disk
  path, so a save-style dialog is expected. Cross-window Move is the tab context
  menu `Move to new window` or dragging the tab out of the window and releasing.
- Corrected guidance: never use File > Move To to test window Move. Test it as a
  filesystem rename/move operation, including data preservation, separately.
- Acceptance / required regression: matrix separates filesystem Move To from
  tab-context/drag cross-window Move.

## STAB-003 — process/log anomaly record

- Severity / rationale: pending; logs alone have no proven user-visible failure.
- Status / owner: `Triaged` record; collect only with a reproduction.
- Environment and profile: capture with the associated failing artifact/profile.
- Artifact and source SHA: unbound until a time-correlated failing run exists.
- Reproduction rate: unknown.
- Accurate entry and steps: collect only around a reproduced defect.
- Expected / actual: no causality claim / renderer killed, network-service
  crash/restart, GPU exit, Crashpad `CreateFile` `0x2`, and `No buffer store found`
  have been seen in logs.
- Evidence: STAB-001, STAB-002, and STAB-004 diagnostics found no stable renderer,
  network, GPU, Crashpad, or No-buffer relationship to their failures or
  unavailable paths.
- Red command: none; upgrade only if a stable time relationship before failure is
  demonstrated by a recorded run.
- Related commit(s): none established.
- Acceptance / required regression: retain as a record unless correlated; then
  split or link to the reproduced defect.
- Record items / exclusions: not a root-cause explanation for STAB-002 or Move.

## STAB-006 — tab-context Move to new window does nothing on current artifact

- Severity / rationale: P1 confirmed. A documented core workspace action is unavailable: selecting `Move to new window` leaves the source unchanged and creates no target window.
- Status / owner: `Resolved / automated verified on current source+fresh build`; current packaged Windows/manual retest remains pending.
- Environment and profile: Windows x64 unpacked artifact at integration HEAD `9715ced78567d153d112a58f33a4b8542897abf3`; fresh profile `C:\Users\1407\AppData\Local\Temp\marktext-final-move-repro-95b3e0a4a9c043b386f0a422d2df2923`.
- Artifact hashes: `marktext.exe` `C388054D20B8A271C2B2759219BAC7136042A914D5A5534666ADF596B86E21DA`; `resources\app.asar` `ED53C8D11EAF20EFF5BAAE953ECF85662034494598DFB0DCBE43D3178167E9E7`.
- Accurate entry and reproduction: direct exact-artifact launch at `2026-08-28T08:41:31-07:00`, main PID `37800`; Ctrl+O opened `C:\Users\1407\AppData\Local\Temp\marktext-final-native-open-9d3e0cc3.md` with sentinel `FINAL_NATIVE_OPEN_SENTINEL_9D3E0CC3`. User right-clicked that file tab and selected `Move to new window`. After three seconds, at `2026-08-28T08:42:25-07:00`, only the original window remained; no target window was created and source ownership was unchanged. Exact artifact main, renderer, GPU, utility and Crashpad processes remained; no cleanup was used.
- Expected / actual: a target window containing the file/sentinel and a source replacement clean tab with no old-file copy / no target window and no ownership change.
- Manual reproduction entry actually run: `& 'C:\Users\1407\.codex\worktrees\98fa\Marktext\dist\win-unpacked\marktext.exe' '--user-data-dir=C:\Users\1407\AppData\Local\Temp\marktext-final-move-repro-95b3e0a4a9c043b386f0a422d2df2923'`, followed by the stated native menu action.
- Diagnostic boundary: this is not a deterministic red-capable command. Before repair, establish and run an automated or otherwise deterministic diagnostic loop that asserts no target window/ownership migration.
- Scope boundary: `Open in new window` was separately user-confirmed in a different fresh profile. Physical drag-out and filesystem `File > Move To` are untested and are not inferred from this result.
- Current automated evidence: integration `codex/marktext-feature-development-2026-08` at `8f3e0303`; equivalent validation tree `14d57913` (identical file tree) ran the native-menu callback regression 1/1 on a fresh desktop build. This is not a current packaged/manual acceptance claim.

## STAB-007 — dirty untitled document cannot invoke Save

- Severity / rationale: P1 confirmed. Saving an untitled dirty document is a core data-safety workflow; both supported entries did nothing and no target file was created.
- Status / owner: `Resolved / Manual-retest Passed` for the complete STAB-007 packaged-manual regression: both supported untitled entries (Ctrl+S and File > Save) reach native Save As, and Cancel, double Ctrl+S, and already-bound Save pass on the final artifact; see [manual retest evidence](../../marktext-feature-development-2026-08/handoff/evidence/stab-007-sender-save-as-2026-08-29.md). This does not complete the full Windows/manual matrix, T12, final Review, or Acceptance.
- Historical failed artifact / reproduction: integration `5847be6e`; its packaged artifact returned the selected path from the real Save As dialog, but the target did not exist and the title stayed `Untitled`/dirty. The diagnostic branch `f593a5aa` (**DO NOT MERGE**) reproduced this twice: `showSaveDialog` reported `canceled:false` and the correct `filePath`, then `save-as` arrived and the coordinator rejected it as `unknown or revoked sender` before writing.
- Root cause: `DocumentIoElectronAdapter` detached on every `did-start-navigation`. A same-document/hash navigation revoked the authenticated sender, while `EditorWindow` did not emit `did-finish-load` to attach it again; the subsequent Save As was therefore rejected before the write.
- Fix lineage: `e583ee79` improves dialog return-shape handling and Save test boundaries; `adaca3fa` revokes only for main-frame, non-same-document navigation, retains same-document/subframe senders, and still revokes destroyed senders. `e583ee79` + `adaca3fa` are fast-forwarded into integration `codex/marktext-feature-development-2026-08` at `adaca3fa36279ceb8f8deac37fff692851274586`; diagnostic `f593a5aa` is not merged.
- Independent review: final Standards and Spec reviews both `Passed`, with 0 blockers and 0 record items. The Electron 42 local declaration is `Event<T> = base & T`, so navigation flags are top-level properties of the first argument.
- Automated validation: relevant unit suites passed (6 files / 90 tests); native-save Electron E2E passed twice consecutively (5/5 each); desktop typecheck/build and a fresh `electron-builder --dir` passed (exit 0). Scoped production/E2E lint had 0 findings. The adapter's existing 74 errors / 1 warning match the fixed point and are a non-blocking record, not a STAB-007 regression.
- Final packaged artifact: `C:\Users\1407\.codex\worktrees\1e9a\Marktext\dist\win-unpacked\marktext.exe`, 226,508,288 bytes, SHA-256 `1F22983EDFF222820D1F81CF37C613191C01006E4E31E98A30125390ECAC745F`; `resources\app.asar`, 149,922,040 bytes, SHA-256 `84CC7476C0665A47D77AE3654188A49BBA6D01E6A44E8F612689CD1DBB623099`.
- Same-hash manual retest: Save As created `native-save-fixed.md` with exactly `STAB007_NATIVE_SAVE_ADACA3FA` (31 bytes; SHA-256 `FA3695097FA49D135A91A3292D51FA19319CAFD638ED5DBF11D3B92E234CD398`), and the window title rebound to `native-save-fixed.md`. CrashDraft produced a tombstone; normal close produced `clean-shutdown.json`.
- Remaining boundary: the historical `9715ced7` Ctrl+S/File > Save failure remains historical evidence. The complete STAB-007 save-path manual retest is passed; all other manual-matrix scenarios remain unclaimed here.

## STAB-008 — Details disclosure indicator does not hide body

- Severity / rationale: P1 confirmed. V1 Spec 209-213 and A11 require the Details summary control to hide/show its body; the indicator changed from down to right but `DETAILS_BODY_SENTINEL_4BDE701A` remained visible. Source mode and source→editor round-trip retained the original markup.
- Status / owner: `Resolved / automated verified on current source+fresh build`; current packaged Windows/manual retest remains pending.
- Environment / evidence: old current-unpacked observation used fresh profile `marktext-final-details-99662edb0981431ea10e16809de5d986`; it remains historical. Independent candidate `b78c75f8` passed final Standards and Spec review (0 blockers each); integrated source `8f3e0303`, validation tree `14d57913` (identical file tree), passed the exact empty-line sentinel Electron regression repeat3 (3/3), Muya details/roundtrip/static Vitest 35/35, and Chromium details+sanitize 9/9. Root cause/fix boundary: Marked had split empty-line Details tokens; parser now merges matching Details tokens with quote/raw-text awareness in one pass and replays unmatched tokens in order. R2 attribute/O(n²) and textarea RCDATA R4 cases are covered; 8k is about 751ms (Marked baseline-consistent), versus 8.94s under the old R2 algorithm. This remains automated evidence only: screen-reader, PDF visual inspection, and current packaged Windows manual retest are untested.

## STAB-009 — File Move To leaves visible title stale after successful rename

- Severity / rationale: P2. The controlled source was removed and target retained its exact sentinel, but the visible title remained the old source filename.
- Status / owner: `New` record; no repair in this task.
- Environment / evidence: current unpacked artifact; fresh profile `marktext-final-move-to-d4a3de72b8654fda92c918db30ce1c63`; target `C:\Users\1407\AppData\Local\Temp\marktext-final-move-to-target-6512.md` SHA-256 `C17E8DF678CCE8D153E62900FBD858F95CB615BA7E871848313486AE06233769`.

## STAB-R001 — Move bootstrap Untitled / final-tab replacement

- Severity / rationale: resolved behavior; the required current-artifact manual
  black-box replay is complete.
- Status / owner: `Verified / Closed`.
- Environment and profile: fresh unique profile and fixture under
  `C:\Users\1407\AppData\Local\Temp\marktext-stab-r001-rerun-59768bdffdac4b428c93551d4a50fbbe`.
- Artifact and source SHA: runtime source `379fa6e5`; `marktext.exe`
  SHA-256 `CDB66BCBF80F01610F66BCAD6F9776188A8D2259C7FF469C6698319684AC063A`;
  `app.asar` SHA-256 `1F905007B6CF921FAA6E6A90B733B03F4CB20A23B22169B2B4BD24D9B8E31DC5`.
- Reproduction / acceptance rate: manual current-artifact replay `1/1` passed.
- Accurate entry and result: with `STABR001-move.md` (sentinel
  `STABR001_MOVE_SENTINEL`) as the only real source file tab, right-clicking that
  tab and selecting `Move to new window` produced exactly two windows. The target
  had exactly the moved file document/tab with the correct pathname and sentinel,
  and no bootstrap Untitled/New Tab. The source remained with exactly one clean
  New Tab and no old-file copy; there was no duplicate document or third window.
- Shutdown evidence: both windows closed normally and no process whose
  `ExecutablePath` matched the exact artifact remained.
- Record items / exclusions: this did not test ordinary close-last-tab and did
  not use `File > Move To` or `Open in new window`.
