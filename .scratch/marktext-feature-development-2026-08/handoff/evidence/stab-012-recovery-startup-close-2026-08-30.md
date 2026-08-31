# STAB-012 — CrashDraft recovery startup and close evidence — 2026-08-30

## Disposition and scope

STAB-012 is `Closed / Manual-retest Passed` at ticket scope. The old final
package's no-target CrashDraft restart created a recovery editor window and then
an extra ordinary editor window. This is a P1 because the supported emergency
recovery path must present one recovered editor workflow.

The production repair is task commit
`810db72d39b2ce29db9d3dfbecfca26be6e9a0c5`, integrated by cherry-pick as
`85e5b61eaa18f6971338b5e1b2bdb8bb6bc57805`. It changes only four production
lines in `packages/desktop/src/main/app/index.ts`: a local flag suppresses the
ordinary fallback editor when CrashDraft recovery already created its window.
No-target CrashDraft startup now creates exactly one recovery editor window.
Explicit launch files, normal startup with no recovery, and Controller/persistence
boundaries are unchanged.

This closes the P1's repair and isolated manual-retest ticket gate. It does not
complete the whole manual matrix or make T12 currently Accepted: the old final
artifact is invalid as the current candidate, and a package must be generated
from `85e5b61e` (or a later documentation-only descendant) for same-package
final-candidate regression and acceptance.

## Old artifact observation

The user reported that the former final package accepted at `57d2ae4d` created
two windows after a CrashDraft checkpoint, forced termination, and no-target
restart: the recovery window was followed by an ordinary window. The user also
observed a Recovered Draft disappear or close abnormally without confirmation.
The latter was not established as an independent root cause; it was retained as
a manual blocking condition and replayed on the repaired path. Recovery text is
not recorded in this evidence.

## Pre-repair red-capable run

This is the actual functional red light run before the production startup
orchestration change. The production baseline was
`f46c765c1891e70fcc421a64f40fa2404ff8559f`; the `BrowserWindow`-count regression
assertion had first been added in worktree `3c05`, but production startup code had
not yet changed.

- Working directory: `C:\Users\1407\.codex\worktrees\3c05\Marktext\packages\desktop`.
- Command actually run:

  ```powershell
  .\node_modules\.bin\playwright.cmd test --config=test/e2e/playwright.config.ts --grep="recovers a dirty untitled document with a stable recovery identity" --timeout=60000
  ```

- Isolated launch profile: `C:\Users\1407\AppData\Local\Temp\marktext-crash-untitled-rOtwiy`.
- Stdout log: `C:\Users\1407\AppData\Local\Temp\stab-012-red-ready-4cb40b60-9839-40a5-b60b-c1384cbeac58.log`.
- Stderr log: `C:\Users\1407\AppData\Local\Temp\stab-012-red-ready-30be79d7-f321-4f15-b893-21eaaa5b553e.err.log`.
- Time: 2026-08-31T01:13:59Z (2026-08-30 18:13:59 -07:00,
  America/Los_Angeles).
- Result: **1 test failed**. In the forced-crash dirty-untitled → no-target
  restart path, recovery content was present, then the `BrowserWindow` assertion
  at then-line 179 of `workspace-startup-policy.spec.ts` reported Expected `1`,
  Received `2`.

This is the product-fix-before red command required for STAB-012. It excludes
earlier Electron-launch/native-binding tool failures, which were not functional
red evidence; no recovery body text is recorded.

## Automated evidence

- Complete `workspace-startup-policy`: **18/18 passed**, including exact
  `BrowserWindow = 1`, recovered-first/bootstrap-first close order, Discard
  tombstone and exit, owned decision exactly once, and dirty Cancel/no-tombstone.
- Desktop typecheck: passed.
- Scoped lint: 0 errors; 6 existing warnings.
- Diff check: clean.
- Task-end process check: no relevant Electron or Node process remained.
- Independent Spec review: 0 blockers.
- Final narrow Standards review: 0 blockers, 0 record items.

## Isolated black-box manual replay

- Timestamp / zone: 2026-08-30, America/Los_Angeles.
- Profile: `C:\Users\1407\AppData\Local\Temp\marktext-stab012-manual-810db72d`.
- Entry: create a CrashDraft checkpoint, force termination, then restart with no
  explicit file target.
- Restart result: exactly one window appeared; the Recovered Draft contained the
  entered text.
- Close result: close displayed Save/Don't Save/Cancel. Cancel retained the
  recovered draft. A subsequent Don't Save closed the remaining window.
- Durable/exit result: exact artifact/profile process count was 0; tombstone
  count was 1.

No recovery body text is stored in this record.

## Artifact provenance and final-gate boundary

The manually used Windows `win-unpacked` artifact was produced in worktree
`3c05`; its production contents match `810db72d`. Its hashes are:

- `marktext.exe`: `79DC49D25BCE2C3A40FB0F3085394C6794BC2BCAC8DB406FB79828EE6328D803`.
- `resources\app.asar`: `6F7CBBC56562C28924C45A4ADB19BA0BBE67BEC07D0A6D04FF32AD55107DBF38`.

Subsequent test-only amendments do not change the production artifact. However,
this package is not an as-yet-generated final-candidate package from integration
HEAD. It is ticket-level evidence only and must not be represented as a new T12
acceptance, a complete manual-matrix pass, or evidence for untested screen-reader,
PDF, real-power-loss, or mixed-DPI paths.

## Related ledgers and gates

- [STAB-012 defect ledger](../../../marktext-workspace-stabilization/defects/index.md)
- [Stabilization triage queue](../../../marktext-workspace-stabilization/triage-queue.md)
- [Manual regression matrix](../../../marktext-workspace-stabilization/manual-regression-matrix.md)
- [T12 final acceptance evidence](t12-final-acceptance-2026-08-30.md)
