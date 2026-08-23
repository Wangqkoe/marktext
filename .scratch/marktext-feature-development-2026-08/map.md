# MarkText workspace feature wayfinder

Label: `wayfinder:map`
Status: `exploring`

## Destination

Produce implementation-ready specifications, confirmed interaction prototypes, and an acceptance-backed ticket handoff for three coordinated workspace features: cross-window tabs, a two-pane split workspace, and styled raw-HTML `details` disclosures. This map does not implement product changes.

## Notes

- Consult `wayfinder` for map operations; use `grilling` and `domain-modeling` for decision tickets, and `prototype` for interaction-validation tickets.
- The local integration branch is `codex/marktext-feature-development-2026-08` in `E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08`.
- Every implementation ticket must use its own worktree and `codex/<ticket-feature-name>` branch. Commits stay local; never push.
- Window/IPC behavior, pane persistence, and shared editor state are high-risk and require `gpt-5.6-terra` at `high` plus independent review. Normal implementation uses `gpt-5.6-terra` at `medium`.

## Decisions so far

- [确定首版产品边界](issues/01-define-v1-product-boundaries.md): the three V1 contracts, lossless Move, disk-backed Open, two-pane limit, standard details preview, and two mandatory prototype gates are accepted.
- [复现并界定 HTML details 当前行为](issues/06-research-current-html-details-behavior.md): 源码证据确认 sanitized raw HTML preview 依赖浏览器 native details，MarkText 尚无专用样式/事件/动效；真实 browser/Electron、键盘和主题仍 Untested/Unavailable，后续 prototype 必须验证。
- [定义标签页跨窗口传输与窗口生命周期契约](issues/02-define-cross-window-transfer-contract.md): Move 是有 ACK 与回滚保证的无损所有权转移；Open 仅打开已保存文件的独立磁盘副本，并以显式冲突保护与会话恢复维持多窗口安全。
- [验证标签拖动目的地与脱离原生窗口手势](issues/03-prototype-tab-drag-destinations.md): A — Edge bands 已接受；脱离必须由真实窗口外左键释放提交，原生事件证明仍待下游完成。
- [设计 pane-scoped workspace domain model](issues/04-design-pane-scoped-workspace-model.md): WindowWorkspace 以一到两个 Pane 组织窗口本地的 Document、View 与 Tab；焦点路由、隔离编辑器和可恢复的双栏生命周期均已定案。

## Not yet specified

- The exact CSS and event strategy after both interaction prototypes provide evidence.
- Final implementation-ticket slicing after all decision and prototype gates are resolved.

## Out of scope

- More than two panes, vertical splits, or recursive/nested splitting.
- Showing the same document in both panes.
- Persisting transient `details` click state or parsing Markdown inside raw HTML, unless a future map redraws the destination.
- Preferences redesign.
- Release, publishing, or any remote push.
