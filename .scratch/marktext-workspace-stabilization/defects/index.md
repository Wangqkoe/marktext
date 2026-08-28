# Workspace stabilization defect ledger

This is the sole local defect ledger. Do not create a second Wayfinder or edit
resolved Issues. Entries report observed facts; they do not infer unreported bugs.

## STAB-001 — packaged Windows app does not exit on fresh smoke

- Severity / rationale: P1 candidate; all ordinary supported exit paths leave the
  packaged app running, making a core lifecycle unavailable.
- Status / owner: `Triaged`; needs a packaged-loop diagnosing task to become
  red-capable.
- Environment and profile: Windows unpacked, fresh smoke profile.
- Artifact and source SHA: `fdda9330`; `C:\Users\1407\.codex\worktrees\7d74\Marktext\dist\win-unpacked`.
  Exact executable SHA-256 `C2059DDF1D3EE1D163BD781B7C5F1F56EDB7C783981A817DDB94151DCC558878`;
  `resources\app.asar` SHA-256 `73188C7FD3E34FDAF419BAFD69CE0654FAFEAA4A429EEE6EBD53DCCF8CD2445D`.
- Reproduction rate: observed in the reported fresh smoke run; count not yet
  established across isolated runs.
- Accurate entry and steps: launch that exact unpacked artifact, then use Alt+F4,
  title-bar X, Ctrl+Shift+W, Ctrl+Q, or `CloseMainWindow`. Cover the reported
  single-window packaged failure and the user-reported multi-window layouts with
  logical tab counts 1x1, 1x2, 2x1, and 2x2. In each layout, exercise
  representative close-tab, Alt+F4, and title-bar-X sequences on each window and
  then on the final remaining window.
- Expected / actual: application exits / window returns to or retains New Tab and
  the same executable child process remains.
- Evidence: automated E2E reports 29/29 passed; that does not demonstrate
  packaged exit. Preserve both the single-window packaged failure and the user
  multi-window report. Capture timestamp, PID, window count and logical tab
  state on the next run.
- Red command: unavailable today; diagnosis must add and run one packaged,
  unique-profile command that asserts main child-process exit for this exact SHA.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: red-capable packaged loop plus manual replay
  of every listed exit path; after a failed run force-clean only that exact
  executable process tree. Such cleanup must never be recorded as normal exit.
- Record items / exclusions: no root cause is asserted.

## STAB-002 — opening a valid Markdown document fails or opens New Tab

- Severity / rationale: P1 candidate, unconfirmed; an explicit-file startup is a
  supported core workflow and prevents Move when only New Tab appears.
- Status / owner: `New`; needs an entry-by-entry fresh unique-profile comparison.
- Environment and profile: the target `.md` exists; the reported profile had a
  renderer-crash record and may have been affected by an old instance/profile.
- Artifact and source SHA: `fdda9330` packaged Windows artifact; exact artifact
  and profile must be captured by the diagnosing task.
- Reproduction rate: reported once; not established.
- Accurate entry and steps: use the same valid absolute `.md` through (1) a
  command-line explicit target with a fresh unique profile, (2) File > Open or
  Ctrl+O, (3) Windows file association/double-click, and (4) delivery to an
  already-running instance. For every entry, record actual opened path, title,
  and rendered/source content rather than inferring success from window text.
- Expected / actual: requested file opens / reported path displays only New Tab;
  Move cannot be exercised if only New Tab is present.
- Evidence: user explicitly reports that opening an `.md` document has a problem;
  no fresh-profile, old-instance-isolated comparison yet.
- Red command: unavailable today; diagnosis must run the same absolute file path
  against fresh, unique profiles for all four entries and record entry method,
  timestamps, PIDs, window/tab state, actual path/title/content and command
  execution result.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: reproducible explicit-target startup test and
  black-box replay from the same artifact/profile package.
- Record items / exclusions: do not assign a renderer, old-instance, or profile
  root cause before comparison evidence.

## STAB-004 — tab reorder versus Split hit area

- Severity / rationale: P1 candidate; unexpected Split or failed reordering would
  make a core workspace tab gesture unreliable.
- Status / owner: `Triaged`; needs a real red-capable packaged reproduction.
- Environment and profile: current `fdda9330` Windows artifact with a unique
  profile; record window size and tab-count state.
- Artifact and source SHA: `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Reproduction rate: not established.
- Accurate entry and steps: with multiple tabs, drag within the tab/title bar to
  reorder; drag into the document display area's left and right edges and release
  to Split; repeat at a narrow window; drag out of the window to initiate Move.
  Record the hidden-single-tab to visible-multi-tab transition as state, not as a
  defect by itself.
- Expected / actual: tab/title-bar drag only reorders existing tabs and never
  Splits; only release below the title bar in the document display area's left or
  right edge triggers Split; narrow windows disable Split; an out-of-window Move
  is never treated as Split.
- Evidence: code reading shows `candidateAt()` uses the workspace root's full
  vertical range and does not exclude the tab/title region. This is risk evidence,
  not a confirmed product failure.
- Red command: unavailable today; diagnosing task must add and run a packaged
  unique-profile loop that records pointer target, window bounds, tab state and
  observed reorder/Split/Move outcome.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: reproduce first, then add focused regression
  and current-artifact manual replay for all stated boundaries.
- Record items / exclusions: do not modify code in this documentation task; do
  not classify single-tab hidden/multi-tab visible behavior as a separate bug.

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
- Evidence: the current Move red-light does not include these logs.
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
- Accurate entry and steps: Move a tab to a target window and close the final tab;
  verify no extra bootstrap Untitled target and the proper New Tab replacement
  behavior where specified.
- Expected / actual: target does not retain bootstrap Untitled; final-tab behavior
  follows the integrated rule / current artifact manual result not yet recorded.
- Evidence: automatic Move, last-tab, and startup regressions passed; final
  Standards and Spec reviews passed.
- Red command: historical red is resolved in automation; required evidence is a
  current-artifact manual replay, not a new root-cause assertion.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: manual replay on the traceable current
  artifact, then record in the matrix before `Closed`.
- Record items / exclusions: automated/review pass alone cannot close this item.
