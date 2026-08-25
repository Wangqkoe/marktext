# Workspace Features V1 — acceptance matrix

Requirement sources are the [V1 Spec](v1-spec.md) and its linked resolved Issues.
The evidence owner records command, environment, artifact/trace and status on the
integration branch; `Passed` may be claimed only with all four.

| ID | Requirement / evidence owner | Exact automated command / environment | Manual verification | Gate |
| --- | --- | --- | --- | --- |
| A01 | WorkspaceController runtime invariants, immutable projection, lease rejection — T01/T02 | `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-runtime.spec.ts` (Node/Vitest) | two panes: edit/switch/focus without leakage | required |
| A02 | StartupIntent, DefaultStartupPolicy, and two emergency boundaries — T01 | `pnpm -C packages/desktop exec vitest run test/unit/specs/workspace-startup-policy.spec.ts` (Node/Vitest) | no target→clean New Tab; explicit target→only target; unified scan receives distinct CrashDraft and Move inputs; memory CrashDraft proves monotonic identity/revision, atomic durable-ACK progression, stale-ACK rejection, and corrupt-latest fallback | required |
| A03 | panes/tabs/focus/collapse/last-tab and live source/history — T02/T03 | `pnpm -C packages/desktop exec playwright test test/e2e/split-workspace.spec.ts` (Electron Playwright) | narrow 719/720px, divider clamp/reset and keyboard focus; ordinary restart does not restore pane state | required |
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

## Status rules

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
5. **Platform:** T06/T07 pass supported Electron/Windows evidence; unavailable configurations must pass disablement fallback.
6. **Presentation:** T08–T10 pass their independent surfaces; prototypes remain evidence only.
7. **Integration/readiness:** T11 and T12 deliver evidence after coordination-branch integration, including T04b transport use, default-off restart, explicit-target priority, unchanged dirty exit, and always-on emergency recovery. The coordination task, not T12, creates independent terra/high Standards + Spec review, resolves defects, requests user Acceptance, and declares completion only after Windows trial and critical defects = 0.
