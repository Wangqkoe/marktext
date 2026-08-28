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
  title-bar X, Ctrl+Shift+W, Ctrl+Q, or `CloseMainWindow`.
- Expected / actual: application exits / window returns to or retains New Tab and
  the same executable child process remains.
- Evidence: automated E2E reports 29/29 passed; that does not demonstrate
  packaged exit. Capture timestamp, PID and window count on the next run.
- Red command: unavailable today; diagnosis must add and run one packaged,
  unique-profile command that asserts main child-process exit for this exact SHA.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: red-capable packaged loop plus manual replay
  of every listed exit path; after a failed run force-clean only that exact
  executable process tree. Such cleanup must never be recorded as normal exit.
- Record items / exclusions: no root cause is asserted.

## STAB-002 — explicit valid Markdown launch opens New Tab

- Severity / rationale: P1 candidate, unconfirmed; an explicit-file startup is a
  supported core workflow and prevents Move when only New Tab appears.
- Status / owner: `New`; needs a fresh unique-profile comparison.
- Environment and profile: the target `.md` exists; the reported profile had a
  renderer-crash record and may have been affected by an old instance/profile.
- Artifact and source SHA: `fdda9330` packaged Windows artifact; exact artifact
  and profile must be captured by the diagnosing task.
- Reproduction rate: reported once; not established.
- Accurate entry and steps: launch with the specified existing `.md` target and
  inspect the initial tab; Move cannot be exercised if only New Tab is present.
- Expected / actual: requested file opens / window displays only New Tab.
- Evidence: user report; no fresh-profile comparison yet.
- Red command: unavailable today; diagnosis must run the same absolute file path
  against fresh, unique profiles and record entry method, timestamps, PIDs and
  window counts.
- Related commit(s): `fdda9330780edd11a79b84c6467eaed1cf1df61a`.
- Acceptance / required regression: reproducible explicit-target startup test and
  black-box replay from the same artifact/profile package.
- Record items / exclusions: do not assign a renderer, old-instance, or profile
  root cause before comparison evidence.

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
