# Implementation frontier

This is the execution order for the tickets; normative behavior remains in the
[V1 Spec](v1-spec.md), and pass/fail evidence remains in the
[acceptance matrix](acceptance-matrix.md).

| Wave | Tickets that may run together | Integration frontier / gate |
| --- | --- | --- |
| 1 | [T01](tickets/01-workspace-controller-session-foundation.md) | memory controller/codec contract and independent terra/high review pass |
| 2 | [T02](tickets/02-pane-editor-lease-legacy-migration.md), [T04](tickets/04-file-observation-diskrevision-cas.md), [T09](tickets/09-muya-details-engine-and-roundtrip.md) | disjoint ownership permits parallel work; each prerequisite review/test passes |
| 3 | [T03](tickets/03-split-workspace-and-tab-drag-ui.md), [T05](tickets/05-tab-transfer-wal-recovery-core.md), [T10](tickets/10-desktop-details-theme-export-integration.md) | pane/editor isolation, all WAL intent/observed crash gaps, and details desktop semantics pass |
| 4 | [T06](tickets/06-electron-transfer-transport-window-session.md) | Electron endpoint/session transport and independent terra/high review pass |
| 5 | [T07](tickets/07-windows-native-external-release-adapter.md), [T08](tickets/08-menus-localization-and-command-routing.md) | supported external-release proof or disabled fallback; command surface passes |
| 6 | [T11](tickets/11-cross-feature-e2e-and-integration.md) | coordination-branch integration reruns proportional matrix checks and rejects feature fixes into new owner tickets |
| 7 | [T12](tickets/12-windows-trial-final-review-and-acceptance.md) | Windows trial, zero critical defects, independent final review, then user Acceptance |

The only shared foundational directory is the new renderer `workspace/` module:
T01 creates it and T02 modifies only its explicitly assigned adapter glue after
T01 integrates. All other tickets have disjoint ownership as declared in their
files; Wave execution uses a separate worktree/local branch per ticket and commits
only that ticket's ownership. Recompute this frontier after each integration—do
not start a ticket whose prerequisite review or matrix gate is not Passed.
