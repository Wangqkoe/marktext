# 桌面 UI 与文件夹导航 Wayfinder

- 初始代码基线：`6bd21820029885e08ae8e4938cede71ad9ae30ca`
- 长期集成分支：`codex/marktext-feature-development-2026-08`
- 最终验收与 Windows 打包源：`cbdfdb4f36bd5bfda919ce363ca09e82ce9f1074`
- 历史 T07 自动化行为源：`6e2071e495677bf4c650b649d879ecec77bbeddc`
- 核对日期：2026-09-01
- 路径约定：除非另有说明，本文路径均相对于仓库根目录
- 配套 Spec：`docs/specs/desktop-ui-folder-navigation.md`
- 验收证据：`docs/testing/desktop-ui-folder-navigation-acceptance.md`
- Windows 打包清单：`docs/testing/desktop-ui-folder-navigation-windows-package.md`

本文前十节保留初始代码地图和实现 frontier，供追溯设计依据；第 11 节记录最终集成后的事实 seam、验证边界和剩余 frontier。聊天探索是检索线索，不是代码事实；行号为大致定位，后续提交会自然漂移。

## 1. 总览与状态流

```text
main EditorWindow
  ├─ _openedRootDirectory / directory watcher
  ├─ per-window Electron Menu
  └─ webContents IPC
          │
          ▼
renderer project store ── projectTree ── Files tree components
          │                                  │
          ├─ root-owned UI caches             └─ root/file context menus
          └─ buffered-state seam

WorkspaceController ── focused-pane projection ── Pinia editor facade
       │                         │                    │
       ├─ pane/view lease        ├─ tab bars          └─ Opened Files
       └─ commit/subscribers     └─ TOC/status
```

主要实现边界不是单一组件：Folder root 同时存在于 main `EditorWindow`、目录 watcher、renderer `project` store、Sidebar layout 和历史 buffered-state seam；标签页当前事实源位于 `WorkspaceController`，Pinia editor store 是 compatibility facade；应用菜单由 main 为每个窗口保存，renderer 只能经 preload/IPC 请求弹出。

## 2. Titlebar、菜单与 Preferences

| 路径（相对仓库根；绝对路径为仓库根 + 此列）                               | 当前符号/大致行号                                                                                           | 当前职责与实现 seam                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/main/config.ts`                                     | `editorWinOptions` 8–27；`preferencesWinOptions` 29–51；`TITLE_BAR_HEIGHT` 77                               | 编辑器默认 `frame:false`、`hiddenInset`；辅助窗口也默认 frameless。现有非 macOS titlebar 高度常量为 32，不等同于 Concise 要求的 30px。                                                                     |
| `packages/desktop/src/main/windows/editor.ts`                             | `createWindow` 110–347；titlebar 分支 139–153；`appMenu.addEditorMenu` 192–193                              | 读取持久化 `titleBarStyle`，非 macOS 仅 `native` 打开 frame。Concise 应继续 frameless，并只影响 editor window。                                                                                            |
| `packages/desktop/src/main/windows/setting.ts`                            | `createWindow` 25–100；titlebar 分支 47–54                                                                  | 当前辅助窗口会随 `native` 变为 frame。Spec 要求 Concise 在此被当作 Custom frameless，而不是渲染编辑器 Concise 菜单。                                                                                       |
| `packages/desktop/src/main/preferences/schema.json`                       | `titleBarStyle` 13–17；`wordWrapInToc` 40–44                                                                | titlebar enum 当前仅 `custom/native`，默认 `custom`；TOC wrap 默认 `false`。                                                                                                                               |
| `packages/desktop/src/renderer/src/store/preferences.ts`                  | `TitleBarStyle` 11；`PreferencesState` 24–41；默认值约 147                                                  | renderer 类型与默认状态需接受 `concise`，但默认不得改变。                                                                                                                                                  |
| `packages/desktop/src/renderer/src/prefComponents/general/config.ts`      | `getTitleBarStyleOptions` 4–13                                                                              | Preferences 下拉当前只有 Custom/Native。                                                                                                                                                                   |
| `packages/desktop/src/renderer/src/prefComponents/general/index.vue`      | titlebar select 35–42                                                                                       | 已在 macOS 通过 `v-if="!isOsx"` 隐藏整组选项；可保留此平台边界。                                                                                                                                           |
| `packages/desktop/src/renderer/src/pages/preference.vue`                  | `showCustomTitleBar` 34–40；frameless class 7                                                               | 当前只有 `custom`/macOS 显示辅助窗口自绘 close。Concise 必须进入这条 Custom 式路径。                                                                                                                       |
| `packages/desktop/src/renderer/src/prefComponents/common/titlebar.vue`    | template 1–16；styles 27–72                                                                                 | Preferences 的 frameless close 控件；不应加入顶级菜单。                                                                                                                                                    |
| `packages/desktop/src/renderer/src/components/titleBar/visibility.ts`     | `shouldShowInAppTitleBar` 1–3                                                                               | 决定 editor 是否渲染 in-app titlebar；当前 native/non-macOS 隐藏。Concise 应显示。                                                                                                                         |
| `packages/desktop/src/renderer/src/components/titleBar/index.vue`         | template 1–110；title/menu state 164–223；CSS 263–408                                                       | Custom 标题、hamburger 菜单和窗口按钮。`div.title > span { direction: rtl }` 在 315–322，是数字/日期 bidi bug 的直接证据。标题当前 padding 142px、居中基于块布局；Concise 需要独立左右安全区和窗口级中心。 |
| `packages/desktop/src/renderer/src/pages/app.vue`                         | `<title-bar>` 3–13；props 102–135                                                                           | 把 focused document 的 pathname/filename/isSaved 和 Folder tree 传给 titlebar。                                                                                                                            |
| `packages/desktop/src/renderer/src/components/applicationShell/index.vue` | shell grid 1–76                                                                                             | title/tab/sidebar/editor/status 的总体 grid；Concise 30px 不能靠破坏其他 shell row 实现。                                                                                                                  |
| `packages/desktop/src/main/menu/templates/index.ts`                       | editor menu order 37–52                                                                                     | 非 macOS 当前顺序正是 File/Edit/Paragraph/Format/Window/Theme/View/Help；这是 Concise 顶级按钮的顺序事实源。                                                                                               |
| `packages/desktop/src/main/menu/index.ts`                                 | `windowMenus` 50–66；`addEditorMenu` 182；`getWindowMenuById` 236；`setActiveWindow` 262；更新/重建 275–340 | 每个窗口都有自己的实时 `Menu`；Concise 不能只读取全局静态模板或另造状态副本。                                                                                                                              |
| `packages/desktop/src/main/ipc/window.ts`                                 | `buildMenu` 38–69；popup handlers 112–156                                                                   | 已有 renderer descriptor popup 与整个 application menu popup。Concise 需要新增“当前窗口某个顶级 submenu” seam，或扩展现有 handler；必须从发起 `webContents` 得到窗口。                                     |
| `packages/desktop/src/preload/index.ts`                                   | `windowControlAPI` 95–109                                                                                   | renderer 安全桥当前能 popup 整个 application menu；新增能力需在 typed IPC 中声明。                                                                                                                         |
| `packages/desktop/src/shared/types/menu.ts`                               | `MenuTemplateItem` 5–20                                                                                     | renderer menu descriptor 支持 label/type/accelerator/enabled/checked/submenu，但 Electron role/click 等仍是窄接口；不要把 live app menu 粗暴序列化成丢状态副本。                                           |
| `packages/desktop/src/shared/types/ipc.ts`                                | popup channels 157–158；window control 208–214                                                              | IPC 单一契约入口。                                                                                                                                                                                         |

现有测试入口：

- `packages/desktop/test/unit/specs/titlebar-visibility.spec.ts`：Custom/Native/macOS 可见性。
- `packages/desktop/test/e2e/native-titlebar-startup.spec.ts`：Windows Native 启动与重复标题回归。
- `packages/desktop/test/e2e/shell-foundation.spec.ts`、`shell-acceptance.spec.ts`：shell/titlebar/window controls。
- `packages/desktop/test/unit/specs/application-menu-state.spec.ts`、`keybinding-menu-rebuild.spec.ts`、`menu-sanity.spec.ts`：实时菜单状态和 accelerator/rebuild。
- `packages/desktop/static/locales/*.json`、`packages/desktop/src/common/i18n.ts`、`src/main/i18n.ts`、`src/renderer/src/i18n/index.ts`：菜单和 Preferences 的本地化链。

## 3. Folder root 生命周期：main、renderer、buffer 与 watcher

### 3.1 Main 所有权

| 路径                                             | 当前符号/大致行号                                                                                     | 当前行为/风险                                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/desktop/src/main/windows/editor.ts`    | `_directoryToOpen` 56；`_openedRootDirectory` 62；`openFolder` 432–461；`openedRootDirectory` 562–564 | `openFolder` 替换旧目录 watcher、更新 `lastOpenedFolder`/recent、设置 root 并发 `mt::open-directory`。没有对应 `closeFolder`。                                           |
| 同上                                             | `_openedFiles` 63；`add/change/removeFromOpenedFiles` 466–498                                         | 文档自身 watcher 与 root watcher分开，Close Folder 必须只停 root watcher。                                                                                               |
| 同上                                             | `_restoreAllState` 604–687                                                                            | 历史 buffer shape 中仍读取 `project.rootDirectory` 并 `openFolder`；当前 V1 正常启动不读取 legacy buffer，但 Close Folder 仍需保证任何活跃/未来恢复 seam 不携带旧 root。 |
| `packages/desktop/src/main/app/index.ts`         | `openPath` 路由约 795–803                                                                             | 正常 Open Folder 会受 `openFolderInNewWindow` 影响；菜单里的 Open This Folder 明确不能走这个偏好分支。                                                                   |
| `packages/desktop/src/main/app/windowManager.ts` | watcher internal channels 421–435；opened-file channels 437–454                                       | 已有按窗口 watch/unwatch directory/file 事件，但没有 root close 协调命令。                                                                                               |

### 3.2 Watcher 与迟到事件

| 路径                                              | 当前符号/大致行号                           | 当前行为/风险                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/main/filesystem/watcher.ts` | helper `add/change/addDir/unlinkDir` 42–185 | helper 直接向窗口发 `mt::update-object-tree`，payload 没有 root identity/generation。异步 `stat/readFile` 完成后仍可能发送。                        |
| 同上                                              | `Watcher.watch` 200–367                     | chokidar handlers 257–344；局部 `disposed` 只被返回的 `closeFn` 设置。                                                                              |
| 同上                                              | `Watcher.unwatch` 369–378                   | 当前直接 `w.watcher.close()` 并删除 map，未调用 `WatcherEntry.close`，因而不会设置局部 `disposed`/清 rename timer；这是 late-event 风险的代码证据。 |
| 同上                                              | `unwatchByWindowId` 380–394                 | 同样直接 close watcher；Close Folder 不得用全窗口 unwatch，因为会误停 file watchers。                                                               |
| 同上                                              | `_shouldIgnoreEvent` 420 起                 | 只处理 file watcher 的 own-save 去重，不是 root-generation guard。                                                                                  |

实现 frontier：Close Folder 需要一个由 `EditorWindow` 主导的原子 root transition，并让 watcher 发送的目录事件携带/校验 root 身份或 watcher generation。只在 renderer 清树不能阻止 late event；只 `watcher.close()` 也不能撤销已启动的异步 helper。

### 3.3 Renderer root 状态

| 路径                                                            | 当前符号/大致行号                                                                       | 当前行为/风险                                                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/renderer/src/store/project.ts`            | `normalizeProjectRoot` 26；root/UI refs 83–95；`OPEN_PROJECT` 107–130                   | root 建为 `projectTree`；打开时处理所有 `pendingTreeEvents`，当前事件没有 root 归属检查。                                               |
| 同上                                                            | `CREATE/RESTORE_BUFFERED_STATE` 132–147                                                 | root 可进入 legacy buffered shape；恢复空状态只清 tree 和 pending events，尚无公开 Close Folder action。                                |
| 同上                                                            | `LISTEN_FOR_LOAD_PROJECT` 149–153；`LISTEN_FOR_UPDATE_PROJECT` 155–164                  | 所有目录 watcher 事件在无 tree 时进入 pending queue，正会让 close 后迟到旧事件污染未来 root。                                           |
| 同上                                                            | `activeItem/createCache/newFileNameCache/renameCache/clipboard/pendingTreeEvents` 88–95 | 都是 root-owned 或与 root UI 直接关联，Close Folder 应一次清除。                                                                        |
| `packages/desktop/src/renderer/src/store/bufferedState.ts`      | `createBufferedState` 21–40；debounce 52–56                                             | 当前 editor V1 `CREATE_BUFFERED_STATE()` 返回 null，普通 writer no-op；设计仍需明确清除 root 的持久化边界，不能假定 debounce 永远无关。 |
| `packages/desktop/src/renderer/src/store/layout.ts`             | `selectSidebarView` 181–187；`showSidebar` 189；`openProjectLayout` 约 220              | Close Folder 可复用布局 action 切 Files 并保持 visible；inline query 不应加入 `LayoutState`，因为不持久化。                             |
| `packages/desktop/src/renderer/src/components/sideBar/tree.vue` | root contextmenu 62–85、218–221；empty state 132–146                                    | root 菜单目前复用通用 sidebar menu；无 root 已有 Open Folder 空状态。                                                                   |

相关测试/可扩展入口：

- `packages/desktop/test/unit/specs/file-observation-hub.spec.ts`、`watcher-ignore-change.spec.ts`、`watcher-await-write-finish.spec.ts`：watcher 并发/异步测试风格。
- `packages/desktop/test/unit/specs/layout-state.spec.ts`、`packages/desktop/test/e2e/layout-persistence.spec.ts`：Sidebar view/visibility 持久化。
- `packages/desktop/test/e2e/workspace-startup-policy.spec.ts`：V1 不恢复普通 workspace 的启动边界；可加入“关闭 root 后重启不恢复”。
- 需要新增 main/window + watcher focused tests，以及 Close Folder Electron E2E；当前没有现成 close-root 测试。

## 4. File 主菜单与 root context menu

| 路径                                                                 | 当前符号/大致行号                                                      | 当前职责                                                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/main/menu/templates/file.ts`                   | submenu 15 起；Open Folder 40–46                                       | 新 Close Folder 应紧跟此项，无 separator，并有稳定 id 供状态同步/E2E。                                                |
| `packages/desktop/src/main/menu/actions/file.ts`                     | `openFolder` 750–761；`openFileOrFolder` 763–771；IPC commands 656–675 | File menu folder picker和 path dispatch。需增加 current-window close action和“强制本窗口 root”入口。                  |
| `packages/desktop/src/main/menu/index.ts`                            | per-window menu map 50–66；state update handlers 471 起                | root enabled 状态应更新对应 window menu，不依赖全局当前窗口推测。                                                     |
| `packages/desktop/src/renderer/src/contextMenu/sideBar/index.ts`     | `showContextMenu` 14–45                                                | 目前 root、子目录、文件共用同一 menu array。必须显式传 target kind/root identity，才能精确只给 root 加 Close Folder。 |
| `packages/desktop/src/renderer/src/contextMenu/sideBar/menuItems.ts` | factories 11–73                                                        | 增加本地化 Close Folder item factory；动作应调用共享 root close command。                                             |
| `packages/desktop/src/renderer/src/contextMenu/sideBar/actions.ts`   | bus action adapters                                                    | 现有 Sidebar 动作经 bus 到 project store；Close Folder 不应复制生命周期。                                             |
| `tree.vue` / `treeFolder.vue` / `treeFile.vue`                       | contextmenu 分别约 218、136、87                                        | 三处调用点可提供 root/folder/file 类型。                                                                              |

## 5. Tabs 与 Opened Files 的共享菜单

| 路径                                                                     | 当前符号/大致行号                                                                                       | 当前职责与 frontier                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/renderer/src/contextMenu/tabs/index.ts`            | `WorkspaceTabMenuTarget/Actions` 42–55；`createWorkspaceTabMenuItems` 91–132；`showContextMenu` 134–171 | 已有正确的 captured pane/view/document seam 和 Move/Open/Split items。这里应成为标签页与 Opened Files 唯一菜单 factory；调整组序并插入 Folder item。 |
| `packages/desktop/src/renderer/src/contextMenu/tabs/menuItems.ts`        | close/rename/path factories 13–68                                                                       | 低层 item factory，可增加 Open/Close This Folder 的展示层条目，但 root 动作应注入，不直接读全局 currentFile。                                        |
| `packages/desktop/src/renderer/src/contextMenu/tabs/actions.ts`          | bus-based legacy actions                                                                                | Rename/Copy/Show 的 legacy action桥；workspace 路径应继续捕获 target。                                                                               |
| `packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue`   | projected tabs 98–115；actions 135–288                                                                  | `handleContextMenu` 已传 `paneId/viewId/documentId/fileKey/dirty`。测试 Move/Open/Split 和 target 捕获应以此为基准。                                 |
| `packages/desktop/src/renderer/src/components/sideBar/treeOpenedTab.vue` | template 1–16；select/close 33–41                                                                       | 当前没有 contextmenu，且直接读 Pinia focused-pane facade。新增调用必须构造与 tabs 相同的 workspace target/actions，而不是复制菜单。                  |
| `packages/desktop/src/renderer/src/components/sideBar/tree.vue`          | `v-for="tab of tabs"` 53–57                                                                             | Opened Files 数据来自 `editorStore.tabs`，而 `APPLY_WORKSPACE_PROJECTION` 只投影 focused pane；因此已符合“仍只表示 focused pane”。                   |
| `packages/desktop/src/renderer/src/store/editor.ts`                      | `APPLY_WORKSPACE_PROJECTION` 315–344                                                                    | Pinia facade 每次 projection 深克隆并替换 focused tabs/currentFile；异步菜单不能稍后再读这里找 target。                                              |
| `packages/desktop/test/unit/specs/menu-workspace.spec.ts`                | 当前 menu factory tests                                                                                 | 直接扩展菜单顺序、untitled disabled、captured target、Open/Close Folder 判断。                                                                       |

路径比较优先复用 `window.fileUtils.isSamePathSync`（preload `index.ts` 140–156）或 main `common/filesystem/paths` 的 `isSamePathSync`；必须先 dirname，再与规范化 root 比较。

## 6. Sidebar 布局、tree、TOC 与搜索

### 6.1 Shell 和 Files 视觉

| 路径                                                             | 当前符号/大致行号                                        | 当前职责                                                                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/renderer/src/components/sideBar/index.vue` | navigation 7–43；content 45–54；CSS 141 起               | 当前右侧搜索图标直接选择 Search view。实现后它在 Files/Outline 上下文切换 inline filter；独立 Search view 仍由 Edit → Find in Folder 进入，不能被改造成 inline filter。 |
| `packages/desktop/src/renderer/src/components/sideBar/tree.vue`  | Opened Files 3–60；Folder tree 62–131；styles 约 290–472 | prototype A 的正式视觉主要落点；Files 内容整体需同一 12px inset，并对 empty state 保持可用。                                                                            |
| `treeFolder.vue`                                                 | row padding 6；collapse state 85–115；children 32–57     | 当前每个组件本地持有 `isCollapsed`，过滤时保存/自动展开/恢复需要显式状态 seam，不能仅裁剪 DOM。                                                                         |
| `treeFile.vue`                                                   | row padding 6；open behavior 53–65                       | basename filter 的 file leaf；当前只渲染原始 tree。                                                                                                                     |
| `treeOpenedTab.vue`                                              | padding/styles 45–87                                     | Opened Files 也必须纳入 Files 12px inset 和 inline file filter。                                                                                                        |

产品证据已核对：

- `c48bd27e` prototype A 使用 `--prototype-files-inset: 12px`，将 inset 应用于 section title、folder/file/opened rows；Opened Files 使用 `padding-bottom: 9px`、`margin-bottom: 7px`、`border-bottom: 1px solid var(--appShellVisibleDivider)`。
- `924bd80e` 仅修复 throwaway variant switcher 在既有开发态异常下的响应并加 prototype E2E，不改变 A 的视觉决策。
- 正式代码不得 cherry-pick 上述提交；不应带入 `prototypeSwitcher.vue`、query param、prototype script 或 package script。

### 6.2 Outline 与 wrap

| 路径                                                                                                                                        | 当前符号/大致行号                                        | 当前职责/问题                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/renderer/src/components/sideBar/toc.vue`                                                                              | keyed tree 1–18；`collapsedKeys` 42–77；wrap CSS 120–132 | 已有稳定 key 和用户 collapse 集合。搜索应基于同一 keyed tree 派生过滤树并暂存展开状态。wrap CSS 设置 content `white-space:normal;height:auto`，但仍需验证 Element Plus label/flex 宽度覆盖，这是设置“不起作用”的可能落点。 |
| `packages/desktop/src/renderer/src/util/tocKeys.ts`                                                                                         | `deriveKeyedToc` 21–37                                   | 为重复 heading 提供稳定 key；Outline filter/展开恢复可复用，勿改用 label 当 identity。                                                                                                                                     |
| `packages/desktop/src/renderer/src/store/editor.ts`                                                                                         | focused TOC projection 337–343；`UPDATE_TOC` 1662–1665   | Outline 数据来自 focused view；搜索只过滤展示，不应修改 controller/Pinia canonical TOC。                                                                                                                                   |
| `packages/desktop/test/e2e/toc-collapse-state-3028.spec.ts`、`toc-panel-content.spec.ts`、`toc-scroll.spec.ts`、`source-toc-scroll.spec.ts` | —                                                        | collapse、内容、程序化跳转回归入口。                                                                                                                                                                                       |

### 6.3 Inline Files/Outline filter 与既有 Search view

- `sideBar/index.vue` 当前搜索图标（32–42）会选择 `sidebarView === 'search'`；它是新 inline toggle 的视觉插入点。toggle 状态应保持为组件局部、非持久化状态，不扩展 `SidebarView`；Edit → Find in Folder 继续选择既有 Search view。
- `packages/desktop/src/renderer/src/components/sideBar/search.vue` 是正文 ripgrep Search view：`keyword` 133、root guard 165–179、ripgrep search 196–250、`findInFolder` 253–269。此文件/行为属于保留范围，不能作为 basename/heading filter 实现。
- `packages/desktop/src/shared/types/layout.ts` 当前 `SidebarView = 'files' | 'search' | 'toc'`。没有产品理由为 inline box 新增 view；保持此 union 可避免误持久化 query。
- Files filter 最适合由纯函数从 `TreeNode + focused tabs + query` 派生 view model，并以 unit tests 完整覆盖 prefix/优先级/祖先/空 term；原 `projectTree` 继续是 watcher mutation target。
- 目录“手动展开后显示原始完整内容”意味着派生 model 必须区分自动展开与用户展开，不能销毁原节点 children。
- Outline 同理从 `KeyedTocNode[]` 派生，不修改原 `toc`。

## 7. Renderer 滚动热路径

### 7.1 已确认高可信热点

```text
WYSIWYG native scroll event
  -> editor.vue scrollHandler
  -> PaneEditorEventScope.report({ scrollTop })
  -> WorkspaceController binding.report
  -> applyReport (compare/replace view.state)
  -> commit() unconditionally
  -> getProjection() clones TOC/status/warnings
  -> all controller subscribers
  -> ProjectionMirror getFacadeSnapshot()
  -> editorStore APPLY_WORKSPACE_PROJECTION deepClone x2
```

| 路径                                                                     | 符号/大致行号                                             | 证据                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue` | `scrollHandler` 2079–2082；listener 2098                  | 每个 native scroll event 先 `scope.report`，随后又调用 `editorStore.updateScrollPosition`。 |
| `packages/desktop/src/renderer/src/store/editor.ts`                      | `updateScrollPosition` 390–406                            | workspace 模式再次 `scope.report({scrollTop})`，形成同一事件的重复 report。                 |
| `packages/desktop/src/renderer/src/workspace/controller.ts`              | binding `report` 427–435                                  | 即使 `applyReport` 返回未变化，当前也无条件 `commit()`。                                    |
| 同上                                                                     | `applyReport` 1169–1205                                   | 每次构造 `nextState` 并用 `JSON.stringify` 比较；scrollTop 参与 view state。                |
| 同上                                                                     | `getProjection` 271–301；`commit` 1453–1463               | commit 递增 revision、克隆投影并通知所有 listeners。                                        |
| `workspace/projectionMirror.ts`                                          | constructor subscriber 15–21                              | 每次 controller notification 拉取完整 facade snapshot 并继续通知。                          |
| `store/editor.ts`                                                        | `APPLY_WORKSPACE_PROJECTION` 316–343                      | facade 与 projection 各做一次 deepClone/freeze，并重建 focused tabs/TOC。                   |
| `workspace/singlePaneComposition.ts`                                     | crash draft subscription 110；DocumentIO subscription 281 | controller commit 还有非 UI 订阅者；优化必须确认不会漏掉需要的真实状态变化。                |

实现应先加计数/profile 测试，再做最小改动。显而易见的候选 seam 是：消除 renderer 同一 scroll 的第二次 report；controller 仅在 `applyReport` 有变化时 commit；按 animation frame 合并仅 `scrollTop` 的高频上报并保证卸载/切 tab 时 flush 或丢弃旧 lease。最终选择以 profile/计数证据为准。

### 7.2 其他 scroll containers（必须逐一核验，不推断同根因）

- WYSIWYG `.editor-component`：`editor.vue`，CSS `overflow:auto` 约 2341。
- Source Code：`components/editorWithTabs/sourceCode.vue`，CodeMirror/outer container，CSS `overflow:auto` 约 484；切换时还保存/恢复 scroll target 约 187–233。
- Files/Outline/Search：`sideBar/index.vue` content 与 `tree.vue`/`toc.vue`/`search.vue` 的 overflow 容器。
- Preferences：`pages/preference.vue` `.pref-setting` 120–125。
- 独立 search/results、command palette、export/settings 等 renderer overlay：用 `rg 'overflow(-y)?: (auto|scroll)' packages/desktop/src/renderer/src` 建立实际清单并逐项 smoke。
- `tabs.vue` 198–209 手工把 wheel delta 映射到横向 tabs；它是标签条专用既有行为，不等于页面垂直滚动热点，除非 profile 证明需改。
- image viewer 在 `editor.vue` 517–541 拦截 wheel 做 zoom，是工具交互而非 scroll container，不应被“全局恢复原生滚动”误改。

现有测试入口：`workspace-runtime.spec.ts`、`workspace-projection-mirror.spec.ts`、`toc-scroll.spec.ts`、`source-toc-scroll.spec.ts`、`scroll-up-arrow.spec.ts`、Muya `e2e/tests/stability/perf.spec.ts`。需新增 report/commit instrumentation unit tests 和桌面人工 profile 记录。

## 8. 标题 bidi 根因与显示 seam

- 数据源 `app.vue` 115–117 直接取 `currentFile.filename/pathname`，没有数字重排。
- `titleBar/index.vue` 315–322 对整段标题容器设置 `direction: rtl`，目的是窄窗保留尾部，但 Unicode bidi 会重排数字、标点与扩展名；这是已验证根因。
- 正确 frontier 是保持内容的自然/隔离 bidi 顺序（必要时对 filename 做 bidi isolation），通过 LTR 布局、测量宽度和显式中间省略实现“扩展名/尾部可识别”，不能改 filename 字符串或磁盘路径。
- Concise 还需以整个窗口中心为坐标计算安全宽度；Custom 也必须复用同一标题格式/省略 helper，避免两种实现再次分叉。
- 应增加纯函数/DOM tests，至少覆盖 Spec 列出的 filename；E2E 需用真实窗口窄宽和 hover title 验证。

## 9. I18n、测试和构建入口

### I18n

- 主/renderer 共用 `packages/desktop/static/locales/{en,de,es,fr,ja,ko,pt,tr,zh-CN,zh-TW}.json`。
- 新增文案至少包括 Concise、Close Folder、Open/Close This Folder、Files/Outline inline placeholder/accessible label/无结果提示。
- 语法 token `file:`、`folder:` 保持英文稳定，不本地化；其周围说明/placeholder 可本地化。
- 校验入口：`packages/desktop/test/unit/specs/i18n.spec.ts`、`packages/desktop/test/e2e/i18n-shell.spec.ts`、根脚本 `pnpm minify-locales`（本票不生成/提交构建产物）。

### 自动命令

从仓库根目录运行：

```powershell
pnpm exec prettier --check docs/specs/desktop-ui-folder-navigation.md docs/wayfinder/desktop-ui-folder-navigation.md docs/tickets/desktop-ui-folder-navigation.md
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e -- <target specs>
pnpm build
```

桌面 package 的精确脚本在根 `package.json` 和 `packages/desktop/package.json`：unit 为 Vitest、E2E 为 Playwright/Electron、typecheck 为 `vue-tsc --noEmit`、build 为 `electron-vite build`。最终 E2E/打包必须从目标 HEAD 重新生成 `packages/desktop/out`，并核对 bundle/app.asar 确实包含行为提交，不能复用陈旧产物。

## 10. 风险和实现 frontier

### 当前可并行 frontier

1. **Concise + title display**：与 Folder 生命周期、inline filter、scroll 核心文件大体独立，可并行；保留 menu IPC/shared type 的独占所有权。
2. **Close Folder 生命周期**：先独占 main `editor.ts`/watcher/project/buffer/menu root seam；完成并独立复审后，Tabs/Opened Files 才接入复用动作。
3. **Sidebar 视觉 + TOC wrap**：可与上两项并行，但必须先完成对 `tree.vue/treeFolder.vue/treeFile.vue/treeOpenedTab.vue/toc.vue` 的修改并移交，inline filter 才开始修改同组文件。
4. **Scroll profile/optimization**：可独占 `editor.vue`、workspace controller/facade tests 并行；若 profile 要改 Sidebar/Preferences 文件，则先报告协调任务重新分配所有权。

### 被依赖阻塞的 frontier

- 共享 Tabs/Opened Files Folder 菜单依赖 Close Folder 的单一动作/IPC 契约。
- Inline Files/Outline filter 依赖 Sidebar 视觉/TOC wrap 票移交同一 SFC 所有权。
- 阶段集成/E2E/i18n 汇总依赖所有行为票；任何同 locale JSON 的变更都串行集成。

### 风险分级

- Folder root 持久化/watcher/concurrency：高风险，`gpt-5.6-sol`、extra high 实现与独立复审。
- 跨 workspace 菜单 target/所有权：高风险，`gpt-5.6-sol`、extra high 实现与独立复审。
- 滚动 report/commit/订阅链：高风险，`gpt-5.6-sol`、extra high 实现与独立复审。
- 普通 UI、CSS、i18n、测试、文档：`gpt-5.6-sol`、medium。
- 既有 `UPDATE_WORD_COUNT` 开发态异常是记录项；除非直接阻断本 Spec 必需验收并由协调任务升级，不纳入当前修复。

## 11. 最终集成 seam、状态和 frontier

### 11.1 已落地的事实 seam

- Titlebar：`TitleBarStyle` 已包含 `concise`；editor window 在 Windows/Linux 走 30px frameless Concise，Preferences 等辅助窗口仍走 Custom 式控件。`APPLICATION_MENU_SECTIONS` 固定顶级顺序，renderer 经 typed preload/IPC 请求 main 弹出发起窗口的实时 submenu。Custom/Concise 共享中间省略和 bidi-safe filename 显示 helper。
- Folder root：main `EditorWindow.closeFolder()` 是单一生命周期入口；目录 watcher、main root、renderer tree/root-owned caches、buffer fence和菜单状态按 generation 协调。旧 generation 事件被拒绝，replacement replay 保留新 root 事件；tabs、dirty buffers 和 file watchers 不属于 root teardown。
- Tabs/Opened Files：两处调用同一 `createWorkspaceTabMenuItems` 契约，并捕获 pane/view/document/root generation。Folder action使用同一 current-window open/close seam，不在异步回调时回读全局 current file。
- Sidebar：Files inset/divider 与 Outline wrap 已落在正式 SFC；`sidebarFilter.ts` 从 canonical tree 派生过滤投影，Files/Outline overlay state不持久化，并在 root replacement/close 时重置。独立 ripgrep Search view保持原入口和实现。
- Scroll：WYSIWYG 的 DOM scroll 仍为原生路径；`scrollReportGate.ts` 只合并报告副作用。controller 对未变化值不 commit，以 lease、mutation retry、observation epoch 和 lifecycle finalization 保护最终 scroll 所有权；其他 overflow containers 无 workspace scroll side effect，因此保持不变。

### 11.2 最终状态

- 长期集成分支为 `codex/marktext-feature-development-2026-08`；最终验收实现和 Windows 打包源均为 `cbdfdb4f36bd5bfda919ce363ca09e82ce9f1074`。
- 阶段目标 unit：14 files / 125 tests passed。
- 阶段目标 E2E：8 specs / 25 tests passed。
- startup/save/transfer 邻接 E2E：36/36 passed；i18n、Native titlebar、menu、ripgrep、TOC/Source jump 邻接项通过。
- Fresh typecheck 与 build passed；fresh bundle 的哈希和内容命中记录在验收证据文档。
- Windows x64 fresh package 的产物、哈希、签名与 smoke 结果记录在 `docs/testing/desktop-ui-folder-navigation-windows-package.md`；二进制未进入 Git。
- 全仓 lint/unit/E2E 仍有明确隔离的既有失败或 runner teardown 问题；完整命令、失败决策和人工/平台限制记录在验收证据文档，不把它们写成 Passed。
- 未发现数据丢失、旧 root 污染、wrong-pane action、scroll final-state 丢失、核心构建失败或本 Spec 核心功能不可用的直接证据。
- 用户最终人工 Acceptance：Windows Passed；Linux Untested；macOS Untested。既有自动化失败与记录项分类保持不变。

### 11.3 阶段分支与 worktree 归档

以下本轮 10 个 T01–T07 阶段分支已逐一通过 `git cherry codex/marktext-feature-development-2026-08 <stage-branch>` 核验；每个分支的 patch-unique（`+`）计数均为 0，其阶段提交均可在长期分支中找到 patch-equivalent（`-`）内容：

- T01：`codex/t01-concise-titlebar`、`codex/t01-concise-titlebar-fix`
- T02：`codex/t02-close-folder-lifecycle`
- T03：`codex/t03-shared-tab-opened-menu`、`codex/t03-folder-generation-fix`
- T04：`codex/t04-sidebar-visual-toc-wrap`
- T05：`codex/t05-sidebar-inline-search`
- T06：`codex/t06-renderer-scroll-performance`、`codex/t06-renderer-scroll-retry-fix`
- T07：`codex/t07-desktop-navigation-acceptance`

这些阶段 worktree 因而可以清理；阶段内容仍可由上述 Git 分支和长期集成分支重建。本归档不删除分支。名称相近但属于其他开发轮次的 `codex/t01-workspace-controller-session-foundation`、`codex/t03-split-workspace-tab-drag`、`codex/t05-integration-evidence` 和 `codex/t07-physical-drag-evidence` 不在本轮清理范围内。

### 11.4 剩余 frontier

1. 在 Linux/macOS 运行平台矩阵；macOS 真实确认无 Concise。两平台当前均为 Untested。
2. 仓库后续独立票据处理既有 full lint、source-image unit harness、document-integrity/layout restart runner 和 `scroll-up-arrow` 基线问题；在没有新直接证据前不把它们混入本阶段实现。
