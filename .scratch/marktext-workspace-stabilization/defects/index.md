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
- Status / owner: `Red-capable / Fix in progress`.
- Environment and profile: Windows packaged artifact with fresh profiles and a
  controlled ASCII Markdown fixture.
- Artifact and source SHA: current product artifact source `18ddfe27`; subsequent
  `8ed527e6` and `2412f6af` are documentation-only. Its SHA-256 values are
  `MarkText.exe` `A9BB4C10BEB24D00983F99BCA0E4945F308F136C54D26203208415E4FDAA46B1`
  and `app.asar` `5FBB2D7F27D27DBECBAC04761A2D5D25EB1437443DD0E2156AA9F3A241A5E7B6`.
- Reproduction rate: real File > Open is red 2/2 across two fresh profiles; the
  same exact fixture through CLI is green. Prior CLI, quoting, spaced/Chinese-path,
  and second-instance diagnostic cases remain green 5/5.
- Accurate entry and steps: use the same valid absolute `.md` through (1) a
  command-line explicit target with a fresh unique profile, (2) File > Open or
  Ctrl+O, (3) Windows file association/double-click, and (4) delivery to an
  already-running instance. For every entry, record actual opened path, title,
  and rendered/source content rather than inferring success from window text.
- Expected / actual: requested file opens / reported path displays only New Tab;
  Move cannot be exercised if only New Tab is present.
- Evidence: root `C:\Users\1407\AppData\Local\Temp\marktext-stab002-18ddfe27-13eb199c49d444198a92f08a84df1ed0`.
  In two fresh-profile File > Open runs, the user selected the controlled ASCII
  fixture in the real native dialog; both remain `Untitled-1`, with empty active
  pathname and missing sentinel. `main-trace-final-2026-08-28T08-59-43-362Z.json`
  records `canceled=false` and the correct path, while both `app-open-files-by-id`
  and main `webContents.send('mt::open-new-tab')` carry the correct document; after
  21 seconds Workspace still shows the original blank tab. The prior valid CLI
  controls remain: the final 5/5 trace is `C:\Users\1407\AppData\Local\Temp\marktext-stab002-75812bad9f064348a0d4ec53ad378c91\run-2026-08-28T05-19-09-123Z\results.json`, with CLI profile-first, file-first, strictly quoted PowerShell, spaced/Chinese absolute path, and second-file delivery to an existing instance all green.
- Red command: use the evidence-root native-dialog replay above; it is a real
  File > Open reproduction, not the prior CLI scope-narrowing probe.
- Root-cause boundary: evidence supports a regression boundary where renderer
  `LISTEN_FOR_NEW_TAB -> NEW_TAB_WITH_CONTENT` still writes the legacy editor
  store while the current Workspace UI uses the WorkspaceController facade.
  `NEW_UNTITLED_TAB` has a Workspace route, but the content path does not. This
  identifies the observed boundary and regression source, not a specific repair design.
- Related commit(s): current product source `18ddfe27`; `8ed527e6` and `2412f6af`
  are documentation-only.
- Acceptance / required regression: real File > Open on the current artifact must
  pass 2/2 with pathname and sentinel. Add Electron E2E coverage for controlled
  native-dialog response -> public command -> Workspace; cover clean blank
  replacement, dirty/non-empty tab retention, duplicate activation, and focused
  split pane. Run CLI/second-instance/no-restore/dirty/Split/Move adjacency plus
  typecheck, lint, and build. Windows association remains `Unavailable`; do not
  classify it as pass/fail or modify the registry.
- Record items / exclusions: evidence does not support a CLI or single-instance
  opening defect. Windows association/double-click is `Unavailable` and is not a
  verdict for this ticket.

## STAB-004 — tab reorder versus Split hit area

- Severity / rationale: P1 confirmed; tab-bar dragging triggers Split rather than
  reliably reordering a core workspace tab gesture.
- Status / owner: `Red-capable`; schedule the minimal fixing task after STAB-001
  to avoid two long-lived implementation worktrees.
- Environment and profile: current `fdda9330` Windows artifact with a unique
  profile; record window size and tab-count state.
- Artifact and source SHA: `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Reproduction rate: tab right-to-left and left-to-right reorders are red 2/2;
  title-bar left and right edge cases are each red 2/2, across independent fresh
  profiles.
- Accurate entry and steps: with multiple tabs, drag within the tab/title bar to
  reorder; drag into the document display area's left and right edges and release
  to Split; repeat at a narrow window; drag out of the window to initiate Move.
  Record the hidden-single-tab to visible-multi-tab transition as state, not as a
  defect by itself.
- Expected / actual: tab/title-bar drag only reorders existing tabs and never
  Splits; only release below the title bar in the document display area's left or
  right edge triggers Split; narrow windows disable Split; an out-of-window Move
  is never treated as Split.
- Evidence: actually run `node C:\Users\1407\AppData\Local\Temp\marktext-stab004-78dbd815090545368eb98b84007041be\stab004-drag-harness.mjs C:\Users\1407\AppData\Local\Temp\marktext-stab004-78dbd815090545368eb98b84007041be title-edge-left-a`. Representative red verdict trace: `C:\Users\1407\AppData\Local\Temp\marktext-stab004-78dbd815090545368eb98b84007041be\run-2026-08-28T05-33-52-535Z\results.json`; representative green document-edge verdict trace: `C:\Users\1407\AppData\Local\Temp\marktext-stab004-78dbd815090545368eb98b84007041be\run-2026-08-28T05-35-20-974Z\results.json`.
  Initial one-to-two-tab state changes computed tab-bar hidden to visible as
  expected. Within the tab bar (30-56px), left edge at y=43 and right edge both
  show Split preview and commit 1 -> 2 panes instead of reordering. The first
  erroneous transition is tab-bar release y=43 -> `preview=true` before mouse-up
  -> pane count 1 -> 2. Document-area left/right edges pass 2/2 with correct
  target pane/active target; root 719px passes with no preview, one pane and
  reordering, while 720px permits preview/Split.
- Red command: actually run as above; the two independent fresh-profile repeats
  establish the red-capable result.
- Root-cause boundary: narrowed only to the Split candidate/hit-test and tab-drag
  boundary, consistent with `candidateAt()` not excluding tab/title vertical
  space; no repair location or implementation is asserted.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: first add a red regression at the existing
  split/tab public UI seam. Any left/right drag in tab/title space must only
  reorder, keep preview empty, and keep one pane; document-area edges must still
  Split; 719px must disable Split while reordering, and 720px must permit Split.
  Do not add an abstraction or test hook. Follow with current-artifact manual
  replay.
- Record items / exclusions: single-tab hidden/multi-tab visible is a green state,
  not a separate bug. Physical drag-out-window Move is `Unavailable` under CDP;
  retain a manual "Move only, never also Split" replay. GPU/network/Crashpad logs
  have no stable correlation.

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

## STAB-R001 — Move bootstrap Untitled / final-tab replacement

- Severity / rationale: resolved in code; manual replay remains a release blocker
  for this behavior until confirmed on the current artifact.
- Status / owner: `Manual-retest`; coordinator owns black-box replay.
- Environment and profile: current `fdda9330` Windows artifact, fresh profile.
- Artifact and source SHA: repair is integrated in `fdda9330`.
- Reproduction rate: prior defect; current manual rate untested.
- Accurate entry and steps: Move a tab to a target window when the source's last
  tab is moved; verify the source-specific replacement behavior and no extra
  bootstrap Untitled in the target. This is not ordinary close-tab behavior.
- Expected / actual: target does not retain bootstrap Untitled; a source depleted
  by a successful Move receives its clean New Tab replacement / current artifact
  manual result not yet recorded.
- Evidence: automatic Move, last-tab, and startup regressions passed; final
  Standards and Spec reviews passed.
- Red command: historical red is resolved in automation; required evidence is a
  current-artifact manual replay, not a new root-cause assertion.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: manual replay on the traceable current
  artifact, then record in the matrix before `Closed`.
- Record items / exclusions: automated/review pass alone cannot close this item.
