# 桌面 UI 与文件夹导航 Tickets

- 输入 Spec：`docs/specs/desktop-ui-folder-navigation.md`
- 代码地图：`docs/wayfinder/desktop-ui-folder-navigation.md`
- 基线：`6bd21820029885e08ae8e4938cede71ad9ae30ca`
- 拆票原则：最小必要实现、单票单一可验收结果、同文件不并行、每票一个本地提交、不推送。

## 1. 执行规则

每个执行任务开始时必须完整阅读 `AGENTS.md`、Spec、本文件和 Wayfinder，核对指定基线/依赖提交及 clean worktree；detached HEAD 正常时从该提交创建自己的 `codex/` 分支。执行任务不递归创建任务，不扩大产品范围。

每票只修改 `Owned files`；若发现必须修改其他票拥有的文件，先停止写入并交协调任务重排所有权。列表中的 `可能新增` 文件可由执行者按最小实现命名，但需在回报中列出。所有提交只在本地；不推送。

高风险票 T02、T03、T06 的实现与独立复审均使用 `gpt-5.6-sol`、extra high。其他实现/测试/文档票使用 `gpt-5.6-sol`、medium。复审按 Standards/Spec 两轴进行；只有数据/持久化、安全/崩溃/并发、核心验收缺失或必需 test/build failure 是阻断问题。

## 2. 依赖与可并行 frontier

```text
T00 i18n scaffold
  ├─ T01 Concise + title display ─┐
  ├─ T04 Files visual + TOC wrap ─┴─ T02 Close Folder lifecycle ─ T03 shared tab/opened menu ─ T05 inline Files/Outline search ─┐
  └─ T06 scroll profile/optimize ────────────────────────────────────────────────────────────────────────────────────────────────┤
                                                                                                                                └─ T07 integration acceptance
```

并行策略：

- T00 先单独完成，集中拥有所有 locale JSON，后续票不得再编辑这些文件；若实现中发现缺词，回到 T00 的 follow-up 提交或由协调任务串行处理。
- T00 后，T01、T04、T06 可并行，Owned files 不重叠。
- T02 在 T01 和 T04 都移交后开始：它与 T01 共用 `shared/types/ipc.ts`、preload 和 main window/menu IPC，与 T04 共用 root context-menu 所在 Sidebar SFC。这些是文件所有权约束，不是产品依赖。
- T03 等待 T02 的 Close Folder/Open-current-window 单一契约。
- T05 等待 T03；这样 T02、T03、T04、T05 对同一组 Sidebar SFC 严格串行。
- T07 等待 T01–T06 集成。任何同文件 follow-up 串行，不在两个 worktree 同时改。

## T00 — 本地化文案脚手架

### 目标

一次性为本阶段所有新 UI 文案建立完整 locale key：Concise、Close Folder、Open/Close This Folder、Files/Outline inline search 的按钮、placeholder、无结果与 accessible labels。placeholder 可本地化说明，但语法 token 必须原样包含 `file:`、`folder:`。

### 非目标

- 不接 UI，不改行为、preferences schema、IPC 或测试夹具。
- 不重排或顺手修订既有翻译。

### 依赖

- 无。

### Owned files

- `packages/desktop/static/locales/en.json`
- `packages/desktop/static/locales/de.json`
- `packages/desktop/static/locales/es.json`
- `packages/desktop/static/locales/fr.json`
- `packages/desktop/static/locales/ja.json`
- `packages/desktop/static/locales/ko.json`
- `packages/desktop/static/locales/pt.json`
- `packages/desktop/static/locales/tr.json`
- `packages/desktop/static/locales/zh-CN.json`
- `packages/desktop/static/locales/zh-TW.json`
- `packages/desktop/test/unit/specs/i18n.spec.ts`

### 风险/执行配置

- 普通 i18n/测试，`gpt-5.6-sol`、medium。
- 风险是 locale key 不齐或错误翻译稳定语法 token；不涉及持久化。

### 自动验证

```powershell
pnpm exec vitest run packages/desktop/test/unit/specs/i18n.spec.ts
pnpm exec eslint packages/desktop/static/locales packages/desktop/test/unit/specs/i18n.spec.ts
```

### 人工检查

- 逐 locale 确认 key 结构完全一致。
- 搜索所有新字符串，确认 `file:`、`folder:` 没有被翻译或改写。

### 回归范围

- locale 解析、fallback、main/renderer 共同 key 可用性。

### 提交边界

- 一个本地提交：`i18n: add desktop navigation labels`。

## T01 — Concise 标题栏与标题显示修复

### 目标

在 Windows/Linux editor window 增加需重启的 Concise，精确实现 30px 顶级菜单/安全居中/窗口控件；从当前窗口实时 Electron menu 弹出对应 submenu；修复 Custom/Concise 数字、日期和 bidi 标题显示，共享同一标题格式/中间省略 seam。保持 Custom/Native 默认和辅助窗口行为。

### 非目标

- 不实现 Alt mnemonic、顶级菜单键盘左右切换、hover 切换或 overflow。
- 不修改 File 菜单内容或 Folder 生命周期。
- 不让 macOS/Preferences 使用 Concise editor titlebar。

### 依赖

- T00。

### Owned files

- `packages/desktop/src/main/config.ts`
- `packages/desktop/src/main/windows/editor.ts`（仅 window creation/titlebar 分支；T01 完成后移交 T02）
- `packages/desktop/src/main/windows/setting.ts`
- `packages/desktop/src/main/ipc/window.ts`（Concise submenu IPC；完成后移交 T02）
- `packages/desktop/src/main/menu/index.ts`（只读/导出当前窗口 live menu seam；完成后移交 T02）
- `packages/desktop/src/main/preferences/schema.json`
- `packages/desktop/src/preload/index.ts`（完成后移交 T02）
- `packages/desktop/src/shared/types/ipc.ts`（完成后移交 T02）
- `packages/desktop/src/shared/types/menu.ts`
- `packages/desktop/src/renderer/src/store/preferences.ts`
- `packages/desktop/src/renderer/src/prefComponents/general/config.ts`
- `packages/desktop/src/renderer/src/prefComponents/general/index.vue`
- `packages/desktop/src/renderer/src/pages/preference.vue`
- `packages/desktop/src/renderer/src/components/titleBar/index.vue`
- `packages/desktop/src/renderer/src/components/titleBar/visibility.ts`
- 可新增 `components/titleBar/` 下纯标题布局/省略 helper
- `packages/desktop/test/unit/specs/titlebar-visibility.spec.ts`
- `packages/desktop/test/unit/specs/application-menu-state.spec.ts`
- `packages/desktop/test/e2e/native-titlebar-startup.spec.ts`
- 可新增 `packages/desktop/test/unit/specs/titlebar-display.spec.ts`、`test/e2e/concise-titlebar.spec.ts`

### 风险/执行配置

- 普通 UI + main/menu seam，`gpt-5.6-sol`、medium。
- Electron live submenu/role/accelerator 保真若出现跨窗口错误，升级为高风险复审，但不改变 Spec。

### 自动验证

```powershell
pnpm exec vitest run packages/desktop/test/unit/specs/titlebar-visibility.spec.ts packages/desktop/test/unit/specs/application-menu-state.spec.ts packages/desktop/test/unit/specs/titlebar-display.spec.ts
pnpm exec playwright test --config=packages/desktop/test/e2e/playwright.config.ts packages/desktop/test/e2e/native-titlebar-startup.spec.ts packages/desktop/test/e2e/concise-titlebar.spec.ts
pnpm typecheck
pnpm exec eslint packages/desktop/src/main/config.ts packages/desktop/src/main/windows/editor.ts packages/desktop/src/main/windows/setting.ts packages/desktop/src/main/ipc/window.ts packages/desktop/src/main/menu/index.ts packages/desktop/src/preload/index.ts packages/desktop/src/shared/types packages/desktop/src/renderer/src/components/titleBar packages/desktop/src/renderer/src/pages/preference.vue packages/desktop/src/renderer/src/prefComponents/general packages/desktop/src/renderer/src/store/preferences.ts
```

### 人工检查

- Windows 100%/125% 与 Linux：Custom、Native、Concise 重启矩阵；macOS 仅确认选项不可见和现有行为不变。
- 550px 最窄窗口与正常/最大化窗口：八个菜单不折叠，窗口控件可点，标题相对整窗中心且不覆盖。
- live checked/disabled/radio/submenu/accelerator 与 submenu 内键盘导航。
- `123.md`、`2026-08-30.md`、`1.2.3.md`、中文、英文、阿拉伯/RTL、混合名称，正常/窄窗、Custom/Concise、hover 全名。
- Preferences 等辅助窗口在 Concise preference 下仍 frameless close、无顶级菜单。

### 回归范围

- Custom/Native startup、macOS in-app titlebar、window controls/fullscreen/maximize、per-window menu state、document.title、rename hover。

### 提交边界

- 一个本地提交：`feat: add concise editor titlebar`。
- 不包含 Folder menu、Sidebar 或滚动改动。

## T02 — Close Folder 完整生命周期

### 目标

提供 main 主导、renderer 同步、可持久化且抵御 late watcher events 的单一 Close Folder 动作；在 File 菜单和 Folder root context menu 精确接入。保留 tabs/dirty buffers/file watchers/recent/last picker path，关闭后显示可见 Files 空状态，重启不恢复旧 root。

### 非目标

- 不添加标签页/Open Files 的 Open/Close This Folder（T03）。
- 不改变正常 Open Folder 的 `openFolderInNewWindow` 行为。
- 不清除 tabs、保存内容或磁盘文件。

### 依赖

- T00、T01、T04（后两者是 shared IPC/main 与 Sidebar SFC 的文件所有权移交）。

### Owned files

- `packages/desktop/src/main/windows/editor.ts`
- `packages/desktop/src/main/filesystem/watcher.ts`
- `packages/desktop/src/main/app/windowManager.ts`
- `packages/desktop/src/main/menu/templates/file.ts`
- `packages/desktop/src/main/menu/actions/file.ts`
- `packages/desktop/src/main/menu/index.ts`
- `packages/desktop/src/main/ipc/window.ts`（如共享 root command 走此注册点）
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/shared/types/ipc.ts`
- `packages/desktop/src/renderer/src/store/project.ts`
- `packages/desktop/src/renderer/src/store/bufferedState.ts`
- `packages/desktop/src/renderer/src/store/layout.ts`
- `packages/desktop/src/renderer/src/contextMenu/sideBar/index.ts`
- `packages/desktop/src/renderer/src/contextMenu/sideBar/menuItems.ts`
- `packages/desktop/src/renderer/src/contextMenu/sideBar/actions.ts`
- `packages/desktop/src/renderer/src/components/sideBar/tree.vue`（只改 root context menu caller；接收 T04 移交）
- `packages/desktop/src/renderer/src/components/sideBar/treeFolder.vue`（只改 target kind caller；接收 T04 移交）
- `packages/desktop/src/renderer/src/components/sideBar/treeFile.vue`（只改 target kind caller；接收 T04 移交）
- `packages/desktop/test/unit/specs/file-observation-hub.spec.ts` 或可新增 watcher root-generation spec
- `packages/desktop/test/unit/specs/layout-state.spec.ts`
- 可新增 `packages/desktop/test/unit/specs/close-folder-lifecycle.spec.ts`
- 可新增 `packages/desktop/test/e2e/close-folder.spec.ts`
- `packages/desktop/test/e2e/workspace-startup-policy.spec.ts`

### 风险/执行配置

- **高风险：持久化、watcher、并发、跨 main/renderer。** 实现和独立复审均为 `gpt-5.6-sol`、extra high。
- 阻断候选必须附直接证据：旧 root 复现、dirty buffer 丢失、file watcher 被停、重启恢复、菜单状态错误或测试/build failure。

### 自动验证

```powershell
pnpm exec vitest run packages/desktop/test/unit/specs/close-folder-lifecycle.spec.ts packages/desktop/test/unit/specs/layout-state.spec.ts packages/desktop/test/unit/specs/file-observation-hub.spec.ts packages/desktop/test/unit/specs/watcher-ignore-change.spec.ts packages/desktop/test/unit/specs/watcher-await-write-finish.spec.ts
pnpm exec playwright test --config=packages/desktop/test/e2e/playwright.config.ts packages/desktop/test/e2e/close-folder.spec.ts packages/desktop/test/e2e/workspace-startup-policy.spec.ts
pnpm typecheck
pnpm exec eslint packages/desktop/src/main/windows/editor.ts packages/desktop/src/main/filesystem/watcher.ts packages/desktop/src/main/app/windowManager.ts packages/desktop/src/main/menu packages/desktop/src/main/ipc/window.ts packages/desktop/src/preload/index.ts packages/desktop/src/shared/types/ipc.ts packages/desktop/src/renderer/src/store/project.ts packages/desktop/src/renderer/src/store/bufferedState.ts packages/desktop/src/renderer/src/store/layout.ts packages/desktop/src/renderer/src/contextMenu/sideBar packages/desktop/src/renderer/src/components/sideBar
```

### 人工检查

- root/子目录/文件菜单逐项核对；File menu 顺序与 enabled 状态。
- 多 tab、左右 pane、dirty saved file、untitled 同时存在时 Close Folder；继续编辑/保存。
- close 后立刻在旧目录 create/rename/delete，等待 watcher settle，再开新 root，确认无旧节点。
- close 后立即退出并重启，确认不恢复 root；recent folder 和 picker last path 仍在。
- 重复 close command 幂等。

### 回归范围

- Open Folder replacement、folder/file watcher、own-save ignore、Sidebar selection/create/rename/copy/paste、layout menu sync、buffer/startup、recent documents。

### 提交边界

- 一个本地提交：`feat: add safe close folder lifecycle`。
- 不包含 Tabs/Opened Files 菜单或 inline search。

## T03 — 标签页与 Opened Files 共享完整菜单

### 目标

让 tab bar 与 focused-pane Opened Files 调用同一个 menu factory/action contract；按规范化父目录与 Folder root 决定 Open/Close This Folder；复用 T02 root 动作；保留 captured pane/view/document，并按 Spec 精确排列 close、Folder、path、Move/Open/Split 组。

### 非目标

- 不改 Folder 生命周期内部实现。
- 不改变 Opened Files 只表示 focused pane。
- 不让 Open This Folder 遵循 `openFolderInNewWindow`。

### 依赖

- T02。

### Owned files

- `packages/desktop/src/renderer/src/contextMenu/tabs/index.ts`
- `packages/desktop/src/renderer/src/contextMenu/tabs/menuItems.ts`
- `packages/desktop/src/renderer/src/contextMenu/tabs/actions.ts`
- `packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue`
- `packages/desktop/src/renderer/src/components/editorWithTabs/index.vue`（只为共享 workspace actions 注入）
- `packages/desktop/src/renderer/src/components/sideBar/treeOpenedTab.vue`（接收 T02/T04 移交）
- `packages/desktop/src/renderer/src/components/sideBar/tree.vue`（只为传递共享 actions；接收 T02/T04 移交）
- 可新增 `renderer/src/contextMenu/tabs/folderTarget.ts`
- `packages/desktop/test/unit/specs/menu-workspace.spec.ts`
- 可新增 `packages/desktop/test/e2e/opened-files-menu.spec.ts`

### 风险/执行配置

- **高风险：跨 workspace 菜单 target/ownership。** 实现和独立复审均为 `gpt-5.6-sol`、extra high。

### 自动验证

```powershell
pnpm exec vitest run packages/desktop/test/unit/specs/menu-workspace.spec.ts
pnpm exec playwright test --config=packages/desktop/test/e2e/playwright.config.ts packages/desktop/test/e2e/opened-files-menu.spec.ts packages/desktop/test/e2e/workspace-transfer-electron.spec.ts
pnpm typecheck
pnpm exec eslint packages/desktop/src/renderer/src/contextMenu/tabs packages/desktop/src/renderer/src/components/editorWithTabs packages/desktop/src/renderer/src/components/sideBar/treeOpenedTab.vue packages/desktop/src/renderer/src/components/sideBar/tree.vue
```

### 人工检查

- 左右 pane 各开多个同名/不同目录文件，焦点切换后分别从 tab/Open Files 右击，确认操作实际点击目标。
- parent==root、parent!=root、Windows 大小写/分隔符等价、untitled 四类。
- Move/Open/Split、close group、Rename/Copy Path/Show in Folder 的条目/结果完全一致。
- Open This Folder 总在当前窗口替换 root，即使偏好打开 folder 于新窗口。

### 回归范围

- workspace transfer/move fences、focused pane projection、legacy global tab events、dirty disk-copy open、rename/path actions、T02 Close Folder。

### 提交边界

- 一个本地提交：`feat: share tab and opened-file menu`。

## T04 — Files 视觉与 TOC wrap 修复

### 目标

在正式代码重新实现 prototype A：Files 全内容 12px inset，Opened Files/Folder tree 间主题 1px divider + 留白，Outline 不受 inset；让既有 Wrap text in TOC 开启时完整无限行换行，关闭时维持单行。

### 非目标

- 不 cherry-pick prototype，不带 variant switcher/script/query param。
- 不实现 inline search、Folder menu 或数据过滤。
- 不改默认 `wordWrapInToc=false`。

### 依赖

- T00。

### Owned files

- `packages/desktop/src/renderer/src/components/sideBar/tree.vue`
- `packages/desktop/src/renderer/src/components/sideBar/treeFile.vue`
- `packages/desktop/src/renderer/src/components/sideBar/treeFolder.vue`
- `packages/desktop/src/renderer/src/components/sideBar/treeOpenedTab.vue`
- `packages/desktop/src/renderer/src/components/sideBar/toc.vue`
- 可新增 `packages/desktop/test/e2e/sidebar-files-visual.spec.ts`
- 可新增 `packages/desktop/test/e2e/toc-wrap.spec.ts`
- `packages/desktop/test/e2e/toc-collapse-state-3028.spec.ts`（仅必要回归调整）

### 风险/执行配置

- 普通 UI/CSS/E2E，`gpt-5.6-sol`、medium。

### 自动验证

```powershell
pnpm exec playwright test --config=packages/desktop/test/e2e/playwright.config.ts packages/desktop/test/e2e/sidebar-files-visual.spec.ts packages/desktop/test/e2e/toc-wrap.spec.ts packages/desktop/test/e2e/toc-collapse-state-3028.spec.ts packages/desktop/test/e2e/toc-panel-content.spec.ts
pnpm typecheck
pnpm exec eslint packages/desktop/src/renderer/src/components/sideBar packages/desktop/test/e2e/sidebar-files-visual.spec.ts packages/desktop/test/e2e/toc-wrap.spec.ts
```

### 人工检查

- light/dark/至少一个自定义主题，Sidebar 220px/宽尺寸；测量 12px inset 和 1px divider。
- Opened Files hidden/expanded、空 root/深树；Outline 首行横向位置与改动前一致。
- 超长、多层 heading 在 wrap on/off、Sidebar resize 下完整换行/单行；无 2/3 行 clamp。

### 回归范围

- Files row click/contextmenu/hit target、create/rename inputs、active/dirty markers、TOC collapse/click scroll、theme divider token。

### 提交边界

- 一个本地提交：`fix: refine files sidebar spacing and toc wrap`。

## T05 — Files/Outline 行内搜索

### 目标

实现 Spec 3.5 的行内 toggle/input、Files 精确 parser/filter/目录展开语义、Outline heading/祖先 filter，以及搜索前展开状态恢复；保持 query 本地且不持久化，保留独立 Search view/ripgrep。

### 非目标

- 不新增 shortcut、regex/glob/boolean/quotes/escape。
- 不改正文 Find in Folder 或 Search view。
- 不修改 canonical `projectTree`/TOC 数据来表示过滤结果。

### 依赖

- T03（并已包含 T04 的视觉基线和 T02 的 Folder seam）；接收同组 Sidebar SFC 的最终所有权。

### Owned files

- `packages/desktop/src/renderer/src/components/sideBar/index.vue`
- `packages/desktop/src/renderer/src/components/sideBar/tree.vue`
- `packages/desktop/src/renderer/src/components/sideBar/treeFolder.vue`
- `packages/desktop/src/renderer/src/components/sideBar/treeFile.vue`
- `packages/desktop/src/renderer/src/components/sideBar/treeOpenedTab.vue`
- `packages/desktop/src/renderer/src/components/sideBar/toc.vue`
- `packages/desktop/src/renderer/src/components/sideBar/types.ts`
- `packages/desktop/src/renderer/src/util/tocKeys.ts`（仅必要的 stable-key filter support）
- 可新增 `packages/desktop/src/renderer/src/util/sidebarFilter.ts`
- 可新增 `packages/desktop/test/unit/specs/sidebar-filter.spec.ts`
- 可新增 `packages/desktop/test/unit/specs/outline-filter.spec.ts`
- 可新增 `packages/desktop/test/e2e/sidebar-inline-search.spec.ts`
- `packages/desktop/test/e2e/ripgrep-search.spec.ts`（仅回归）

### 风险/执行配置

- 普通 UI + 纯派生状态，`gpt-5.6-sol`、medium。
- 若实现试图复制 canonical tree 或异步 watcher mutation，停止并请求协调任务重新分级。

### 自动验证

```powershell
pnpm exec vitest run packages/desktop/test/unit/specs/sidebar-filter.spec.ts packages/desktop/test/unit/specs/outline-filter.spec.ts packages/desktop/test/unit/specs/toc-keys.spec.ts
pnpm exec playwright test --config=packages/desktop/test/e2e/playwright.config.ts packages/desktop/test/e2e/sidebar-inline-search.spec.ts packages/desktop/test/e2e/ripgrep-search.spec.ts packages/desktop/test/e2e/toc-collapse-state-3028.spec.ts
pnpm typecheck
pnpm exec eslint packages/desktop/src/renderer/src/components/sideBar packages/desktop/src/renderer/src/util/sidebarFilter.ts packages/desktop/src/renderer/src/util/tocKeys.ts packages/desktop/test/unit/specs/sidebar-filter.spec.ts packages/desktop/test/unit/specs/outline-filter.spec.ts packages/desktop/test/e2e/sidebar-inline-search.spec.ts
```

### 人工检查

- toggle/再次点击/Esc、内容被下推、Files↔Outline 保持框但清 query/换 placeholder、重启无 query。
- 无 prefix/file:/folder: 大小写/空 term/未知 prefix；同名 folder + descendant file；纯目录命中后手动展开原完整内容；清空恢复原展开。
- 无 root + Opened Files + untitled；`folder:` 保留 Open Folder 入口。
- Outline 嵌套/重复 heading，匹配祖先与恢复 collapse。
- Edit → Find in Folder/ripgrep Search view 行为、shortcut 和 UI 不变。

### 回归范围

- watcher 更新期间过滤、Folder replacement/close、Opened Files focused pane、create/rename、TOC click/programmatic scroll、layout persistence。

### 提交边界

- 一个本地提交：`feat: add inline files and outline filtering`。

## T06 — 全 renderer 滚动 profiling 与最小优化

### 目标

先记录 WYSIWYG 及各 renderer scroll container 的 profile/计数证据，再做满足 Spec 3.6 的最小优化：原生 1:1 跟手、同 frame 同 view 至多一次最终 scrollTop report/commit、无变化不 commit、旧 lease 不污染；保持程序化跳转动画。

### 非目标

- 不加 inertia/delay/custom scrollbar，不重写滚动系统。
- 不假定 WYSIWYG 根因自动适用于 Source/Sidebar/Preferences。
- 不改 tab 横向 wheel 或 image viewer zoom，除非独立 profile 证明其违反 Spec 且协调任务确认文件所有权。

### 依赖

- 无产品依赖；可与 T01/T04 并行。若 profile 需要写 Sidebar/Preferences 文件，必须等待对应票并由协调任务重新分配。

### Owned files

- `packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue`
- `packages/desktop/src/renderer/src/components/editorWithTabs/sourceCode.vue`（仅有独立证据时）
- `packages/desktop/src/renderer/src/store/editor.ts`
- `packages/desktop/src/renderer/src/workspace/controller.ts`
- `packages/desktop/src/renderer/src/workspace/paneEditorAdapter.ts`
- `packages/desktop/src/renderer/src/workspace/projectionMirror.ts`（仅有计数证据时）
- 可新增 `packages/desktop/src/renderer/src/util/scrollReportGate.ts`
- `packages/desktop/test/unit/specs/workspace-runtime.spec.ts`
- `packages/desktop/test/unit/specs/workspace-projection-mirror.spec.ts`
- 可新增 `packages/desktop/test/unit/specs/scroll-report-frequency.spec.ts`
- `packages/desktop/test/e2e/toc-scroll.spec.ts`
- `packages/desktop/test/e2e/source-toc-scroll.spec.ts`
- `packages/desktop/test/e2e/scroll-up-arrow.spec.ts`
- 可新增 `packages/desktop/test/e2e/renderer-scroll-performance.spec.ts`
- 可新增 `docs/testing/desktop-scroll-profile.md`（仅 profile 数据，不写产品新需求）

### 风险/执行配置

- **高风险：workspace commit/订阅/lease、性能与最终状态持久性。** 实现和独立复审均为 `gpt-5.6-sol`、extra high。

### 自动验证

```powershell
pnpm exec vitest run packages/desktop/test/unit/specs/scroll-report-frequency.spec.ts packages/desktop/test/unit/specs/workspace-runtime.spec.ts packages/desktop/test/unit/specs/workspace-projection-mirror.spec.ts packages/desktop/test/unit/specs/editor-store-anchor.spec.ts
pnpm exec playwright test --config=packages/desktop/test/e2e/playwright.config.ts packages/desktop/test/e2e/renderer-scroll-performance.spec.ts packages/desktop/test/e2e/toc-scroll.spec.ts packages/desktop/test/e2e/source-toc-scroll.spec.ts packages/desktop/test/e2e/scroll-up-arrow.spec.ts
pnpm typecheck
pnpm exec eslint packages/desktop/src/renderer/src/components/editorWithTabs packages/desktop/src/renderer/src/store/editor.ts packages/desktop/src/renderer/src/workspace packages/desktop/src/renderer/src/util/scrollReportGate.ts packages/desktop/test/unit/specs/scroll-report-frequency.spec.ts packages/desktop/test/e2e/renderer-scroll-performance.spec.ts
```

计数测试必须明确断言：相同值零 commit；同 animation frame burst 一次最终 report/commit；下一 frame 新值一次；unmount/tab switch 后旧 callback 不提交；最终 snapshot scrollTop 正确。

### 人工检查

- 在同一构建、同一夹具下记录优化前后 profile/计数。
- 长文档、多 tabs，WYSIWYG/Source，wheel/touchpad（可用时）/thumb；密集 Files/Outline/Search；Preferences 长页；其他 overflow 清单 smoke。
- TOC/search/cursor programmatic jump 动画与改动前一致。

### 回归范围

- workspace revision/listeners、crash-draft/DocumentIO subscriber、pane isolation、source handoff、scroll restoration、TOC/source jump、typewriter/cursor scrolling。

### 提交边界

- 一个本地提交：`perf: reduce renderer scroll state churn`。
- profile 文档与支持测试可同提交；不包含无证据的 UI 清理。

## T07 — 阶段集成、自动验收与人工试用包

### 目标

按依赖顺序集成 T00–T06，解决仅由集成产生的冲突，运行完整自动验收并从目标 HEAD 新构建；执行 Windows 主要人工矩阵，记录其他平台状态，组织高风险独立 Standards/Spec review，形成可交给用户 Acceptance 的证据。

### 非目标

- 不增加新功能或顺手重构。
- 不把记录项升级为修复，除非它直接阻断必需验收并由协调任务明确决定。
- 不推送、发布或触碰原始工作树。

### 依赖

- T00–T06 均已本地提交并交回；T02/T03/T06 独立 review 已完成或阻断问题已修复。

### Owned files

- 集成分支全部已改文件（仅冲突消解和验收必要最小修正）。
- `docs/wayfinder/desktop-ui-folder-navigation.md`（更新最终 seam/frontier）
- 可新增 `docs/testing/desktop-ui-folder-navigation-acceptance.md`
- 集成/E2E 测试文件；不得提交 `packages/desktop/out` 或安装包，除非仓库既有规则另有要求。

### 风险/执行配置

- 集成执行 `gpt-5.6-sol`、medium；关键最终复审为 `gpt-5.6-sol`、extra high。
- 任何数据丢失、旧 root 污染、wrong-pane menu action、scroll final-state 丢失、核心平台不可用或必需 build/test failure 为阻断。

### 自动验证

```powershell
pnpm exec prettier --check docs/specs/desktop-ui-folder-navigation.md docs/wayfinder/desktop-ui-folder-navigation.md docs/tickets/desktop-ui-folder-navigation.md docs/testing/desktop-ui-folder-navigation-acceptance.md
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm build
git status --short
```

必须按 `Passed/Failed/Skipped/Unavailable/Untested` 记录每项，附环境、命令和失败决策。最终 E2E/打包不得复用陈旧 `packages/desktop/out`；从目标 HEAD 重新生成，并以 bundle/app.asar 或等价哈希/内容证据确认目标提交已进入产物。

### 人工检查

- Windows：Custom/Native/Concise、100%/125%、正常/窄/最大化；所有 Spec 标题、menu、Folder、搜索、滚动矩阵。
- Linux/macOS：在可用环境执行；不可用必须标 `Unavailable`，不能写 Passed。macOS 特别确认无 Concise 且其他功能正常。
- light/dark/custom theme，keyboard/mouse/touchpad（设备可用时），多 pane/tab/dirty/untitled/root replace/close/restart。
- 用户最终 Acceptance 前提供准确构建 SHA/标识、步骤和已知限制。

### 回归范围

- 全部 Spec 章节；邻接回归包括 startup、save/rename/transfer、layout persistence、ripgrep、TOC jump、native titlebar、i18n、build/package freshness。

### 提交边界

- 集成提交保留各票原始提交；冲突消解/验收文档最多一个独立本地提交：`test: validate desktop navigation improvements`。
- 完成回报包含集成 SHA、包含的票 SHA、review 结论、验证矩阵、人工环境、限制和 clean status；不宣布用户最终 Acceptance 已完成。
