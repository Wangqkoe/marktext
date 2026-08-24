# MarkText workspace feature wayfinder

Label: `wayfinder:map`
Status: `complete`

Destination: achieved — implementation handoff includes default-off normal startup
and always-on emergency recovery boundaries.

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
- Normal workspace restore is deferred; V1 uses a clean default startup or explicit
  file targets while EmergencyRecovery remains mandatory.

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
- Release, publishing, or any remote push.
