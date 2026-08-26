# MarkText workspace feature wayfinder

Label: `wayfinder:map`
Status: `destination achieved — implementation handoff`

## Destination

Produce implementation-ready specifications, confirmed interaction prototypes, and
an acceptance-backed ticket handoff for cross-window tabs, two-pane workspace,
styled raw-HTML `details`, and default-off normal startup with independent
emergency recovery. This map does not implement product changes.

## Notes

- Consult `wayfinder` for map operations; use `grilling` and `domain-modeling` for decision tickets, and `prototype` for interaction-validation tickets.
- The local integration branch is `codex/marktext-feature-development-2026-08` in `E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08`.
- Every implementation ticket must use its own worktree and `codex/<ticket-feature-name>` branch. Commits stay local; never push.
- Window/IPC behavior, pane persistence, and shared editor state are high-risk and require `gpt-5.6-terra` at `high` plus independent review. Normal implementation uses `gpt-5.6-terra` at `medium`.

## Implementation handoff update

- T02b R1's final verified commit is `b5ddc413`, but it is a non-integrated
  intermediate state. The R2 branch remains there; it must not be treated as a
  production I/O integration.
- T04 is the sole owner of the FileObservationHub/CAS core. Its actual boundary
  stops before IPC, preload, and renderer wiring. The narrow production
  DocumentIO coordinator/adapter is therefore [T04b](handoff/tickets/04b-documentio-electron-adapter.md),
  not an implicit T02 or T06 responsibility.
- `WorkspaceProjection` contains JSON metadata only, while the legacy
  `currentFile` path still carries Markdown, history, editor state, and old save
  IPC. Directly replacing it with a projection, or retaining a second save state,
  would either break saves or create two sources of truth. T02 must use the
  Controller seam only after T04b; it must not attach the legacy save IPC.
- The minimum dependency chain is T01 + T04 core → T04b → T02 production
  completion → T03/T05 → T06. R3 then owns dual-surface/E2E evidence and removal
  of temporary fallbacks. Normal workspace restore remains neither a prerequisite
  nor an implementation target.

## Historical implementation frontier (archived baseline)

The following section is retained as a historical pre-integration baseline; it
is not the current frontier.

1. Integrate/verify T01 and T04 core at their declared seams.
2. Deliver T04b's authenticated Electron DocumentIO adapter and coordinator.
3. Resume T02 R2 only for the production projection facade and Controller-owned
   save/options command migration; leave R3's dual-surface/E2E/fallback removal
   to its later integration stage.

## Current implementation frontier — 2026-08-25

T03 is integrated at `1aa17aac6da3ef23610067b7f264bb38a835da4e`; its verified
evidence is recorded in the [T03 evidence report](handoff/evidence/t03-integration-2026-08-25.md).
T03 does not complete V1. T10 is its direct newly unlocked ticket. T05 retains
its own MoveRecovery/WAL gate; T06 remains dependent on T05 and the earlier
T02/T04/T04b prerequisites; T07 and T08 remain later tickets. The remaining V1
frontier is therefore not complete.

## Decisions so far

- [确定首版产品边界](issues/01-define-v1-product-boundaries.md): the three V1 contracts, lossless Move, disk-backed Open, two-pane limit, standard details preview, and two mandatory prototype gates are accepted.
- [复现并界定 HTML details 当前行为](issues/06-research-current-html-details-behavior.md): 源码证据确认 sanitized raw HTML preview 依赖浏览器 native details，MarkText 尚无专用样式/事件/动效；真实 browser/Electron、键盘和主题仍 Untested/Unavailable，后续 prototype 必须验证。
- [定义标签页跨窗口传输与窗口生命周期契约](issues/02-define-cross-window-transfer-contract.md): Move 是有 ACK 与回滚保证的无损所有权转移；Open 仅打开已保存文件的独立磁盘副本，并以显式冲突保护与会话恢复维持多窗口安全。
- [验证标签拖动目的地与脱离原生窗口手势](issues/03-prototype-tab-drag-destinations.md): A — Edge bands 已接受；脱离必须由真实窗口外左键释放提交，Issue 10 已在 Windows 单主屏证实，其他配置按 fallback 禁用。
- [验证原生窗口外释放手势](issues/10-prove-native-external-release-gesture.md): Windows 单主屏已接受事件级原生 observer/main adapter；未验证平台与 mixed-DPI 下 V1 禁用外拖脱离，不以 crossing、blur 或 timeout 替代释放。
- [设计 pane-scoped workspace domain model](issues/04-design-pane-scoped-workspace-model.md): WindowWorkspace 以一到两个 Pane 组织窗口本地的 Document、View 与 Tab；焦点路由、隔离编辑器和可恢复的双栏生命周期均已定案。
- [设计 WorkspaceController 深模块 interface](issues/11-design-workspace-controller-interface.md): 已接受三入口 typed command/projection/lease 契约、原子 revision 与恢复/持久化边界。
- [设计 TabTransfer IPC 与文件所有权契约](issues/09-design-tab-transfer-ipc-contract.md): 已 resolved；Issue 08 的全部前置依赖（02、03、04、05、06、07、09、10、11）均已解除，下一张是 Issue 08。
- [定义分阶段实现交接与验收矩阵](issues/08-define-staged-handoff-and-acceptance.md): 已 resolved；最终 [V1 Spec](handoff/v1-spec.md)、[implementation tickets](handoff/tickets/) 和 [acceptance matrix](handoff/acceptance-matrix.md) 已交接，按 waves 实施并由矩阵验收。
- [确认 Split 布局、命中区与动效](issues/05-prototype-split-layout-and-motion.md): A — Live divide 与几何/动效约束、菜单简化方案已接受。
- [确认 details disclosure 视觉与交互](issues/07-prototype-details-disclosure.md): A — Minimal inline row（Obsidian-like）及其原生 summary、源码编辑、动效、主题与导出边界已接受。
- [定义启动常规恢复与紧急恢复边界](issues/12-define-startup-restore-emergency-recovery-boundary.md): 默认启动不恢复普通工作区；显式文件优先；crash/power-loss/Move 紧急恢复始终运行，未来 normal restore 才由默认关闭的设置控制。

## Out of scope

- More than two panes, vertical splits, or recursive/nested splitting.
- Showing the same document in both panes.
- Persisting transient `details` click state or parsing Markdown inside raw HTML, unless a future map redraws the destination.
- Preferences redesign.
- Normal workspace restore setting/UI and normal session migration until a future
  destination redraws this map.

## T03 integration update — 2026-08-25

- T03 is complete and locally integrated at `1aa17aac6da3ef23610067b7f264bb38a835da4e`.
  Independent [Standards and Spec reviews both passed](handoff/evidence/t03-integration-2026-08-25.md#independent-review-evidence);
  the T03 blocking findings are cleared.
- Closed blockers: canonical-left collapse adapter/Vue-key ownership, the
  320px split-pane minimum, and missing A03 Electron evidence. The accepted
  `set-split-ratio` Controller-owned seam is required by V1 WindowWorkspace;
  the ticket's “唯一 typed exception” wording remains a minor record item.
- Evidence inherited from the verified integration is recorded in the [T03
  evidence report](handoff/evidence/t03-integration-2026-08-25.md). Only its
  precisely confirmed commands are [Passed](handoff/evidence/t03-integration-2026-08-25.md#precisely-confirmed-commands-and-results); aggregate source/#781, tab, and UI
  regression counts whose exact selections are unavailable remain record items.
- The integration worktree had no `node_modules`, so repeated commands were
  unavailable there; integration was fast-forward-only to the same verified SHA.
- T03 does not complete V1. T10 is now integrated/reviewed at the next direct
  dependent frontier; T07 native detach, T08 menu work (including Split Right),
  T05/T06, and all other tickets retain their actual frontier state.
- Non-blocking known record items remain: broad legacy tabs history coverage
  uses `getMarkdownContent` and can perturb history through repeated Source
  round-trips (authoritative no-perturbation Item 252 passed); close-saved zero
  tabs expectation conflicts with V1 all-empty clean New Tab; 39 existing
  workspace-runtime formatting lint errors, 7 baseline warnings, and the
  existing Vite dynamic-import warning; and the focused wrappers in `tabs.vue`
  are a Duplicated Code judgment call. None requires T03 rework.
- Release, publishing, or any remote push.

## T09/T10 details integration update — 2026-08-25

- T09's original implementation was already present on the old baseline. This
  round found and fixed an active-content blocker where Preview/Escape could
  re-enter source mode; the fix is `463c2c4ac58140fe0f50c7da9873fc9b956be193`.
  Independent Standards and Spec reviews both passed with no findings.
- T10 is integrated at local integration HEAD
  `344dbff17a894751dc61ddbf750c711d3b855beb`. Independent Standards and Spec
  reviews both passed with no blocking findings. The details automation surface
  is complete; V1 as a whole is not complete.
- T09/T10 evidence is recorded in [the details integration report](handoff/evidence/t09-t10-details-integration-2026-08-25.md).
  HTML export is proven to retain standard `details`/`summary`/`open` markup
  without editor-only controls/tokens; this is not a PDF pass.
- Screen-reader spot check and PDF visual inspection are `Unavailable`/not yet
  accepted. A11/A12 therefore retain pending manual portions for T12 or an
  available environment and are not marked as fully manually complete.
- T03 remains integrated; T05 remains active; T06 remains dependent on T05;
  T07, T08, T11 and T12 retain their real dependency/frontier states and are
  not unlocked or completed by T10 alone.
