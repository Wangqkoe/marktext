# Workspace stabilization defect ledger

This is the sole local defect ledger. Do not create a second Wayfinder or edit
resolved Issues. Entries report observed facts; they do not infer unreported bugs.

## STAB-001 — packaged Windows app does not exit on fresh smoke

- Severity / rationale: P1 confirmed; the packaged app can remain alive after the
  final supported window close, making a core lifecycle unavailable.
- Status / owner: `Red-capable`; next owner is a minimal fixing task.
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
  `SC_CLOSE` and existing renderer title-X/close/quit paths are valid substitutes,
  while a final physical manual retest remains required.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: add a 1x1 dual-window sequential-close
  regression: close the first window, then the final window; within five seconds
  BrowserWindow count and exact process count are zero, with no replacement New
  Tab, for at least five consecutive runs. Preserve dirty and emergency semantics.
  After a failed manual run force-clean only that exact executable process tree;
  cleanup is not normal-exit evidence.
- Record items / exclusions: exclude the PowerShell/Get-FileHash tool error and
  the erroneous ordinary-last-tab harness expectation. GPU/network/Crashpad/
  No-buffer logs have no stable correlation with this failure.

## STAB-002 — opening a valid Markdown document fails or opens New Tab

- Severity / rationale: P1 candidate, unconfirmed; an explicit-file startup is a
  supported core workflow and prevents Move when only New Tab appears.
- Status / owner: `Reproducing`; scope narrowed to native File Open and actual
  file-association boundaries, with no fixing ticket.
- Environment and profile: the target `.md` exists; the reported profile had a
  renderer-crash record and may have been affected by an old instance/profile.
- Artifact and source SHA: `fdda9330` packaged Windows artifact; its exact
  artifact, final trace, and unique profile are captured in the final valid
  `run-2026-08-28T05-19-09-123Z` evidence below.
- Reproduction rate: the asserted renderer pathname/sentinel cases pass 5/5;
  native-entry cases remain unavailable rather than reproduced.
- Accurate entry and steps: use the same valid absolute `.md` through (1) a
  command-line explicit target with a fresh unique profile, (2) File > Open or
  Ctrl+O, (3) Windows file association/double-click, and (4) delivery to an
  already-running instance. For every entry, record actual opened path, title,
  and rendered/source content rather than inferring success from window text.
- Expected / actual: requested file opens / reported path displays only New Tab;
  Move cannot be exercised if only New Tab is present.
- Evidence: actually run `node C:\Users\1407\AppData\Local\Temp\marktext-stab002-75812bad9f064348a0d4ec53ad378c91\launch-assert.mjs C:\Users\1407\AppData\Local\Temp\marktext-stab002-75812bad9f064348a0d4ec53ad378c91`. The final valid 5/5 trace is `C:\Users\1407\AppData\Local\Temp\marktext-stab002-75812bad9f064348a0d4ec53ad378c91\run-2026-08-28T05-19-09-123Z\results.json`; `run-2026-08-28T05-14-53-283Z` and `run-2026-08-28T05-18-01-561Z` are also valid five-case green controls. Exclude `run-2026-08-28T05-11-10-943Z`, the first-round six-case harness failure, from passing evidence. Renderer pathname plus sentinel assertions passed 5/5: CLI profile-first, file-first, strictly quoted PowerShell, spaced/Chinese absolute path, and second-file delivery to an existing instance (same-window tab visible). File > Open/Ctrl+O truly invoked the native dialog but is `Unavailable` because Windows automation cannot operate its Explorer-owned filename control. `.md` UserChoice is `MarkText.Document`, but this unpacked environment has no open command, so association/double-click is `Unavailable`.
- Red command: no red exists. The command above is a green scope-narrowing probe,
  not a failure reproduction.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: before any repair, manually select a
  controlled fixture through native File Open and record active pathname/sentinel,
  or create a controllable dialog acceptance. Then test a usable association
  boundary. Use the same artifact/profile package for black-box replay.
- Record items / exclusions: current evidence does not support a CLI or
  single-instance opening defect; do not assign renderer, old-instance, or profile
  root cause.

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
