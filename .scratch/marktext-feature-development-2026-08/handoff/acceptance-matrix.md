# Workspace Features V1 — acceptance matrix

Requirement sources are the [V1 Spec](v1-spec.md) and its linked resolved Issues.
The evidence owner records command, environment, artifact/trace and status on the
integration branch; `Passed` may be claimed only with all four.

| ID | Requirement / evidence owner | Automated verification and environment | Manual verification | Gate |
| --- | --- | --- | --- | --- |
| A01 | WorkspaceController invariants, immutable projection, lease rejection — T01/T02 | deterministic Vitest memory-adapter contracts in `packages/desktop/test/unit` | two panes: edit/switch/focus without leakage | required |
| A02 | V2 codec, legacy migration, partial salvage/history warning — T01 | codec fixtures for malformed V1/V2 and independent surviving documents | restart a damaged fixture: content survives, one-pane fallback | required |
| A03 | panes/tabs/focus/collapse/last-tab and source/history — T02/T03 | unit reducer + Electron Playwright pane fixture | narrow 719/720px, divider clamp/reset and keyboard focus | required |
| A04 | FileObservationHub/DiskRevision/CAS and stale save ACK — T04 | memory FS/watcher races: same FileKey, clean reload, dirty conflict, writer-only suppression | two real windows editing a file | required |
| A05 | Move capsule digest, fence, capability, unique owner — T05 | deterministic transfer adapter: saved/dirty/untitled/history/last tab; duplicate/reorder/replay | inspect recovery warning on forced recovery | required |
| A06 | WAL intent/observed and each crash/replay gap — T05 | kill/restart every state and every intent/ACK interval; assert exactly one owner | recovery window opens correct document/title | required |
| A07 | owner migration/session recovery/tombstone/GC — T05/T06 | journal + session restore fixtures; capsule/history corruption separately | close/restart source and target after authorization | required |
| A08 | Electron transport, authenticated endpoint epoch, old-endpoint rejection, focus/window geometry — T06 | Electron IPC integration: reload/navigation/destroy, forged window ID, late ACK | Move and Open focus/window placement | required |
| A09 | native external release and fallback — T07 | state-machine tests; Windows adapter unit hit-test conversion | Windows single-primary physical cross-boundary release, re-entry, inside-up, Escape, blur/timeout; remote/assistive input | platform gate |
| A10 | menus, localization, command routing — T08 | menu-state/unit i18n tests | menu order/divider/disabled untitled Open and keyboard target focused pane | required |
| A11 | details source/preview/native semantics/theme/reduced-motion — T09/T10 | Muya DOM tests and Electron Playwright: `open`, disableHtml, keyboard, source/rebuild | mouse, focus ring, Enter/Space, dark/light and screen-reader spot check | required |
| A12 | details round-trip/sanitization/export — T09/T10 | Muya tests for details/summary/open, DOMPurify payloads, Markdown and HTML/PDF export | visually inspect exported HTML/PDF for standard semantics/no editor CSS | required |
| A13 | cross-feature regression — T11 | desktop unit/typecheck/E2E regression suite, build smoke | tabs/split/Move/Open/details in one run | required |
| A14 | release candidate — T12 | clean install/build provenance and matrix re-run | Windows trial: display/scale, normal + reduced motion; critical defects zero; user acceptance | final |

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

## Phase gates

1. **Foundation:** T01 and T04 pass memory/codec contracts before any production UI/IPC work.
2. **Workspace:** T02/T03 pass, including migration and two-pane isolation, before Electron transfer integration.
3. **Transfer:** T05 passes every WAL/recovery test and independent terra/high Standards + Spec review before T06.
4. **Platform:** T06/T07 pass supported Electron/Windows evidence; unavailable configurations must pass disablement fallback.
5. **Presentation:** T08–T10 pass their independent surfaces; prototypes remain evidence only.
6. **Integration/release:** T11 and T12 pass after each coordination-branch integration. Final gate is Windows trial, critical defects = 0, independent final Standards + Spec review, then user Acceptance.
