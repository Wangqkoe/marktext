# Manual regression matrix

## Current package evidence — 2026-08-31

The fresh `dist\win-unpacked` package from production commit `e223b0e3dd554b11a730f675eee2834961412d17`
passed packaged STAB-015 R1–R5 and related STAB-013/014 automated gates;
workspace unit was 8 files / 123 tests, related Electron E2E was 64/64,
`build:win` passed, and scoped lint is 0 errors / 63 warnings. Independent
Standards and Spec reviews pass. Required human Acceptance remains pending for
physical Windows right-tab split drag and drag-out-of-window Move; these are
non-blocking for code integration, but blocking for final user Acceptance/project
completion. See [final
workspace evidence](../marktext-feature-development-2026-08/handoff/evidence/final-workspace-evidence-2026-08-31.md).

This is a bounded, risk-directed audit, not infinite combination enumeration.
Run representative combinations first; expand only the failing dimension after a
red light. Run every selected row on one traceable artifact. Each result must
record profile, accurate entry, expected, actual, timestamp, PID/window/logical-tab
state, log or recording link, and status. Required manual checks are not replaced
by automated tests. Each P1 must additionally retain one red-capable command that
has actually run before repair begins.

## Current-round provenance and gate

### Historical / superseded STAB-012 final-candidate same-package closeout — 2026-08-30

T12 was `Completed / Accepted` on the then-final Windows candidate built from
`f6dcf9dbb949a972c4d3609294b858ab2d46b1d0` at
`C:\Users\1407\.codex\worktrees\dbc4\Marktext\dist\t12-final-f6dcf9db\win-unpacked`.
Environment: Microsoft Windows 11 Pro 64-bit, version `10.0.26200` / build
`26200`; current display `AppliedDPI` 96 (100% scale); timezone
`America/Los_Angeles` / `Pacific Standard Time`. Candidate hashes are
`marktext.exe` `7376677D7AA63841098B46D6AAD54F23676D394AC4D68AB5C1F89DFA1655218D`,
`resources\app.asar`
`97E4EF543A79BC756A3DAA0206D7A689E72876119FEA87DA5DF3FA6873098C2F`, and
`icudtl.dat` `C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.
Its packaged automatic black-box startup/recovery/Discard/exit gate passed. The
user then repeated the affected native recovery/close path on the same package
and profile. Initial main PID `14268` and restart main PID `58796` each had an
exact candidate/profile process tree of 5; final count was 0. The user stated:
fresh one `BrowserWindow`; after checkpoint termination/restart, still one window
with logical tabs `Recovered Draft` + `Untitled-1`; Cancel retained that state;
Don't Save left only `Untitled-1`; closing it reached 0 windows / 0 processes with
no replacement New Tab. Independent final audit task
`01a05600-a111-71d1-952e-f79e64ebe20d` returned `PASS` with 0 blockers. See
[final acceptance evidence](../marktext-feature-development-2026-08/handoff/evidence/t12-final-acceptance-2026-08-30.md).

Manual profile machine-evidence root:
`C:\Users\1407\AppData\Local\Temp\marktext-t12-final-manual-f6dcf9db-70c5e345-07fc-4811-a25e-f151df4a7afa\crash-drafts`.
`bXQtMA.2.draft.json` is timestamped 2026-08-30 20:53:51 -07:00; draft/commit
revisions 2–7 match the marker; `bXQtMA.tombstone.json` is timestamped
2026-08-30 21:03:57 -07:00 and records revision 7 / `discarded`;
`clean-shutdown.json` is timestamped 2026-08-30 21:04:00 -07:00 and records
`clean=true`. These timestamps/files are machine evidence. The UI states/clicks
are the user's contemporaneous statements; no recording was retained and they
are not auditor observations.

The old `57d2ae4d` closeout, the STAB-012 red at `f46c765c`, repair integration at
`85e5b61e`, and isolated task-artifact replay remain historical evidence in the
[STAB-012 record](../marktext-feature-development-2026-08/handoff/evidence/stab-012-recovery-startup-close-2026-08-30.md). Screen-reader, PDF visual, real
power-loss, remote/assistive, and mixed-DPI/multi-display operation remain
`Untested`/`Unavailable` non-blocking boundaries; this closeout does not relabel
them as `Passed`.

### Historical / superseded final closeout — 2026-08-30

T12 was `Completed / Accepted` at that historical checkpoint; the independent final audit passed with 0 blockers
and active P0/P1 is 0. See [final acceptance evidence](../marktext-feature-development-2026-08/handoff/evidence/t12-final-acceptance-2026-08-30.md).
This preserves every row's recorded status: only the fixed, independently reviewed
STAB-011 local delta receives the final artifact's narrow provenance exception;
unaffected paths inherit prior evidence and affected Details gates were rerun on
the target package. It does not convert screen-reader, PDF, power-loss,
remote/assistive, or mixed-DPI/multi-display rows to `Passed`.

### STAB-007 reopened and scoped packaged closeout — 2026-08-29

- Reopened failure: at integration `5847be6e`, the real Save As dialog returned the selected path but no target was written and the title remained `Untitled`/dirty. Diagnostic-only `f593a5aa` (**DO NOT MERGE**) traced two correct `showSaveDialog` results (`canceled:false`/correct `filePath`) followed by coordinator rejection of `save-as` as `unknown or revoked sender`.
- Final source: `e583ee79` (dialog return shape/Save test boundary) plus `adaca3fa` (revoke only main-frame non-same-document navigation; retain same-document/subframe; destroy still revokes) are fast-forwarded to integration `adaca3fa36279ceb8f8deac37fff692851274586`; `f593a5aa` is not merged. Root cause was unconditional `did-start-navigation` detach: hash navigation revoked the sender without a later EditorWindow `did-finish-load` reattach.
- Independent Standards and Spec reviews both passed with 0 blockers / 0 record items. Relevant units passed 6 files / 90 tests; native-save Electron E2E passed 5/5 in two consecutive rounds; desktop typecheck/build and fresh `electron-builder --dir` passed (exit 0); scoped production/E2E lint had 0 findings. Electron 42 defines `Event<T>` as `base & T`, placing flags at the first argument's top level. The adapter's existing 74 errors / 1 warning are unchanged from the fixed point and are non-blocking records.
- Same-hash packaged manual retest passed only the reproduced Save As path: `native-save-fixed.md` contained `STAB007_NATIVE_SAVE_ADACA3FA` (31 bytes; SHA-256 `FA3695097FA49D135A91A3292D51FA19319CAFD638ED5DBF11D3B92E234CD398`) and the title rebound to that filename. CrashDraft left a tombstone and normal close left `clean-shutdown.json`. Artifact: `C:\Users\1407\.codex\worktrees\1e9a\Marktext\dist\win-unpacked\marktext.exe` 226,508,288 bytes / SHA-256 `1F22983EDFF222820D1F81CF37C613191C01006E4E31E98A30125390ECAC745F`; `resources\app.asar` 149,922,040 bytes / SHA-256 `84CC7476C0665A47D77AE3654188A49BBA6D01E6A44E8F612689CD1DBB623099`.
- Gate disposition: STAB-007 is `Resolved / Manual-retest Passed` for the complete save-path regression: both untitled Ctrl+S and File > Save reached native Save As, and Cancel, double Ctrl+S, and already-bound Save passed; see [manual retest evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-007-sender-save-as-2026-08-29.md). At this 2026-08-29 checkpoint, this did **not** replace the then-remaining packaged Windows/manual matrix: Move/close/open/details/accessibility/PDF, T12, final Review, and Acceptance were Pending/Untested unless independently recorded later.

The following matrix retains the `9715ced7` artifact round as historical failure
evidence alongside the later scoped closures and then-final-candidate rows (now
superseded). A historical row is not a claim about the current source.

- Source HEAD: `9715ced7`; exact Windows x64 unpacked artifact: `marktext.exe` `C388054D20B8A271C2B2759219BAC7136042A914D5A5534666ADF596B86E21DA`, `resources\app.asar` `ED53C8D11EAF20EFF5BAAE953ECF85662034494598DFB0DCBE43D3178167E9E7`; installer `2EEC53E09348292FCCC66C96A71FADCFBD494F648BA3FA888A49FCD7A4A9A50B`; ZIP `87269A2C1ED0A8E46206D51E5AFABEC5B0FD00874498E25B128EB70C45DEA30D`.
- Historical result: build PASS; relevant unit PASS `152/152`; selected E2E PASS `40/40`; typecheck PASS. Scoped lint FAIL with 12 hard errors: a required release-gate blocker, but attribution is unestablished and it is not a new product P1.
- Historical gate: FAIL. STAB-006, STAB-007, and STAB-008 were active P1s on this artifact; see the current-source automated closeout above for their later disposition.

| Scenario | Profile / entry | Expected | Actual / logs or recording | Status |
| --- | --- | --- | --- | --- |
| First priority: no-target startup, no restore | Historical/then-current `f6dcf9db` candidate (superseded); same-package manual profile `C:\Users\1407\AppData\Local\Temp\marktext-t12-final-manual-f6dcf9db-70c5e345-07fc-4811-a25e-f151df4a7afa`; packaged black-box fresh-profile control | One clean New Tab / one window | Automatic black-box normal launch produced one window and exited normally. In the native acceptance run, the user confirmed one fresh window before entering the recovery marker; no restored or extra window appeared. | Historical Passed (superseded) |
| First priority: open `.md` through CLI and running-instance delivery | Historical source-round controls; `launch-assert.mjs` probe | Actual path, title, and content match requested file | `run-2026-08-28T05-19-09-123Z/results.json`: 5/5 passed, but it is not evidence from this exact then-current artifact or this continuous matrix round. | Historical control — then-current artifact Untested |
| First priority: native File > Open/Ctrl+O and association/double-click | Fresh profile `marktext-final-native-open-78323e9ab09d4d2d8b7b6cfa8c2bf5a0`; Ctrl+O at 2026-08-28T08:27:37-07:00; PID 7932 | Actual path, title, and content match requested file | User selected `C:\Users\1407\AppData\Local\Temp\marktext-final-native-open-9d3e0cc3.md`; title and `FINAL_NATIVE_OPEN_SENTINEL_9D3E0CC3` both confirmed. Association/double-click not changed or tested. | Pass (Ctrl+O); association Unavailable |
| First priority: close in 1x1, 1x2, 2x1, 2x2 logical-tab layouts; representative tab-close/Alt+F4/X per window and final window | Then-current artifact (historical; superseded); manual fresh profiles for 1x1 Alt+F4 and X, 2x1 Ctrl+N/X/Alt+F4; relevant Playwright suite 40/40 | Correct exit/dirty decision; only intended windows/processes change | Manual: 1x1 Alt+F4/X and 2x1 sequential X/Alt+F4 all closed with zero exact-artifact processes and no replacement New Tab. Automated E2E covered tab-close and 1x2/2x2 state transitions. Dirty Discard manually passed; Save is STAB-007 P1. | Historical Fail — STAB-007 P1 |
| First priority: tab reorder versus Split, including single-hidden to multi-visible tab bar | Then-current artifact (historical; superseded); `split-workspace.spec.ts` within 40/40 E2E; [T07 physical drag-out evidence](../marktext-feature-development-2026-08/handoff/evidence/t07-physical-drag-out-2026-08-29.md) | Tab/title bar only reorders; document-area edge release splits | Automated title-bar reorder, document-area split, 719/720 geometry, and the physical single-primary tab-bar reorder/outside-up/re-entry/Escape cases passed. | Historical Passed (superseded; supported shape); blur/timeout automatic; unsupported display/DPI shapes Unavailable |
| First priority: right-click `Move to new window`, Open, and drag-out Move | Formal artifact `F7C3E3EBF82995C7D71E544F5F1FAF7E41C86219A38D50F52B7768869B7B03B5`; absolute `manual-03` profile/fixture in [STAB-006 evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-006-close-then-move-2026-08-29.md); observed 2026-08-29 09:47:51 PDT; PID 50380 | Correct ownership/no bootstrap tab; Move is not Split | User confirmed File > New Tab → file tab Open in new window → target X → source file tab Move to new window: Open created the target, close removed it, and Move created the target again; source retained only New Tab. Physical drag-out is separately covered by [T07 evidence](../marktext-feature-development-2026-08/handoff/evidence/t07-physical-drag-out-2026-08-29.md). | Passed (STAB-006 scoped manual); physical drag-out Passed (T07 supported shape) |
| Filesystem Move To (separate from window Move) | Fresh profile `marktext-final-move-to-d4a3de72b8654fda92c918db30ce1c63`; source/target fixtures | Save-style dialog and safe disk rename/move | Source no longer existed; target existed with SHA-256 `C17E8DF678CCE8D153E62900FBD858F95CB615BA7E871848313486AE06233769` and intact sentinel. UI title stayed on the old source name. | Pass (disk safety); P2 stale title |
| Sample: Split, narrow-window disablement | Then-current artifact (historical; superseded); `split-workspace.spec.ts` within 40/40 E2E | Pane isolation/collapse; narrow window disables Split | E2E covered pane isolation, focused-pane routing, collapse and 719/720 geometry. | Historical Pass (superseded; automated) |
| First priority: Split Right → close saved tab → File/Open same-path reopen | Formal artifact `70D668C1D85867E43D47AB582E28F12E4F5F756CC72B0889B5BD40D36E70AB7A`; profile/fixture and full result in [STAB-010 evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-010-close-reopen-2026-08-29.md) | After close/collapse, File/Open of the existing unchanged path restores one tab with its content/path | Exact E2E passed 2/2 and complete native-open suite 5/5. Manual close/collapse left one New Tab without closing the window; Ctrl+O same-path reopen restored the title, content, and sentinel. Split Right/collapse remain passed. | Passed (STAB-010 Manual-retest) |
| Sample: Details | STAB-008 collapse baseline: formal artifact `F7C3E3EBF82995C7D71E544F5F1FAF7E41C86219A38D50F52B7768869B7B03B5`; `manual-01` profile/fixture in [STAB-008 evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-008-details-2026-08-29.md); observed 2026-08-29 10:09:12 PDT; PID 58736. STAB-011 source/preview entry: final artifact `94384F8856BD3BA26CA53F39495DC880F4943FBD53D6C80BED43B894E49A8D4E`; fresh profile `marktext-stab011-final-57d2ae4d-manual-01`; [STAB-011 evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-011-details-floating-edit-2026-08-30.md). | Collapsed disclosure and existing floating edit entry reliably transition source/preview. | STAB-008: user confirmed initial right arrow/body hidden, down arrow/body visible, then right arrow/body hidden for the Chinese-summary/body-sentinel fixture. STAB-011: floating pencil→source, physical Escape→collapsed preview, same entry→source, Preview→preview, same entry→source, then outside-paragraph click→immediate source exit with collapsed disclosure all passed (6/6). Source round-trip/static export are covered by prior automated evidence. | Passed (STAB-008 collapse; STAB-011 scoped 6/6); screen-reader/PDF Untested |
| Sample: Dirty Save / Discard / Cancel | Historical failure profile `marktext-final-dirty-save-d062b44e0c764d6bb510249bfd4e91f5`; then-final same-hash artifact and [manual retest evidence](../marktext-feature-development-2026-08/handoff/evidence/stab-007-sender-save-as-2026-08-29.md) | No data loss; unchanged choices | Historical `9715ced7` Ctrl+S/File > Save did nothing for a dirty untitled document. The then-final `adaca3fa` packaged retest passed both supported untitled entries: Ctrl+S and File > Save each reached native Save As with correct bytes/title rebind; it also passed Cancel (dirty content retained/no target), double Ctrl+S (one dialog/one write), and already-bound Save (no dialog/durable update). Discard remains the earlier Details fixture result. | Historical STAB-007 save-path manual retest Passed; Discard historical |
| Sample: CrashDraft and MoveRecovery | Historical/then-current `f6dcf9db` candidate (superseded) on Windows 11 Pro build 26200 / 100%; manual profile `C:\Users\1407\AppData\Local\Temp\marktext-t12-final-manual-f6dcf9db-70c5e345-07fc-4811-a25e-f151df4a7afa`; initial main PID 14268, restart main PID 58796; [historical evidence and automatic `03` traces](../marktext-feature-development-2026-08/handoff/evidence/t12-final-acceptance-2026-08-30.md) | Correct independent recovery, one recovery window, dirty-close choices, durable tombstone, and full exit | Automatic gate Passed at the historical checkpoint; UI facts remain user statements, not auditor observation. | Historical Passed (superseded) |
| Sample: File observation / conflict | Relevant unit suite 152/152 and selected 40/40 E2E | Safe conflict behavior | `file-observation-hub`, `file-change-content-check` and workspace transfer/startup E2E passed. No additional manual external-edit conflict replay after P1 stop. | Pass (automated); manual replay Skipped (P1 stop) |
