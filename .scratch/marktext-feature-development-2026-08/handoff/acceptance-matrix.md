# Workspace Features V1 — acceptance matrix

Requirement sources are the [V1 Spec](v1-spec.md) and its linked resolved Issues.
The evidence owner records command, environment, artifact/trace and status on the
integration branch; `Passed` may be claimed only with all four.

| ID | Requirement / evidence owner | Exact automated command / environment | Manual verification | Gate |
| --- | --- | --- | --- | --- |
| A01 | WorkspaceController runtime invariants, immutable projection, lease rejection — T01/T02 | `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts` (Node/Vitest) | two panes: edit/switch/focus without leakage | required |
| A02 | StartupIntent, DefaultStartupPolicy, and two emergency boundaries — T01 | `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-startup-policy.spec.ts` (Node/Vitest) | no target→clean New Tab; explicit target→only target; unified scan receives distinct CrashDraft and Move inputs; memory CrashDraft proves monotonic identity/revision, atomic durable-ACK progression, stale-ACK rejection, and corrupt-latest fallback | required |
| A03 | panes/tabs/focus/collapse/last-tab and live source/history — T02/T03 | `pnpm -C packages/desktop exec playwright test test/e2e/split-workspace.spec.ts test/e2e/last-tab-window-close.spec.ts --workers=1` (Electron Playwright) | deterministic two-pane proof mounts two independent PaneEditorComposition instances against one WorkspaceController, shows different active documents simultaneously, and proves a global editor command changes only FocusedPane; also cover narrow 719/720px, divider clamp/reset, keyboard focus, ordinary restart does not restore pane state, and (new product decision) the final clean tab closes its window through the tab button/tab command, Alt+F4, and Windows title-bar X with no blocking New Tab; manually verify dirty Save/Discard/Cancel preserves the existing confirmation and CrashDraft safety semantics | required |
| A04 | FileObservationHub/DiskRevision/CAS — T04 core | `pnpm -C packages/desktop exec vitest run test/unit/specs/file-observation-hub.spec.ts test/unit/specs/disk-revision-cas.spec.ts` (deterministic memory adapters) | none in T04; real windows are A08/A13 | required |
| A04b | authenticated DocumentIO coordinator and typed adapter — T04b | `pnpm -C packages/desktop exec vitest run test/unit/specs/document-io-coordinator.spec.ts test/unit/specs/document-io-electron-adapter.spec.ts` (real coordinator with authenticated typed IPC/preload harness): reject forged sender/window/session and never identify by payload window ID; after rebind/close/navigation-reload/destroy/dispose, old `ownerFence`, observer and late durable ACK are inert and its main subscription/lease mapping is fully cleared with no old subscriber receiving an event; failed/not-durable Save preserves dirty/path/document revision/observed DiskRevision/binding; exactly one matching durable ACK updates landed revision/clean state, duplicate/late ACKs inert; CAS/ACK identity, Save As/rename rollback and observer conflict | none in T04b; real dual-window/UI behavior remains A08/A13 | required |
| A05 | Move capsule digest, fence, capability, unique owner — T05 | `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-core.spec.ts` (deterministic transport) | inspect recovery projection only | required |
| A06 | WAL intent/observed and crash/replay gaps — T05 | `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-recovery.spec.ts` (kill/restart scheduler) | no standalone manual claim | required |
| A07 | MoveRecovery owner migration/tombstone/GC under every startup policy — T05/T06 | `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-emergency-recovery.spec.ts` then `pnpm -C packages/desktop exec playwright test test/e2e/workspace-transfer-electron.spec.ts` | close/restart source and target after authorization; explicit target does not suppress MoveRecovery | required |
| A08 | Electron startup, CrashDraft durable store, and emergency priority — T06 | `pnpm -C packages/desktop exec vitest run test/unit/specs/crash-draft-recovery.spec.ts`; `pnpm -C packages/desktop exec playwright test test/e2e/workspace-startup-policy.spec.ts test/e2e/workspace-transfer-electron.spec.ts` | force-kill dirty saved/untitled then recover under default-off; fault-inject temp/fsync/replace/directory-fsync/tombstone/clean-marker gaps, stale ACK and corrupt-latest fallback; explicit target opens in parallel; changed disk gives a conflicted recovered copy; clean exit does not restore tabs/split; dirty save/discard/cancel lifecycle; legacy normal data retained | required |
| A09 | native external release and fallback — T07 | `pnpm -C packages/desktop exec vitest run test/unit/specs/native-gesture.spec.ts` asserts no injected-flag filter; same trusted session + eligible outside-up commits for both remote/assistive flags, while inside-up, re-entry, Escape and old epoch do not (adapter) | Windows single-primary physical trace; remote/assistive smoke if available | platform gate |
| A10 | tab context menu, desktop locales, focused-pane routing — T08 | `pnpm -C packages/desktop exec vitest run test/unit/specs/menu-workspace.spec.ts test/unit/specs/i18n.spec.ts`; `pnpm minify-locales`; `pnpm lint` | tab-menu order/divider/disabled Open/focused keyboard; no new application-menu item | required |
| A11 | details preview/native semantics/theme/motion — T09/T10 | `pnpm -C packages/muya exec vitest run src/block/commonMark/html/__tests__/detailsDisclosure.spec.ts`; `pnpm -C packages/muya/e2e exec playwright test tests/options/details-disclosure.spec.ts`; `pnpm -C packages/desktop exec playwright test test/e2e/details-disclosure.spec.ts` | mouse/focus/Enter/Space/light/dark/screen-reader | required |
| A12 | details round-trip/sanitize/export — T09/T10 | `pnpm -C packages/muya exec vitest run src/state/__tests__/detailsRoundTrip.spec.ts src/state/__tests__/renderToStaticHTML.spec.ts`; `pnpm -C packages/muya/e2e exec playwright test tests/security/details-sanitize.spec.ts` | inspect HTML/PDF: standard markup, no editor CSS | required |
| A13 | cross-feature regression, default-off startup and two-source emergency recovery — T11 | `pnpm -C packages/desktop exec playwright test test/e2e/workspace-transfer.spec.ts test/e2e/workspace-details-composition.spec.ts test/e2e/workspace-startup-policy.spec.ts`; `pnpm -C packages/desktop typecheck`; `pnpm lint` | tabs/split/Move/Open/details plus CrashDraft kill recovery, corrupt-latest warning/disk-conflict copy, MoveRecovery, explicit-only file, clean no-restore, dirty-exit decision and retained legacy data | required |
| A14 | clean Windows-build readiness evidence — T12 | `pnpm install --frozen-lockfile`; `pnpm build:win:x64` (clean Windows builder) | trial records default-off clean/explicit startup, no inert setting, clean/dirty exit outcomes, CrashDraft durable-failure fallback/conflict copy and Move recovery, legacy-data retention, display/scale/motion and defects; coordinator—not T12—requests Acceptance | readiness |

## T12 Windows trial readiness evidence — 2026-08-27

See [T12 Windows trial readiness evidence](evidence/t12-windows-trial-readiness-2026-08-27.md).
At `e5d1a85ab96cffa58c77696006ad8a2a2753f347`, a Windows 11 x64
frozen-lockfile install retry and `pnpm build:win:x64` both passed; ZIP, NSIS
installer, and blockmap artifacts were generated and their hashes are recorded
in that evidence. The NSIS installer is `NotSigned` by Authenticode and is for
controlled local trials only; release signing/distribution approval remain
`Untested` and unapproved, so this evidence cannot authorize publication. The first
install attempt had a transient `native-keymap/build` `EBUSY` during postinstall;
the identical retry succeeded without source or lockfile changes.

| Evidence | Status | Exact result / remaining condition |
| --- | --- | --- |
| A14 automated clean Windows-build readiness | Passed | `pnpm install --frozen-lockfile` passed on retry; `pnpm build:win:x64` exit 0 on Windows 11 Pro 10.0.26200, Node 24.18.0, pnpm 10.33.4. |
| A14 manual Windows trial | Untested | The baseline `499de31d` fresh-profile clean-New-Tab Alt+F4 trial is Failed: it returned to New Tab and later created `Untitled-1`. The repaired package still requires a new user trial; startup/exit, CrashDraft power-loss/fallback/conflict, MoveRecovery, physical external release, unsupported fallback/menu Move, display/scale/motion, accessibility, and PDF checks remain unexecuted. |
| T12 final acceptance | Untested | T12 does not request or declare Acceptance. The coordinator must complete the manual trial, final independent reviews, defect disposition, and user Acceptance. |

## T03 integration evidence — 2026-08-25

The A03 evidence below is recorded from the locally integrated commit
`1aa17aac6da3ef23610067b7f264bb38a835da4e` on the Windows Electron/Node
verification environment. It is not a blanket pass for later gates.

| Evidence | Status | Command / environment / result |
| --- | --- | --- |
| A03 split Electron proof ([evidence](evidence/t03-integration-2026-08-25.md)) | Passed | `pnpm -C packages/desktop exec playwright test test/e2e/split-workspace.spec.ts` in Windows Electron: 4/4 passed, including two independent pane compositions against one Controller, focused-pane command isolation, and the split geometry/focus cases |
| Workspace runtime ([evidence](evidence/t03-integration-2026-08-25.md)) | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts` in Node/Vitest: 42/42 |
| DocumentIO/coordinator/routing ([evidence](evidence/t03-integration-2026-08-25.md)) | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/document-io-coordinator.spec.ts test/unit/specs/document-io-electron-adapter.spec.ts` in Node/Vitest: 17/17 |
| Source/#781 regression ([evidence](evidence/t03-integration-2026-08-25.md)) | Untested | Task record reports 9/9, but the exact test-selection command is not recoverable; record item, not a Passed gate |
| Tab history/caret/scroll ([evidence](evidence/t03-integration-2026-08-25.md)) | Untested | Task record reports 3/3, but the exact test-selection command is not recoverable; record item, not a Passed gate |
| Auto-focus/body/blank/overflow ([evidence](evidence/t03-integration-2026-08-25.md)) | Untested | Task record reports 4/4, but the exact test-selection command is not recoverable; record item, not a Passed gate |
| Typecheck ([evidence](evidence/t03-integration-2026-08-25.md)) | Passed | `pnpm -C packages/desktop typecheck` passed on the verified implementation/integration evidence |
| Desktop build ([evidence](evidence/t03-integration-2026-08-25.md)) | Passed | `pnpm -C packages/desktop build` passed on the verified implementation/integration evidence |
| Diff check ([evidence](evidence/t03-integration-2026-08-25.md)) | Passed | `git diff --check` passed on the verified implementation/integration evidence |
| Corrected final-window Electron regression ([T12 evidence](evidence/t12-windows-trial-readiness-2026-08-27.md#final-window-exit-corrective-evidence--2026-08-27)) | Passed | `pnpm -C packages/desktop exec -- playwright test test/e2e/last-tab-window-close.spec.ts --workers=1` — 5/5 passed after replacing the old Page-close-only false positive with main-child exit and replacement-window assertions for tab button/command, title-bar, native Alt+F4 seam, and a controlled Windows-activate replay. |
| Baseline manual final-window Alt+F4 | Failed | Fresh-profile Windows x64 package from `499de31d` returned to New Tab and later created `Untitled-1`; the repaired package's manual Windows retest remains Untested. |

The integration worktree had no `node_modules`, so repeated commands were
unavailable there. Integration was fast-forward-only to the same already
verified SHA, and `git diff --check` passed on the integration branch. This is
an environment limitation with inherited evidence, not a code-test failure.
The broad legacy tabs history test remains a record item because its
`getMarkdownContent` helper forces repeated Source round-trips; authoritative
no-perturbation Item 252 passed. Later gates remain Untested unless
their own evidence is recorded.

## T09/T10 details integration evidence — 2026-08-25

See the [T09/T10 details integration report](evidence/t09-t10-details-integration-2026-08-25.md).
T09's original implementation predates this round; the active-content
Preview/Escape re-entry blocker was fixed in
`463c2c4ac58140fe0f50c7da9873fc9b956be193`. T10 is integrated at
`344dbff17a894751dc61ddbf750c711d3b855beb`. Both tickets have independent
Standards and Spec reviews marked Passed with no blocking findings.

| Evidence | Status | Exact command, environment, result, artifact/trace |
| --- | --- | --- |
| T09 target Vitest | Passed | `pnpm -C packages/muya exec vitest run src/block/commonMark/html/__tests__/detailsDisclosure.spec.ts src/state/__tests__/detailsRoundTrip.spec.ts src/state/__tests__/renderToStaticHTML.spec.ts`; Windows local worktree; 29 passed, console exit 0; no separate trace. |
| T09 typecheck | Passed | `pnpm -C packages/muya lint:types`; Windows local worktree; exit 0; no separate artifact. |
| T09 details/sanitize E2E | Passed | `Remove-Item Env:CI -ErrorAction SilentlyContinue`; set `NODE_OPTIONS=--dns-result-order=ipv4first`; `pnpm -C packages/muya/e2e exec playwright test tests/options/details-disclosure.spec.ts tests/security/details-sanitize.spec.ts --project=chromium`; Windows/Chromium; 9 passed, exit 0; no retained trace. |
| T09 generic E2E | Passed | Same Windows prefix (`Remove-Item Env:CI -ErrorAction SilentlyContinue`, `NODE_OPTIONS=--dns-result-order=ipv4first`); `pnpm -C packages/muya/e2e exec playwright test tests/options/disable-html.spec.ts tests/security/sanitize.spec.ts --project=chromium`; 7 passed, exit 0; no retained trace. |
| T09 scoped ESLint | Passed | `pnpm -C packages/muya exec eslint src/block/commonMark/html/index.ts src/block/commonMark/html/__tests__/detailsDisclosure.spec.ts`; Windows local worktree; exit 0; no separate artifact. |
| T09 full Muya lint | Failed | Full Muya lint ran with five baseline-existing errors in `paragraphContent/index.ts`, `latexMathDelimiters.spec.ts`, and `utils/marked/extensions/math.ts`; nonblocking baseline record item, not attributed to T09. |
| T10 desktop build | Passed | `pnpm -C packages/desktop build`; Windows/Desktop; exit 0; transient build output only, no separate trace retained. |
| T10 details Electron E2E | Passed | `pnpm -C packages/desktop exec playwright test test/e2e/details-disclosure.spec.ts`; Windows/Electron; 7 passed, exit 0; no retained trace. |
| T10 export unit and HTML boundary | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/exportHtml.spec.ts`; Windows local worktree; 19 passed, exit 0; passing path removes HTML temporary files, no long-term artifact; assertions cover standard `details`/`summary`/`open` markup and no editor-only control/token. |
| T10 typecheck | Passed | `pnpm -C packages/desktop typecheck`; Windows/Desktop; exit 0; no separate artifact. |
| T10 split E2E | Passed | `pnpm -C packages/desktop exec playwright test test/e2e/split-workspace.spec.ts`; Windows/Electron; 4 passed, exit 0; no retained trace. |
| T10 scoped ESLint | Untested | Review record says scoped ESLint had 0 errors, but the exact command evidence was not separately saved; no command is claimed. |
| Diff check | Passed | `git diff HEAD^ HEAD --check`; Windows local worktree; exit 0; no artifact beyond console result. |
| Screen-reader spot check | Untested | No manual accessibility environment was executed; fallback is T12 Windows manual acceptance. |
| PDF visual inspection | Untested | No manual PDF inspection environment was executed; fallback is T12 Windows manual acceptance. |

T10 Standards record items: `setHtmlEnabled` uses a fixed 100ms delay that may
be flaky, and failed export assertions can leave HTML under `%TEMP%`. Existing
`editor.vue` has five template-formatting warnings; stylelint has no applicable
configuration. On clean baseline `463c2c4`, `html-block-input.spec.ts` independently
reproduced 1/2 (`insideHtmlBlock` expected true, actual false); this is a
baseline record item and does not block T10.

## T05 TabTransfer integration evidence — 2026-08-25

See the [T05 integration report](evidence/t05-integration-2026-08-25.md). T05 is
integrated/reviewed at `3d6790cf5397dfde9b8dafbd92c0f63d3cba0a6a`; independent
terra/high Standards and Spec reviews both finished `Passed` with zero blocking
findings after three historical blocking review/repair rounds.

| Evidence | Status | Exact command, environment, result, artifact/trace |
| --- | --- | --- |
| A05 capsule/fence/capability/unique owner | Passed | Covered by `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-core.spec.ts`; Windows local T05 worktree; selected suite passed as part of 3 files / 32 tests, exit 0; console evidence, no retained trace. |
| A06 WAL intent/observed and crash/replay gaps | Passed | Covered by `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-recovery.spec.ts`; Windows local T05 worktree; selected suite passed as part of 3 files / 32 tests, exit 0; console evidence, no retained trace. |
| T05 core portion of A07 — MoveRecovery owner migration/tombstone/GC | Passed | Covered by `pnpm -C packages/desktop exec vitest run test/unit/specs/tab-transfer-emergency-recovery.spec.ts`; Windows local T05 worktree; selected suite passed as part of 3 files / 32 tests, exit 0; console evidence, no retained trace. This is the deterministic T05 core portion only; it does not include production Electron IPC/E2E evidence. |
| A07 T06 Electron portion — production transfer/recovery E2E | Passed | T06 integration report: startup+transfer Electron E2E ran single-worker with 20/20 passed on candidate final HEAD `0343cb5f56f537584d60ea219268ea04c13292c5`; merge `dde3f49a89877d68dc07171b62bb19eb87002217`. |
| T05 typecheck | Passed | `pnpm -C packages/desktop typecheck`; Windows local T05 worktree; exit 0; console evidence, no separate artifact. |
| T05 scoped ESLint | Passed | `pnpm -C packages/desktop exec eslint src/main/tabTransfer/index.ts src/main/tabTransfer/memory.ts src/main/tabTransfer/types.ts test/unit/specs/tab-transfer-core.spec.ts test/unit/specs/tab-transfer-recovery.spec.ts test/unit/specs/tab-transfer-emergency-recovery.spec.ts`; Windows local T05 worktree; exit 0; only `MODULE_TYPELESS_PACKAGE_JSON` performance warning, no retained trace. |
| T05 integrated diff check | Passed | `git diff 4728129a0790b2def5e96a22172746e0fff6750b...3d6790cf5397dfde9b8dafbd92c0f63d3cba0a6a --check`; Windows local T05 worktree; exit 0; console evidence, no retained trace. |

T05's non-blocking record item is that Memory capability validation authenticates
the receiving command endpoint without re-checking the other endpoint's current
epoch; T06's production IPC adapter must define and verify this semantic. T05
does not claim CrashDraftRecovery, production Electron wiring, or normal
workspace restore.

## T02b final production integration evidence — 2026-08-26

See the [T02b final gate report](evidence/t02b-integration-2026-08-26.md).
T02b is integrated/reviewed/accepted at `b2cc0a784bd539a598e7db456b1509d87dbaf36f`.
This gate releases the current Controller/projection seam; it does not claim
normal workspace restore, T06 production recovery, or completion of V1.

| Evidence | Status | Exact command, environment, result |
| --- | --- | --- |
| T02b unit gate | Passed | `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts test/unit/specs/workspace-projection-mirror.spec.ts test/unit/specs/workspace-command-routing.spec.ts`; Windows Node/Vitest; 3 files / 52 passed |
| T02b Electron gate | Passed | `pnpm -C packages/desktop exec playwright test test/e2e/tab-switch-cursor.spec.ts test/e2e/split-workspace.spec.ts test/e2e/audit-tabs-restart.spec.ts --workers=1`; Windows Electron; 11 passed |
| T02b typecheck | Passed | `pnpm -C packages/desktop typecheck`; exit 0 |
| T02b build | Passed | `pnpm -C packages/desktop build`; exit 0, warnings only |
| T02b scoped ESLint | Passed | `pnpm exec eslint packages/desktop/src/shared/workspace packages/desktop/src/renderer/src/workspace packages/desktop/src/renderer/src/store/editor.ts packages/desktop/src/renderer/src/components/editorWithTabs`; exit 0, warnings only |
| T02b integrated diff check | Passed | `git diff --check 1130af41...b2cc0a78`; exit 0 |
| Independent Standards review | Passed | No blockers |
| Independent Spec review | Passed | No blockers |
| Default no-normal-workspace-restore policy | Passed | Passed and unchanged; no new restore surface is claimed |

T02b non-blocking records: unused `sourceEventScope` assignment; repeated
waiter anonymous type; and exceptional failed-refresh waiter resilience. Prior
default three-worker Electron launch timeouts are environment/runner records;
the authoritative deterministic gate is the successful single-worker 11/11 run.

## T06 Electron transfer/startup integration evidence — 2026-08-26

See the [T06 integration report](evidence/t06-integration-2026-08-26.md). T06 is
locally integrated and independently reviewed / Passed for the automated scope
at merge `dde3f49a89877d68dc07171b62bb19eb87002217`, candidate final HEAD
`0343cb5f56f537584d60ea219268ea04c13292c5`, fixed review point
`86cf7b8e962bf94791efeba29e9ba8ccbcefa02f`.

| Evidence | Status | Exact command, environment, result, artifact/trace |
| --- | --- | --- |
| A07 Electron portion | Passed | Startup+transfer Electron E2E, single worker; 20/20 passed. |
| A08 automation | Passed | Build and typecheck passed; startup+transfer Electron E2E 20/20; seven focused/direct unit files 101/101; three-file new-line rerun 64/64. |
| Independent Standards review | Passed | Third-round independent `gpt-5.6-terra` / `high`; 0 blockers. |
| Independent Spec review | Passed | Third-round independent `gpt-5.6-terra` / `high`; 0 blockers. |
| Diff/worktree/process hygiene | Passed | `git diff --check` passed; clean worktree; no residual Electron/Node processes. |

Manual power-loss/Windows trial evidence is not claimed. A11/A12, full
repository `pnpm lint`, and final T12 acceptance remain pending. Scoped ESLint
has checkpoint-preceding historical source-style errors as a non-blocking record
item; new lines have no hard-lint errors. The transfer-fence/move-action
assembly-surface range remains a non-blocking record item.

## Status rules

## T11 composed Electron evidence — 2026-08-26

See [T11 cross-feature Electron evidence](evidence/t11-cross-feature-e2e-2026-08-26.md).
At T09/T11-02 integration HEAD `66749ef1bd4da946094bd4351f0f02378ca7308c`,
the single-worker T11 automated collection passed 23/23: T06 startup-policy
14/14, T11's two new real-Electron composition specs 2/2, and existing Move
Electron regression 7/7. The original details preview/theme and last-tab Move
portable-history reproductions are resolved. The existing details export suite's
post-assertion `afterAll` `app.close()` hang remains a non-blocking T10/T09
record item: it has no assertion failure, predates T11, and is not a T11-owned
details/theme or Move/history acceptance gap. This evidence does not claim
manual acceptance, final review, coordination-branch integration, or T12.

| Status | Rule |
| --- | --- |
| Passed | Ran in named environment, assertion passed, and evidence artifact/location is linked. |
| Failed | Ran and failed; record failure summary, severity, owner, and remediation/disposition. Critical failure blocks the relevant gate. |
| Skipped | Applicable but deliberately not run; give a time-bounded reason. It never counts as Passed. |
| Unavailable | Required platform/tool/credential is unavailable; record environment. The supported fallback must be tested instead. |
| Untested | No adequate execution/evidence exists. It blocks a required/final gate. |

Unsupported external detach configurations (Windows mixed-DPI/multi-display,
macOS, Linux) may be `Unavailable` only when automated/manual proof confirms the
feature is disabled and the Move menu remains usable. Prototype evidence alone is
not production evidence. At each integration, rerun the tickets' stated checks and
mark their actual state—not a blanket success.

For A09, a missing real remote/assistive environment may be `Unavailable`, but the
automatic two-flag contract and unsupported-platform disablement fallback remain
required `Passed` evidence.

## Phase gates

1. **Foundation:** T01, T04 core and T09 pass runtime/startup, FileObservationHub/CAS and details contracts; normal restore codec/migration is deferred.
2. **Document I/O:** T04b passes the A04b real coordinator/typed transport harness, including sender authentication, teardown cleanup/inert late effects, ordinary-Save durable-ACK state guards, CAS/ACK identity, Save As/rename rollback and observer conflict evidence before T02 production completion. It does not claim real dual-window/UI evidence.
3. **Workspace:** T02/T03 pass no-restore live-pane isolation before Electron transfer integration.
4. **Transfer:** T05 passes every WAL/recovery test and independent terra/high Standards + Spec review before T06.
5. **Platform:** T06's automated Electron portion is Passed; T07 and the remaining supported Electron/Windows evidence still require their own gates and unavailable configurations must pass disablement fallback.
6. **Presentation:** T08–T10 pass their independent surfaces; prototypes remain evidence only.
7. **Integration/readiness:** T11 and T12 deliver evidence after coordination-branch integration, including T04b transport use, default-off restart, explicit-target priority, unchanged dirty exit, and always-on emergency recovery. The coordination task, not T12, creates independent terra/high Standards + Spec review, resolves defects, requests user Acceptance, and declares completion only after Windows trial and critical defects = 0.
