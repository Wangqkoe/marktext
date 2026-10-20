# upstream/develop 对比报告（2026-10-19）

对比对象：当前分支 `codex/upstream-updates`（`aee778cb`）与 `upstream/develop`（`f0cf7149`，v0.22.0 之后）。本报告只做分析，没有执行任何 cherry-pick、merge 或分支改动。

## 结论

- 上游现在比本分支多 **267 个提交**（其中 10 个 merge）。待办里的"192 个"是 10 月 4 日拉取时的数字，之后上游又进了 75 个。
- 去掉内容完全相同的 15 个、以及本地改写后已挑入的 12 个，**真正没拿的是 230 个**。
- 两边分叉点是 7 月 5 日的 `v0.20.0-rc.1`。本地自那以后有 532 个自有提交，所以差异很大：在内存里试合并整个 `upstream/develop`，会有 **106 个文件冲突**。
- 230 个提交里，把每个单独应用到当前分支上试一遍：**90 个能干净应用，140 个有冲突**。冲突大多来自两种情况：依赖更早的上游提交；或者碰到了本地改过的文件（编辑器 `editor.vue`、偏好设置 schema、locale、NSIS 安装脚本、muya 的 `format.ts` / `paragraphContent` / `imageResizeBar`）。
- 建议：**先分批挑 A（数据安全）、B（Windows 路径）、C（编辑器修复）三组**，新功能（E）逐项讨论；暂时不整体合并。原因见下文"路线选择"。

## 分组概览

| 分组                          | 数量 | 可干净应用 | 有冲突 | 建议                        |
| ----------------------------- | ---: | ---------: | -----: | --------------------------- |
| A. 数据安全 / 保存 / 安全漏洞 |   13 |          9 |      4 | 优先拿                      |
| B. Windows 路径与安装         |   12 |          2 |     10 | 优先拿（你在 Windows 上用） |
| C. 编辑器（muya）行为修复     |   54 |         29 |     25 | 拿，按链条顺序              |
| D. 桌面界面与导出的小修复     |   37 |         21 |     16 | 大部分拿，挑着做            |
| E. 新功能                     |   44 |          3 |     41 | 逐项讨论                    |
| F. 翻译与语言                 |    5 |          0 |      5 | 跟随对应功能                |
| G. 结构性改动                 |   23 |          8 |     15 | 单独决定，暂缓              |
| H. 测试与 CI                  |    3 |          0 |      3 | 跟随对应修复                |
| I. 建议跳过                   |   39 |         18 |     21 | 跳过                        |

## 各组要点

### A. 数据安全 / 保存 / 安全漏洞（优先）

- `203401e9` 图片属性值做 HTML 转义（CWE-79，XSS 类漏洞）。只改几行，但和本地的 `muya/src/block/base/format.ts` 冲突 1 处，需要手工合。
- `d6e6b340` Latin-1 / Shift-JIS 编码的文件保存时保持字节不变（防止静默改坏非 UTF-8 文件）。干净。
- `548f6d92` SMB 共享盘上 rename 被拒时重试保存。干净。
- `a875f6a7` 允许直接保存到盘符根目录。干净。
- `445912a4` 没编辑过的标签页在磁盘文件变化时静默重载。和本地 e2e 冲突。
- `a21d2e82` 剪贴板图片并发上传互相覆盖、路径损坏。干净。
- `db274b56` 发布版不进入 debug 模式。干净。
- 其余：图片复制命名、同目录粘贴自动改名、粘贴位图存到 assets、进入源码模式前先落盘等。

### B. Windows 路径与安装（优先）

- 盘符 / UNC 路径在导出、PDF、链接、图片里的处理：`d0428e90`、`df879041`、`1e5ccd7e`、`be0c2f65`、`7d2250fd`、`b267efb8`、`d19370f7`、`b5641603`。
- `127c5bb3` 给渲染进程一个按平台的原生路径桥（改 27 个文件，冲突 10 个），`34ea9931` 依赖它。这两个是这一组里最重的。
- `bee2839a` 升级后保留 Windows 的 `.md` 文件关联。会和本地刚改过的 `installer.nsh`（`10432195` 替换 WMI 进程检查）冲突，需要仔细合。

### C. 编辑器（muya）修复

54 个，绝大多数是"块被删除后再操作就崩溃 / 光标跑掉 / 列表缩进错"一类的边界修复，每个都带测试。29 个能干净应用。注意有几条链必须按顺序挑：

- 图片缩放条：`6356e01b` → `9b34d724` → `ccc6b05f` → `95c6d09e`（还牵涉 `82e52019`、`1bbf0a4d`）。
- CommonMark 解析：`18c724f9`（强调符配对）和 `660a8de1`（链接目标），改动较大（+782 / +660），而本地对 `inlineRenderer` 也有改动（脚注、引用定义缓存），合入后需要跑 `test:spec` 确认符合率没有回退。
- 数学公式：`7f8de798` 是 E 组 pandoc 数学偏好链的一部分，最好和那条链一起决定。

### D. 界面与导出小修复

37 个，价值中等、风险低。冲突集中在 `titleBar/index.vue`、`sideBar/*`、主题 CSS 和 locale。

### E. 新功能（逐项讨论）

规模较大或值得讨论的：

| 功能                                                         | 提交                                                                        | 说明                                                                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Alerts（`> [!NOTE]` 提示块）                          | `51019719` `0b1af09d` `989a32c6` `89de804d`                                 | 4 个提交一条链，约 +2000 行，冲突 48 个文件次                                                                                   |
| pandoc 风格数学分隔符偏好                                    | `3e9e91c2` `75bd0093` `681ac649` `7d862bf7` `93c6ce79`（+ C 组 `7f8de798`） | 替换了原来的 math 偏好项，改偏好 schema，单个提交冲突多达 37–59 个文件；会影响已有用户设置                                      |
| `==高亮==` 语法                                              | `b3179016`                                                                  | 冲突 36 个文件                                                                                                                  |
| GitLab 行内 diff 与多行引用                                  | `c2a7f59f`                                                                  | 冲突 37 个文件                                                                                                                  |
| 有序任务列表、`~~~` 代码围栏、同行块级公式                   | `13b97380` `b29cb562` `bec5f476`                                            | muya 语法扩展                                                                                                                   |
| 图表缩放 / 平移查看器与导出图片                              | `b0079e1f`                                                                  | +3920 行，最大的单个功能                                                                                                        |
| Pandoc 任意格式导出                                          | `234a9b3f` `3d5beb10`（+ `c1ff2219`）                                       | 依赖用户本机装 pandoc                                                                                                           |
| 行内工具栏文字 / 背景色                                      | `fa265e10`                                                                  |                                                                                                                                 |
| 侧边栏：Delete 移到回收站、F2 重命名、定位当前文件、复制路径 | `0d8dba02` `638e9d9f` `48a770a9` `8cba5624`                                 | 会和本地的工作区 / 侧边栏改动冲突                                                                                               |
| 大纲：行内 markdown、高亮当前位置                            | `67ea037f` `410733e1`                                                       |                                                                                                                                 |
| 选中文本字数、源码模式行号                                   | `ba5d71df` `a28beb56`                                                       |                                                                                                                                 |
| 重置缩放                                                     | `1135cc89`                                                                  | 这是窗口级缩放（`webContents`），本地 `548c7df4` 做的是文档内容缩放。两者可以共存，但菜单和快捷键上可能让人混淆，需要定一下交互 |
| 荷兰语、俄语界面                                             | `8b2dc9ee` `4ea10e3d` `2b4db47a`                                            |                                                                                                                                 |
| 无障碍名称与图标提示                                         | `1d9222d4` `f0cf7149`                                                       | 改 40 个文件                                                                                                                    |

### G. 结构性改动（单独决定，暂缓）

- `0f11569f` **删除整个 `packages/muyajs`**（398 个文件，-57217 行）。本地 desktop 还有 4 个文件在用 `muya/lib`，要先挑 `350acd42`、`98bb858c`、`d24e48ff` 这条类型清理链，把这些引用迁走，才能删。
- `2642c838` 全工作区依赖升级（31 个文件，+4577 / -3508，主要是 `pnpm-lock.yaml`），另有 `c064b907`、`ce807d50`。锁文件冲突只能重新生成，再整体回归测试。
- `f06c683c` 上游把 `CLAUDE.md` 换成 `AGENTS.md`。本地的 `CLAUDE.md` 是你在用的，建议不跟。
- `e3dc23e2` / `49eb3d3e` 上游引入 husky + lint-staged 提交钩子。会改变本地提交流程，需要你决定。
- `187a1f9a` CI 统一按 LF 检出所有文本文件。和昨天的 `3b0dc496`（round-trip 测试夹具保持 LF）是同一类问题，值得拿。

### I. 建议跳过

版本号与发布合并（`chore(release)`、`bump develop` 等）、赞助商 / README / 网站、上游 CI 里删除 Claude 工作流、只影响 macOS 签名或 Linux arm64 打包的提交。

## 路线选择

| 路线                                | 做法                                                   | 好处                                     | 代价                                                                         |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------- |
| 1. 分批 cherry-pick（建议先走这条） | 先挑 A+B+C（约 80 个），每批跑测试后提交；E 组逐项讨论 | 风险可控，每批可审查，和你之前的流程一致 | 上游增长很快（两周 75 个），长期一直挑会越来越费力                           |
| 2. 整体合并 `v0.22.0`               | 新开分支 merge 上游 tag，一次性解决 106 个冲突文件     | 一次追平，以后同步容易                   | muyajs 删除、依赖大升级、数学偏好迁移会同时冲击本地 532 个提交，问题难以定位 |

建议先走路线 1 完成 A/B/C。做完后剩下的主要是功能和结构性改动，到时再判断要不要做一次整体合并。

## 需要你决定的问题

1. 是否同意先挑 A、B、C 三组？
2. E 组新功能里哪些想要？（尤其是 GitHub Alerts、数学偏好迁移、`==高亮==`、图表查看器这几个大的）
3. 依赖大升级和删除 muyajs，要不要列入近期计划？
4. 上游的 husky 提交钩子要不要跟？

## A/B/C 挑入结果（分支 `codex/upstream-picks-abc`）

### 概况

- 分支从 `aee778cb` 切出，共 75 个新提交：71 个上游 cherry-pick（都带 `-x` 来源行），加 4 个本地测试补丁。
- 71 个上游提交 = A/B/C 的 79 个里挑入 68 个 + 3 个 D 组前置提交（`a351c50a`、`b0cbc605`、`7ab05fff`）。
- A/B/C 里没挑的 11 个：10 个列入下方待处理清单，1 个（`d6ae9d99`）是空提交，直接跳过。
- 其后单独处理了待处理清单里的 `6402160e`（见下方"后续处理"），清单剩 9 个。
- 随后补上了 `7ab05fff` 在工作区模式下的缺口（见下方"后续处理：工作区模式下跳到其他文档的标题"）。
- 最终验证（`198baa15`）：desktop 单测 1134 条通过、6 条跳过（上游在 Windows 上有意跳过的 uploader 用例）；muya 单测 1868 条通过；desktop `typecheck`、muya `tsc --noEmit` 和 `madge --circular` 通过；改动过的 desktop 文件 eslint 无 error。
- 已知的 lint 遗留：muya eslint 5 个 error，都在这次没改动的旧代码里，挑入前就有；muya stylelint 9 个 error，其中 3 个是基线上就有的，6 个来自上游 `4d15c812` 自带的 CSS，上游最终版里同样存在。
- 没有运行 e2e，也没有打包，没有在真实应用里手工验证。

### 本地测试补丁

| 提交       | 原因                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `209ba2b7` | UNC 修复把盘符图片地址改成 `file:///C:/`，2 条本地 `imageBasePath` 测试同步改成新格式                     |
| `29360cc0` | `diagramLanguage.spec.ts` mock 掉 `loadRenderer`：真实加载 mermaid 要约 2 秒，全量并行跑时会超过 5 秒超时 |
| `5d15dda6` | 把上游 e2e helper 的 `env` 选项移植到本地 `launchElectron`（`db274b56` 的 e2e 需要）                      |
| `198baa15` | 把上游 e2e helper 的 `preferences` 选项移植到本地 `launchElectron`（`95c6d09e` 的 e2e 需要）              |

### 手工合并记录

| 上游提交                          | 冲突位置                                             | 合法                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `203401e9` CWE-79                 | `muya/.../base/format.ts`                            | import 行两边的名字都保留                                                                                                                |
| `ad6e84fa` 表格列宽               | `muya/.../blockSyntax.css`                           | 按上游最终版：`min-width: 2em` 加本地已有的 `overflow-wrap: anywhere`                                                                    |
| `1e5ccd7e` UNC 路径               | `desktop/.../watcher.ts`、`muya/.../utils/image.ts`  | 保留本地 `_watch` 结构和 `imageBasePath` 参数，加入 UNC 轮询条件和 `localPathToFileUrl`                                                  |
| `7c551772` 不区分大小写复用图片   | `move-image-to-folder.spec.ts`                       | 测试 import 保留本地 `pathe`，补上 `os`                                                                                                  |
| `8ebc3b46` 复制图片按内容哈希命名 | `desktop/.../filesystem/index.ts`、同上测试          | 只取 `copyFileWithContentHash`，不带上游顺带的 `resolveLocalLinkTarget`（属于当时还没挑的 `7ab05fff`）；测试用上游的 mock                |
| `555f3a72` 代码块语言行剪切       | `muya/.../clipboard/cut.ts`                          | 保留本地版本：本地已经和上游最终版逐行一致（之前挑入的 #5406 已包含）                                                                    |
| `6356e01b` 只从缩放条把手开始缩放 | `muya/.../imageResizeBar/index.ts`                   | 保留本地的 `renderedWidth`（文档缩放换算），上游的把手检查和 `default: return` 已自动合入                                                |
| `a351c50a`（D 组前置）            | —                                                    | `80cd55c0` 自带测试依赖它，干净应用                                                                                                      |
| `1ef2b1f1` 行内公式宽度           | `muya/.../inlineSyntax.css`                          | 保留本地 `00bed8e5` 的 `inline-flex` 基线对齐规则，上游的列宽约束已合入                                                                  |
| `b0cbc605`（D 组前置）            | —                                                    | `d197b26f` 的测试依赖它。它顺带修好了本地 `loadImageAsync` 用 `typeof === 'number'` 判断字符串、导致图片 width/height 属性从未生效的 bug |
| `7ab05fff`（D 组前置）            | `desktop/.../filesystem/index.ts`、`store/editor.ts` | 两个函数都保留；`SWITCH_TAB_BY_FILEPATH` 用上游签名加本地工作区函数体（缺口见待处理清单）                                                |
| `69f93e47` 三击选中行             | `muya/.../codeBlockContent/index.ts`                 | import 行两边合并（加 `lineBounds`）                                                                                                     |
| `9b34d724` 按按下位置缩放图片     | `muya/.../imageResizeBar/index.ts`                   | 上游从按下位置算的位移（屏幕像素）交给本地 `getRenderedScale` 换算                                                                       |
| `7fa72e78` 硬换行符号不换行       | `muya/.../inlineSyntax.css`                          | 只取 `::before` 改动；不带 `.mu-soft-newline-as-space`（属于没挑的 E 组 `322cefb2`）                                                     |
| `d6ae9d99`                        | `muya/.../index.css`、一个 e2e                       | 回滚的是没挑的 `423967a5` 的一部分，本地已经是目标状态，按空提交跳过                                                                     |
| `4d15c812` 正则 `\n` 搜索高亮     | `softLineBreak.ts`、`inlineSyntax.css`               | 取换行处的搜索高亮，不带软换行转空格功能和它的测试文件（同属 `322cefb2`）                                                                |
| `45e0516e` 原生删词后保留光标     | `muya/.../selection/dom.ts`                          | 只取 #5239 的元素锚点偏移修复；不带 #3203 的尾行判断（属于已跳过的 `14eab778`）                                                          |
| `95c6d09e` 重建文档时取消图片缩放 | `muya/.../scrollPage/index.ts`                       | 两条语句都保留，顺序按上游：先取消缩放，再执行本地的 `detachDOMEventsWithin`                                                             |

按约定直接处理的 e2e 冲突（产品代码干净，e2e 文件保留本地版本，上游那条 e2e 用例没有合入）：

| 上游提交                               | 保留本地的 e2e 文件                              |
| -------------------------------------- | ------------------------------------------------ |
| `d19370f7` 文件夹名含 # ? % 时加载图片 | `desktop/test/e2e/image-relative-path.spec.ts`   |
| `445912a4` 磁盘文件变化时静默重载      | `desktop/test/e2e/issue-1861-filechange.spec.ts` |

### 后续处理：`6402160e` 软换行后输入法输入（#5281）

在分支 `codex/trial-ime-soft-break-5281`（从本分支切出）上提交为 `312a6973`。

- 冲突原因：上游后续提交 `19faab16`（#5286，本地挑入为 `7026f927`）把零宽锚点改成插在代码块 `span.mu-trailing-break` 之前。本地先挑了它、后挑 `6402160e`，那处改动当时没有落点而被丢掉；`948c1a57` 随后把代码块测试改成"组合输入时 DOM 不变"，以适配当时的代码。
- offset：本地 `948c1a57` 只在浏览器丢掉尾行换行时补正 offset；上游统一设为 `text.length`。该分支的进入条件要求 `start.offset === text.length`，所以两者在 Chromium 上结果相同，上游写法在 Firefox 上也正确，取上游。
- 合法：`content.ts` 取上游并恢复 `19faab16` 的锚点位置，结果与上游 #5286 之后的 `content.ts` 逐字节相同；`trailingNewline.spec.ts` 恢复上游断言（锚点在尾行换行之前），另加一条"取消组合后尾行换行和文本不变"；`e2e/types.d.ts` 两边声明都保留。
- 证据：照搬上游时，Chromium e2e `codeblock-trailing-newline-5114` 的"在空末行组合输入"失败（组合出现在第 4 行，应为第 3 行）。合法后：muya 单测 1871 条通过、`tsc --noEmit` 通过；Chromium IME 相关 e2e 20 条通过；desktop 单测 1134 条通过、6 条跳过；desktop `typecheck` 通过。
- 未覆盖：Firefox / WebKit e2e；在 desktop 里用真实中文输入法手测（CDP 模拟无法复现 #3468 的"丢首键"）。

### 后续处理：工作区模式下跳到其他文档的标题

`7ab05fff` 合并时，本地分屏工作区模式下打开或切换文档的代码分支会提前 return，没有带上 `SCROLL_TO_ANCHOR`，所以 `other.md#标题` 能打开文件，但不会滚到标题。应用里工作区总是开启的，等于这项功能在实际使用中不起作用。

- 修复：`SWITCH_TAB_BY_FILEPATH` 和 `NEW_TAB_WITH_CONTENT` 的工作区分支在命令 `applied` 后调用 `SCROLL_TO_ANCHOR`。控制器在命令返回前已经同步提交了目标文档的目录，所以此时找到的是目标文档的标题。
- 证据：修复前，真实应用里点 `[cross](other.md#english-section)` 后 other.md 已经打开，目录里也有 `english-section`，但 scrollTop 仍为 0；修复后滚到 1872。新增 3 条单测（已打开 / 被拒绝 / 新打开），撤掉修复时其中 2 条失败。desktop 单测 1137 条通过、6 条跳过，`typecheck` 通过。
- e2e `issue-5292-anchor-links.spec.ts` 仍然失败，原因与本修复无关：它要求标题停在离视口顶部 20–28px，这是上游 `33777a7a`（#5153，D 组，未挑）的对齐方式；本地目前是 `STANDAR_Y = 320` 的旧算法，标题停在约 264px。"已打开"那条用例还卡在启动时传入两个文件只出现一个标签。

### e2e 结果（`0a4dd316`）

全量 Chromium e2e：446 条用例，413 条通过，22 条失败，11 条跳过（28.7 分钟）。重跑失败的 spec 后剩 21 条稳定失败，`audit-tabs-restart`、`shell-acceptance` 属于偶发失败。和挑入前的基线 `aee778cb` 对比（同一批 spec，依赖完全相同）：

| 归类                      | 用例                                                                                                   | 结论                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基线上同样失败            | `audit-document-integrity:146`、`external-reload-undo:86/109`、`list-indent:96/172`、`scroll-up-arrow` | 挑入前就存在；前三条都是磁盘上的外部修改没有触发提示或重新载入                                                                                                                                              |
| 新 spec，与上面同一个问题 | `issue-3652-auto-reload` 2 条、`issue-5394-image-resize-reload` 3 条                                   | 都依赖外部修改后重新载入，表现与基线的外部重载失败一致                                                                                                                                                      |
| 新 spec，依赖未挑的提交   | `issue-5292-anchor-links` 3 条                                                                         | 见上一节：需要 `33777a7a`                                                                                                                                                                                   |
| 新 spec，关闭应用超时     | `issue-5344-image-content-hash`、`source-mode-flush`                                                   | 用例本身的断言没失败，afterAll 关闭应用超过 30 秒；未查                                                                                                                                                     |
| 已修正的测试              | `find-replace:462`                                                                                     | bisect 定位到 `29d12f5f`。它修正了元素锚点的偏移后，打开查找栏会预填整段选中文字（以前误读成第一个字符），整段也是"1 / 1"，测试在 needleAlpha 的防抖搜索执行前就按了 Escape。改为等高亮文字变成 needleAlpha |
| 已修正的测试              | `image-relative-path` 3 条                                                                             | `1e5ccd7e` 把盘符路径改成标准的 `file:///C:/` 格式（单测已在 `209ba2b7` 同步），e2e 期望改用 `pathToFileURL` / `fileURLToPath`                                                                              |
| 偶发，与挑入无关          | `workspace-transfer-target-window-close`                                                               | 单独连跑 8 次全部通过，去掉 `0a4dd316` 后也通过；两次失败都发生在紧跟着关闭超时的 `source-mode-flush` 之后                                                                                                  |

### 待处理清单

| 上游提交                                                                                    | 原因                                                                                                                                                                                                                                                              | 计划                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `18c724f9`、`660a8de1` CommonMark 强调符 / 链接目标解析                                     | `lexer.ts` 和本地的 `latexMathDelimiters` 实现大面积冲突；上游代码已经接入 E 组的 pandoc 数学偏好                                                                                                                                                                 | 决定 E 组 pandoc 数学偏好链时一起处理 |
| `bee2839a` 升级后保留 `.md` 关联（#4966）                                                   | NSIS 安装脚本冲突。试合方案：保留本地的 include 保护和环境恢复，关联改成无条件执行，上游的宏移进保护块；上游的 `windows-file-association.spec.ts` 断言 customInstall 里没有任何 MessageBox，要收窄到"关联弹窗"，因为本地的环境恢复失败分支本来就有一个 MessageBox | 配合打包、安装、再升级一次来验证      |
| `14eab778` 软换行尾行的方向键导航（#3203）                                                  | 和本地 RTL、#3520、#3193 三处方向键修复冲突；还依赖 E 组没挑的 `b8f5e0fb`（跨块保持光标列）                                                                                                                                                                       | 决定 `b8f5e0fb` 时一起处理            |
| `ad1e1cfd` 全量重渲染后保留搜索高亮                                                         | 冲突在 `editor.vue`、搜索栏 `index.vue`（点击搜索栏时是否清空、上一个的接口叫 `prev` 还是 `previous`）、muya `search/index.ts`、`.vscode/settings.json`                                                                                                           | 单独研究                              |
| `34ea9931`、`127c5bb3`、`d0428e90` Windows 路径分隔符 / 原生路径桥接 / 导出中的盘符图片路径 | 依赖没挑的 E 组 `0d8dba02`（Delete 键移到回收站），三者之间也互相依赖；`127c5bb3` 还改了 `package.json` 和锁文件                                                                                                                                                  | 和侧边栏功能一起决定                  |
| `b6a88236` macOS ⌘↑/⌘↓ 文档导航                                                             | 和本地 `content.ts` 的方向键处理冲突；只影响 macOS，在 Windows 上价值低                                                                                                                                                                                           | 暂不处理                              |

## 方法与证据边界

- 已挑入的判断：`git log --cherry-mark`（内容相同）+ 本地提交信息里的 `cherry picked from commit`。本地改写过且没写这行、也没保留原 PR 号的挑入，可能没被识别出来。
- "单独应用"是用 `git merge-tree --merge-base=<c>^ HEAD <c>` 把每个提交单独套到当前分支上。没有考虑上游提交之间的先后依赖，所以按顺序挑时，实际冲突可能比表里少（前置提交已挑入），也可能更多。
- "106 个冲突文件"来自 `git merge-tree --write-tree HEAD upstream/develop`。
- 没有实际运行任何上游提交的代码，价值判断依据的是提交标题、改动规模和涉及的文件。

## 附表：230 个未挑提交

#### A. 数据安全 / 保存 / 安全漏洞（13 个）

| 日期       | 提交       | 单独应用      | 改动规模     | 标题                                                                                        |
| ---------- | ---------- | ------------- | ------------ | ------------------------------------------------------------------------------------------- |
| 2026-09-01 | `a875f6a7` | 干净          | 0 文件 +0/-0 | fix(desktop): allow saving directly to a drive root (#5150) (#5188)                         |
| 2026-09-02 | `203401e9` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): escape HTML in image attribute values (CWE-79) (#4980)                           |
| 2026-09-02 | `9b435609` | 干净          | 0 文件 +0/-0 | fix: allow copy-paste in same folder with auto-rename (#5139)                               |
| 2026-09-03 | `e219a2b1` | 干净          | 0 文件 +0/-0 | fix: #5001 persist pasted bitmap images to the assets folder per preferences (#5168)        |
| 2026-09-11 | `3ed697b8` | 干净          | 0 文件 +0/-0 | fix(desktop): flush pending edits before entering source code mode (#5103)                  |
| 2026-09-13 | `34e12fc9` | 干净          | 0 文件 +0/-0 | fix(desktop): ignore line-ending menu updates for a closed window (#4923) (#5319)           |
| 2026-09-14 | `8ebc3b46` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(desktop): name copied images after their content, not their path (#5344) (#5346)        |
| 2026-09-14 | `7c551772` | 冲突 1 个文件 | 0 文件 +0/-0 | fix: reuse image on case-insensitive path match (#3119) (#5326)                             |
| 2026-09-16 | `db274b56` | 干净          | 0 文件 +0/-0 | fix(desktop): keep debug mode out of release builds (#5407) (#5410)                         |
| 2026-09-21 | `445912a4` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(desktop): reload an unedited tab silently when its file changes on disk (#3652) (#5479) |
| 2026-09-23 | `548f6d92` | 干净          | 0 文件 +0/-0 | fix(desktop): retry a save whose rename an SMB share refused (#5322) (#5520)                |
| 2026-09-23 | `a21d2e82` | 干净          | 0 文件 +0/-0 | fix(desktop): stop clipboard image uploads clobbering each other and mangling paths (#5512) |
| 2026-10-08 | `d6e6b340` | 干净          | 0 文件 +0/-0 | fix(desktop): keep Latin-1 and Shift-JIS files byte-exact on save (#5577) (#5567)           |

#### B. Windows 路径与安装（你在 Windows 上用，相关性高）（12 个）

| 日期       | 提交       | 单独应用       | 改动规模     | 标题                                                                                         |
| ---------- | ---------- | -------------- | ------------ | -------------------------------------------------------------------------------------------- |
| 2026-07-06 | `43bd8b77` | 干净           | 0 文件 +0/-0 | fix(desktop): preserve RTL text direction in PDF and print export (#4874)                    |
| 2026-09-02 | `1e5ccd7e` | 冲突 2 个文件  | 0 文件 +0/-0 | fix: handle UNC image paths and watchers (#4778)                                             |
| 2026-09-11 | `d19370f7` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(muya): load relative images from folders named with #, ? or % (#5302) (#5301)            |
| 2026-09-14 | `be0c2f65` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(desktop): keep the share host in exported links from UNC documents (#5336) (#5338)       |
| 2026-09-14 | `7d2250fd` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(desktop): keep exported images working from folders named with #, ? or % (#5335) (#5337) |
| 2026-09-14 | `b267efb8` | 干净           | 0 文件 +0/-0 | fix(desktop): keep exported links working from folders named with #, ? or % (#5320)          |
| 2026-09-22 | `b5641603` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(desktop): resolve local link paths without decoding the document folder (#5506)          |
| 2026-09-30 | `bee2839a` | 冲突 1 个文件  | 0 文件 +0/-0 | fix(build): keep the Windows Markdown association across updates (#4966) (#5463)             |
| 2026-10-10 | `34ea9931` | 冲突 7 个文件  | 0 文件 +0/-0 | fix(desktop): compare sidebar and tab paths across separator styles (#5683) (#5689)          |
| 2026-10-11 | `127c5bb3` | 冲突 10 个文件 | 0 文件 +0/-0 | fix(desktop): give the renderer a platform-native path bridge (#5683, #5669) (#5691)         |
| 2026-10-12 | `df879041` | 冲突 1 个文件  | 0 文件 +0/-0 | fix: restore Windows image paths in PDF export (#5714) (#5716)                               |
| 2026-10-15 | `d0428e90` | 冲突 9 个文件  | 0 文件 +0/-0 | fix: preserve Windows drive image paths in export (#3323) (#5732)                            |

#### C. 编辑器（muya）行为修复（54 个）

| 日期       | 提交       | 单独应用      | 改动规模     | 标题                                                                                                    |
| ---------- | ---------- | ------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | `ad6e84fa` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): size table columns to their content (#4894) (#4952)                                          |
| 2026-09-02 | `6b898602` | 干净          | 0 文件 +0/-0 | fix(ui): sync quick insert highlight with input method (#5176)                                          |
| 2026-09-03 | `3ee675ba` | 干净          | 0 文件 +0/-0 | fix(content): preserve cursor on IME composition backspace (#4957)                                      |
| 2026-09-10 | `f8d33392` | 干净          | 0 文件 +0/-0 | fix(muya): end the paragraph on a Shift+Enter that would leave an empty line (#5300)                    |
| 2026-09-10 | `cc30ea61` | 干净          | 0 文件 +0/-0 | fix(muya): don't restore a drag selection onto removed blocks (#4981, #5256) (#5290)                    |
| 2026-09-10 | `bc3e487a` | 干净          | 0 文件 +0/-0 | fix(muya): number empty lines in code blocks (#5294) (#5295)                                            |
| 2026-09-10 | `7745f7d8` | 干净          | 0 文件 +0/-0 | fix(muya): drop an image selection whose block left the document (#5055) (#5291)                        |
| 2026-09-10 | `eccdb439` | 干净          | 0 文件 +0/-0 | fix(muya): ignore a quick-insert pick once its paragraph is gone (#5213) (#5289)                        |
| 2026-09-10 | `1bbf0a4d` | 干净          | 0 文件 +0/-0 | fix(muya): keep the image resize bar from crashing after its image is removed (#5216) (#5288)           |
| 2026-09-10 | `d7cda0d6` | 干净          | 0 文件 +0/-0 | fix(muya): skip search matches whose block left the document (#5163, #5215) (#5287)                     |
| 2026-09-10 | `d1a0b2fe` | 干净          | 0 文件 +0/-0 | fix(muya): keep footnote reference ids intact for special identifiers (#5208) (#5285)                   |
| 2026-09-10 | `af1ded13` | 干净          | 0 文件 +0/-0 | fix(muya): stop the quick-insert hint claiming a line of its own (#5283)                                |
| 2026-09-10 | `6402160e` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): keep IME input intact after a soft line break (#5281)                                        |
| 2026-09-11 | `39c36e02` | 干净          | 0 文件 +0/-0 | fix(muya): make a code block a diagram when its language is a diagram language (#5060) (#5304)          |
| 2026-09-14 | `e7dfe302` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): keep the ordered list markers of unchanged lists (#4772) (#4776)                             |
| 2026-09-14 | `4e354c0c` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): keep a Tab-indented list item out of a sublist of the other kind (#5349) (#5354)             |
| 2026-09-14 | `c2d150fd` | 干净          | 0 文件 +0/-0 | fix(muya): edit a footnote definition as its own container (#5340, #5343) (#5347)                       |
| 2026-09-14 | `80cd55c0` | 干净          | 0 文件 +0/-0 | fix(muya): split the list when outdenting a task item into a plain list (#5341) (#5348)                 |
| 2026-09-14 | `991cabd0` | 干净          | 0 文件 +0/-0 | fix(muya): only outdent a paragraph that sits in a nested list item (#5342) (#5345)                     |
| 2026-09-14 | `2164c584` | 干净          | 0 文件 +0/-0 | fix(muya): keep the link popover open when moving between links (#5313) (#5324)                         |
| 2026-09-15 | `555f3a72` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): collapse only the nested code block when a cut starts in its language line (#5368) (#5370)   |
| 2026-09-15 | `8bcb1e08` | 干净          | 0 文件 +0/-0 | fix(muya): keep a setext heading's level when promoting or demoting it (#5362) (#5363)                  |
| 2026-09-15 | `bff36d7c` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): change the heading level of the caret's paragraph, not its list (#5360) (#5361)              |
| 2026-09-15 | `a978bf35` | 干净          | 0 文件 +0/-0 | fix(muya): run paragraph commands on the whole table or code block (#4944) (#5358)                      |
| 2026-09-16 | `73b90a79` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): keep the rest of a blockquote quoted on forward-Delete merge (#5423) (#5424)                 |
| 2026-09-16 | `86667de2` | 干净          | 0 文件 +0/-0 | fix(muya): keep blocks after a paragraph merged into a table cell out of the row (#5386) (#5422)        |
| 2026-09-16 | `915cfa1e` | 干净          | 0 文件 +0/-0 | fix(muya): re-read the block type after a Backspace on a syntax marker (#5388) (#5421)                  |
| 2026-09-16 | `2a0ad6c2` | 干净          | 0 文件 +0/-0 | fix(muya): keep an inline raw HTML tag's id intact (#5416)                                              |
| 2026-09-16 | `5734f01d` | 干净          | 0 文件 +0/-0 | fix(muya): cancel Backspace that turns a setext heading into a paragraph (#5035)                        |
| 2026-09-16 | `83b2685a` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): don't crash or replace another block when picking a table size after undo (#5355)            |
| 2026-09-16 | `6356e01b` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): start an image resize only from the resize bar's own handles (#5116)                         |
| 2026-09-17 | `de6c2fff` | 干净          | 0 文件 +0/-0 | fix(muya): select the document when Select All's cached caret block was removed by undo (#5387) (#5425) |
| 2026-09-18 | `a3e4a64f` | 干净          | 0 文件 +0/-0 | fix(muya): ignore a table tool click once its table left the document (#5442) (#5443)                   |
| 2026-09-20 | `2ec36d3e` | 干净          | 0 文件 +0/-0 | fix(muya): give every mermaid render its own id (#5023) (#5465)                                         |
| 2026-09-20 | `1ef2b1f1` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): bound inline math by the text column, not by its own box (#5034) (#5466)                     |
| 2026-09-20 | `d197b26f` | 干净          | 0 文件 +0/-0 | fix(muya): render SVG images that state no size of their own (#4991) (#5462)                            |
| 2026-09-21 | `9449bf73` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): show the text cursor over the whole editable column (#5477) (#5478)                          |
| 2026-09-23 | `978d71df` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): cut a cross-block selection from beforeinput too (#5415) (#5536)                             |
| 2026-09-23 | `9b34d724` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): size an image from where its resize handle was grabbed (#5392) (#5535)                       |
| 2026-09-23 | `ccc6b05f` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): keep an image resize released outside the window (#5393) (#5537)                             |
| 2026-09-23 | `82e52019` | 干净          | 0 文件 +0/-0 | fix(muya): take the image references from the live DOM after selecting (#5391) (#5534)                  |
| 2026-09-23 | `69f93e47` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): select the clicked line ourselves on a triple-click (#5389) (#5524)                          |
| 2026-09-25 | `d6ae9d99` | 冲突 2 个文件 | 0 文件 +0/-0 | revert: keep grayscale antialiasing on editor text (#5539) (#5558)                                      |
| 2026-09-25 | `7fa72e78` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): keep a hard line break's glyph on the line it ends (#2094) (#5556)                           |
| 2026-09-26 | `660a8de1` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): parse link destinations the way CommonMark does (#2377) (#5562)                              |
| 2026-09-26 | `18c724f9` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): pair emphasis delimiters the way CommonMark does (#2086) (#5555)                             |
| 2026-09-30 | `d36cdd1b` | 干净          | 0 文件 +0/-0 | fix(muya): keep the table column toolbar anchored while hovering it (#5574) (#5592)                     |
| 2026-10-06 | `c054632f` | 干净          | 0 文件 +0/-0 | fix(muya): restore inline HTML tag marker style and hide bare <br/> markers (#5636)                     |
| 2026-10-07 | `14eab778` | 冲突 5 个文件 | 0 文件 +0/-0 | fix(muya): make the trailing soft-break line navigable with the arrows (#3203) (#5645)                  |
| 2026-10-08 | `45e0516e` | 冲突 2 个文件 | 0 文件 +0/-0 | fix(muya): keep the caret after a native word/line delete, and defer in code blocks (#5239) (#5658)     |
| 2026-10-08 | `ad1e1cfd` | 冲突 4 个文件 | 0 文件 +0/-0 | fix(muya): keep the search highlight across a full re-render (#5651) (#5652)                            |
| 2026-10-08 | `4d15c812` | 冲突 3 个文件 | 0 文件 +0/-0 | fix(muya): highlight regexp newline search matches (#3261) (#5650)                                      |
| 2026-10-12 | `95c6d09e` | 冲突 3 个文件 | 0 文件 +0/-0 | fix(muya): cancel image resize when the document rebuilds (#5394) (#5721)                               |
| 2026-10-16 | `b6a88236` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(muya): leave macOS ⌘↑/⌘↓ to the browser for document navigation (#3452) (#5766)                     |

#### D. 桌面界面与导出的小修复（37 个）

| 日期       | 提交       | 单独应用      | 改动规模     | 标题                                                                                          |
| ---------- | ---------- | ------------- | ------------ | --------------------------------------------------------------------------------------------- |
| 2026-07-05 | `5de5df43` | 干净          | 0 文件 +0/-0 | fix: preserve Google Docs CSS formatting on paste (#4699)                                     |
| 2026-09-01 | `48762db9` | 干净          | 0 文件 +0/-0 | preserve viewport when toggling task-list checkbox (#5189)                                    |
| 2026-09-06 | `8763c35f` | 干净          | 0 文件 +0/-0 | fix: #4890 give markdown files the markdown icon regardless of name prefix (#4910)            |
| 2026-09-07 | `33777a7a` | 干净          | 0 文件 +0/-0 | fix: align TOC headings with editor viewport (#5153)                                          |
| 2026-09-07 | `40f88e53` | 冲突 1 个文件 | 0 文件 +0/-0 | fix: render rect selection in table (#5265)                                                   |
| 2026-09-07 | `b0cbc605` | 干净          | 0 文件 +0/-0 | fix: init image size when render html tag image (#5264)                                       |
| 2026-09-11 | `7ab05fff` | 冲突 1 个文件 | 0 文件 +0/-0 | fix: make anchor links reach CJK headings and headings in other documents (#5292) (#5298)     |
| 2026-09-14 | `a351c50a` | 干净          | 0 文件 +0/-0 | fix: #4899 keep trailing content out of the child list when outdenting (#4913)                |
| 2026-09-14 | `bd70d0b1` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(desktop): explain the max width format in preferences (#5331) (#5334)                     |
| 2026-09-17 | `5f232764` | 干净          | 0 文件 +0/-0 | fix(desktop): open Quick Open when files are open without a folder (#5430) (#5431)            |
| 2026-09-18 | `965705ad` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(desktop): keep title bar path segments in order under the Bidi algorithm (#5317)          |
| 2026-09-19 | `5294c709` | 干净          | 0 文件 +0/-0 | fix(desktop): restore treePathExcludePatterns filtering in the sidebar tree (#5159) (#5461)   |
| 2026-09-20 | `8ff36bcc` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(desktop): put the unsaved dot back on the left of the title bar path (#5467) (#5468)      |
| 2026-09-20 | `6c2522f3` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(desktop): require deliberate movement before a tab click becomes a drag (#4895) (#5464)   |
| 2026-09-21 | `d701114c` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(desktop): make source mode math highlighting follow the editor (#5483) (#5484)            |
| 2026-09-21 | `0cd8b5f7` | 干净          | 0 文件 +0/-0 | fix(desktop): theme the table of contents text and arrows (#5094) (#5486)                     |
| 2026-09-22 | `27ab50ba` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(desktop): keep the outline title in place, and make its word-wrap preference work (#5514) |
| 2026-09-24 | `2b3701f8` | 干净          | 0 文件 +0/-0 | fix: keep the export render container out of the page layout (#5541) (#5542)                  |
| 2026-09-25 | `423967a5` | 干净          | 0 文件 +0/-0 | fix: restore code block legibility and text crispness (#5539) (#5553)                         |
| 2026-09-30 | `6f8524af` | 冲突 2 个文件 | 0 文件 +0/-0 | fix: #5575 restore column handle menu (#5589)                                                 |
| 2026-10-01 | `9bae3942` | 干净          | 0 文件 +0/-0 | fix(build): unify the app name to MarkText (#5202) (#5598)                                    |
| 2026-10-02 | `af3ace55` | 干净          | 0 文件 +0/-0 | fix(desktop): fix hover class for select-dropdown items (#5603)                               |
| 2026-10-06 | `ceda0f45` | 干净          | 0 文件 +0/-0 | fix(desktop): remove applied custom CSS when the preference is cleared (#5633)                |
| 2026-10-07 | `20ae0b90` | 冲突 4 个文件 | 0 文件 +0/-0 | fix: #3207 #3385 commit sidebar rename/create when clicking away (#5646)                      |
| 2026-10-08 | `38a75632` | 冲突 2 个文件 | 0 文件 +0/-0 | fix: #5239 let Ctrl+Backspace delete a word at the end of a line (#5657)                      |
| 2026-10-08 | `65bcec65` | 冲突 2 个文件 | 0 文件 +0/-0 | fix: #5631 persist sidebar folder collapse state across view switches (#5632)                 |
| 2026-10-09 | `f6c61bb7` | 干净          | 0 文件 +0/-0 | fix(desktop): wait for the typed find query before Escape in e2e (#5665)                      |
| 2026-10-11 | `761afaf2` | 干净          | 0 文件 +0/-0 | fix: keep paragraph menu inside the window (#5711)                                            |
| 2026-10-11 | `db4b1fef` | 干净          | 0 文件 +0/-0 | fix: preserve literal $< in HTML export (#5701)                                               |
| 2026-10-11 | `fbdff9ce` | 干净          | 0 文件 +0/-0 | fix: align rectangular task markers with text (#5700)                                         |
| 2026-10-12 | `b7e0124e` | 冲突 4 个文件 | 0 文件 +0/-0 | fix: #5327 render music notation with bundled font fallbacks (#5722)                          |
| 2026-10-12 | `9024ec0f` | 冲突 2 个文件 | 0 文件 +0/-0 | fix: improve task list marker contrast (#5684) (#5720)                                        |
| 2026-10-12 | `8e57365e` | 冲突 1 个文件 | 0 文件 +0/-0 | fix: include the application name in the window title (#5719)                                 |
| 2026-10-14 | `4be8a06f` | 干净          | 0 文件 +0/-0 | fix: keep typewriter scrolling stable at wrapped line starts (#3510) (#5747)                  |
| 2026-10-14 | `a52595f5` | 冲突 3 个文件 | 0 文件 +0/-0 | fix: clarify export table of contents settings (#3504) (#5746)                                |
| 2026-10-14 | `54755cc4` | 干净          | 0 文件 +0/-0 | fix(desktop): keep $ patterns in headings out of the exported TOC (#5742)                     |
| 2026-10-16 | `45b2cedb` | 干净          | 0 文件 +0/-0 | fix: #5753 preserve list contents when copying backward selections (#5760)                    |

#### E. 新功能（44 个）

| 日期       | 提交       | 单独应用       | 改动规模     | 标题                                                                                               |
| ---------- | ---------- | -------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| 2026-09-02 | `8b2dc9ee` | 干净           | 0 文件 +0/-0 | feat(i18n): add Dutch locale + validation tests + fix existing issues (#5137)                      |
| 2026-09-04 | `1135cc89` | 干净           | 0 文件 +0/-0 | feat(desktop): add reset zoom (#5185)                                                              |
| 2026-09-07 | `47f1c576` | 干净           | 0 文件 +0/-0 | feat(macOS): add Dictionary lookup for selected editor text (#4814)                                |
| 2026-09-09 | `322cefb2` | 冲突 2 个文件  | 0 文件 +0/-0 | feat: add 'Treat soft newlines as spaces' preference (#1849) (#4937)                               |
| 2026-09-15 | `bec5f476` | 冲突 4 个文件  | 0 文件 +0/-0 | feat(muya): support same-line display math (#4904, #5364, #5365) (#4935)                           |
| 2026-09-15 | `a28beb56` | 冲突 3 个文件  | 0 文件 +0/-0 | feat(desktop): number every source code line and add a line numbers preference (#4033) (#5111)     |
| 2026-09-18 | `7f8de798` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(muya): apply pandoc's tex_math_dollars constraints to `$…$` (#5446) (#5449)                    |
| 2026-09-19 | `ba5d71df` | 冲突 5 个文件  | 0 文件 +0/-0 | feat: show selected text word count (#4457)                                                        |
| 2026-09-19 | `75bd0093` | 冲突 59 个文件 | 0 文件 +0/-0 | feat: implement pandoc's tex_math_gfm, replacing the GitLab compatibility option (#5446) (#5457)   |
| 2026-09-19 | `3e9e91c2` | 冲突 37 个文件 | 0 文件 +0/-0 | feat: add the texMathDollars preference, replacing the math option (#5446) (#5450)                 |
| 2026-09-21 | `234a9b3f` | 冲突 3 个文件  | 0 文件 +0/-0 | feat(export): convert Markdown to arbitrary formats via Pandoc (#3917) (#5379)                     |
| 2026-09-21 | `7d862bf7` | 冲突 12 个文件 | 0 文件 +0/-0 | fix(desktop): tell the two backslash math preferences apart in the UI (#5481) (#5485)              |
| 2026-09-21 | `681ac649` | 冲突 58 个文件 | 0 文件 +0/-0 | feat: support pandoc's backslash TeX math delimiters (#5446) (#5481)                               |
| 2026-09-22 | `410733e1` | 冲突 4 个文件  | 0 文件 +0/-0 | feat(desktop): highlight the outline entry the cursor is in (#4345)                                |
| 2026-09-22 | `2b4db47a` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(i18n): give Dutch users the Dutch editor UI, and hold the language registries together (#5502) |
| 2026-09-22 | `4ea10e3d` | 冲突 6 个文件  | 0 文件 +0/-0 | feat(i18n): add Russian (ru) localization (#5496)                                                  |
| 2026-09-23 | `c1ff2219` | 冲突 8 个文件  | 0 文件 +0/-0 | fix(desktop): find pandoc the same way the uploader finds picgo (#2751) (#5525)                    |
| 2026-09-23 | `051d95d2` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(desktop): find the uploader the user installed, wherever they installed it (#5518) (#5519)     |
| 2026-09-26 | `b0079e1f` | 冲突 7 个文件  | 0 文件 +0/-0 | Add a zoom/pan viewer and image export for rendered diagrams (#5554)                               |
| 2026-09-28 | `34b5c283` | 冲突 2 个文件  | 0 文件 +0/-0 | fix: give the editor and Preferences windows their own menu bar (#2245) (#5560)                    |
| 2026-09-30 | `93c6ce79` | 冲突 7 个文件  | 0 文件 +0/-0 | fix(desktop): match the pandoc reader to the Markdown math preferences (#5566)                     |
| 2026-10-01 | `13b97380` | 冲突 5 个文件  | 0 文件 +0/-0 | feat(muya): support ordered task lists (#1691) (#5597)                                             |
| 2026-10-02 | `b29cb562` | 冲突 4 个文件  | 0 文件 +0/-0 | feat(muya): support tilde code fences (#1788) (#5600)                                              |
| 2026-10-04 | `0d8dba02` | 冲突 9 个文件  | 0 文件 +0/-0 | feat(desktop): move sidebar selection to trash with Delete key (#5609)                             |
| 2026-10-07 | `67ea037f` | 冲突 6 个文件  | 0 文件 +0/-0 | feat: render inline markdown in the TOC (#3110) (#5648)                                            |
| 2026-10-07 | `b3179016` | 冲突 36 个文件 | 0 文件 +0/-0 | feat: support ==highlight== markdown syntax (#2552) (#5647)                                        |
| 2026-10-07 | `b8f5e0fb` | 冲突 1 个文件  | 0 文件 +0/-0 | feat(muya): preserve caret column on cross-block arrow navigation (#3412) (#5644)                  |
| 2026-10-07 | `638e9d9f` | 冲突 6 个文件  | 0 文件 +0/-0 | feat(desktop): rename sidebar selection with F2 / Enter (#5638)                                    |
| 2026-10-08 | `fa265e10` | 冲突 3 个文件  | 0 文件 +0/-0 | feat(muya): text & background colour in the inline format toolbar (#5661)                          |
| 2026-10-08 | `3d5beb10` | 冲突 12 个文件 | 0 文件 +0/-0 | feat(menu): move Pandoc conversion out of Export and gate it behind a preference (#5513)           |
| 2026-10-08 | `48a770a9` | 冲突 16 个文件 | 0 文件 +0/-0 | feat(desktop): reveal the active file in the sidebar file tree (#528) (#5654)                      |
| 2026-10-08 | `c2a7f59f` | 冲突 37 个文件 | 0 文件 +0/-0 | feat: support GitLab inline diff and multiline blockquote (#954) (#5649)                           |
| 2026-10-10 | `8cba5624` | 冲突 5 个文件  | 0 文件 +0/-0 | feat(desktop): add Copy Path to the sidebar tree context menu (#5692)                              |
| 2026-10-14 | `4beaff47` | 冲突 2 个文件  | 0 文件 +0/-0 | feat(desktop): reorganize theme settings and filter system theme choices (#5737)                   |
| 2026-10-15 | `0cda3255` | 冲突 1 个文件  | 0 文件 +0/-0 | fix: #2029 preserve selected text when pasting a URL (#5755)                                       |
| 2026-10-15 | `d4aa7f16` | 冲突 3 个文件  | 0 文件 +0/-0 | fix: #5757 restore pasted URL page titles through host transport (#5756)                           |
| 2026-10-16 | `ccc16342` | 冲突 4 个文件  | 0 文件 +0/-0 | fix: #2143 open missing CLI files as named buffers (#5758)                                         |
| 2026-10-17 | `89de804d` | 冲突 8 个文件  | 0 文件 +0/-0 | feat: add GitHub Alerts creation and conversion menus (#5771)                                      |
| 2026-10-17 | `989a32c6` | 冲突 22 个文件 | 0 文件 +0/-0 | feat: expose GitHub Alerts settings and desktop exports (#5776)                                    |
| 2026-10-17 | `0b1af09d` | 冲突 11 个文件 | 0 文件 +0/-0 | feat: add GitHub Alert blocks and editor behavior (#5775)                                          |
| 2026-10-17 | `51019719` | 冲突 7 个文件  | 0 文件 +0/-0 | feat: add GitHub Alerts syntax and format conversion (#5774)                                       |
| 2026-10-18 | `f0cf7149` | 冲突 2 个文件  | 0 文件 +0/-0 | fix: #4997 theme icon tooltips and delay hover hints (#5788)                                       |
| 2026-10-18 | `1d9222d4` | 冲突 10 个文件 | 0 文件 +0/-0 | fix: #4997 give icon-only controls accessible names (#5739)                                        |
| 2026-10-18 | `15666c83` | 冲突 15 个文件 | 0 文件 +0/-0 | fix: unify inline and block code font families (#5783)                                             |

#### F. 翻译与语言（5 个）

| 日期       | 提交       | 单独应用      | 改动规模     | 标题                                                         |
| ---------- | ---------- | ------------- | ------------ | ------------------------------------------------------------ |
| 2026-09-02 | `1e1779ee` | 冲突 1 个文件 | 0 文件 +0/-0 | Japanese translation update (#5049)                          |
| 2026-09-07 | `ae9ee944` | 冲突 1 个文件 | 0 文件 +0/-0 | fix: the missing locale key (#5266)                          |
| 2026-09-07 | `89d69887` | 冲突 1 个文件 | 0 文件 +0/-0 | fix(i18n): add the missing Dutch resetZoom label (#5245)     |
| 2026-09-22 | `596d1ca5` | 冲突 2 个文件 | 0 文件 +0/-0 | i18n: improve Russian localization wording (#5507)           |
| 2026-10-06 | `9100cb60` | 冲突 1 个文件 | 0 文件 +0/-0 | Update Japanese localization strings for consistency (#5630) |

#### G. 结构性改动（依赖、引擎清理、启动/打包、工具链）（23 个）

| 日期       | 提交       | 单独应用       | 改动规模     | 标题                                                                                         |
| ---------- | ---------- | -------------- | ------------ | -------------------------------------------------------------------------------------------- |
| 2026-09-02 | `e3dc23e2` | 干净           | 0 文件 +0/-0 | chore: add pre-commit hooks (husky + lint-staged) for shift-left enforcement (#4999)         |
| 2026-09-08 | `6ca82255` | 冲突 1 个文件  | 0 文件 +0/-0 | fix: detect system language on first start (#5131)                                           |
| 2026-09-08 | `38597a28` | 干净           | 0 文件 +0/-0 | fix: keep Electron locale resources for all supported UI languages (#5132)                   |
| 2026-09-13 | `49eb3d3e` | 冲突 1 个文件  | 0 文件 +0/-0 | chore: run only eslint --fix on staged desktop TS/Vue files (#5318)                          |
| 2026-09-16 | `3c8b8653` | 冲突 3 个文件  | 0 文件 +0/-0 | fix(desktop): read locale files from the app's resources (#5408) (#5411)                     |
| 2026-09-16 | `dba33add` | 冲突 1 个文件  | 0 文件 +0/-0 | fix(desktop): open files from a second instance started with --user-data-dir (#3020) (#5375) |
| 2026-09-16 | `a95dd518` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(desktop): launch normally when NODE_ENV=development is set (#5053) (#5374)               |
| 2026-09-17 | `d3f69598` | 干净           | 0 文件 +0/-0 | fix(desktop): load the e2e Playwright config by moving it to the package root (#5435)        |
| 2026-09-18 | `b6b05f6a` | 冲突 1 个文件  | 0 文件 +0/-0 | ci: bound the unit-test job at ten minutes (#5448)                                           |
| 2026-09-18 | `187a1f9a` | 干净           | 0 文件 +0/-0 | ci: check every text file out as LF on all platforms (#5447)                                 |
| 2026-09-18 | `8702bafd` | 冲突 1 个文件  | 0 文件 +0/-0 | test(desktop): run the unit suite on Windows in CI (#5323)                                   |
| 2026-09-23 | `350acd42` | 冲突 10 个文件 | 0 文件 +0/-0 | Drop the legacy muya ambient bridge and its aliases (#4257) (#5526)                          |
| 2026-09-23 | `98bb858c` | 冲突 4 个文件  | 0 文件 +0/-0 | Type the editor handle as Muya, from the engine's own declarations (#4257) (#5533)           |
| 2026-09-23 | `d24e48ff` | 冲突 1 个文件  | 0 文件 +0/-0 | Type the .vue CodeMirror/spell-checker handles and forbid `any` in .vue (#4257) (#5521)      |
| 2026-09-30 | `f06c683c` | 冲突 2 个文件  | 0 文件 +0/-0 | docs: replace CLAUDE.md with AGENTS.md and refresh contributor docs (#5595)                  |
| 2026-10-08 | `7623c621` | 干净           | 0 文件 +0/-0 | fix(desktop): let the --debug flag reach MarkText in packaged builds (#5643)                 |
| 2026-10-09 | `2642c838` | 冲突 6 个文件  | 0 文件 +0/-0 | chore(deps): upgrade the workspace dependencies to their latest releases (#5687)             |
| 2026-10-09 | `c064b907` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(deps): bump the postcss override to 8.5.29 (#5674)                                     |
| 2026-10-09 | `ce807d50` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(deps): drop dependencies the desktop app no longer uses (#5681)                        |
| 2026-10-09 | `eabd0a73` | 干净           | 0 文件 +0/-0 | test: run the desktop unit tests on Node 25 (#5666)                                          |
| 2026-10-09 | `0f11569f` | 冲突 5 个文件  | 0 文件 +0/-0 | chore: remove the retired packages/muyajs engine (#5675)                                     |
| 2026-10-09 | `99fdb5ad` | 干净           | 0 文件 +0/-0 | chore(ci): move the workflows to the Node 24 action runtime (#5670)                          |
| 2026-10-14 | `8e0f25bb` | 干净           | 0 文件 +0/-0 | chore(desktop): drop deprecated optimizeDeps.esbuildOptions (#5738)                          |

#### H. 测试与 CI（3 个）

| 日期       | 提交       | 单独应用      | 改动规模     | 标题                                                                                |
| ---------- | ---------- | ------------- | ------------ | ----------------------------------------------------------------------------------- |
| 2026-09-11 | `7cfbcfb7` | 冲突 1 个文件 | 0 文件 +0/-0 | test(desktop): wait for TOC scrolls to settle in the toc-scroll e2e (#5303)         |
| 2026-09-22 | `70372d69` | 冲突 1 个文件 | 0 文件 +0/-0 | test(desktop): repoint the technical-term checks at keys that exist (#5501) (#5503) |
| 2026-09-25 | `ffaff37a` | 冲突 1 个文件 | 0 文件 +0/-0 | test: fold the two #5539 specs into one (#5557)                                     |

#### I. 建议跳过（版本号、赞助/README/网站、只影响 macOS/Linux/上游发布流程）（39 个）

| 日期       | 提交       | 单独应用       | 改动规模     | 标题                                                                                  |
| ---------- | ---------- | -------------- | ------------ | ------------------------------------------------------------------------------------- |
| 2026-07-27 | `e52106fd` | 干净           | 0 文件 +0/-0 | docs: update sponsor logo (#5014)                                                     |
| 2026-09-01 | `921fb2c2` | 干净           | 0 文件 +0/-0 | docs: fix grammar issues in FAQ.md (#5089)                                            |
| 2026-09-01 | `20c93cc7` | 干净           | 0 文件 +0/-0 | docs: remove sponsor ukey (#5217)                                                     |
| 2026-09-04 | `a7cc50f2` | 干净           | 0 文件 +0/-0 | ignore revoked output pipe errors on macOS                                            |
| 2026-09-10 | `4eb9eab4` | 干净           | 0 文件 +0/-0 | fix: skip website preview deploy on fork PRs (#5278)                                  |
| 2026-09-11 | `a41d5a50` | 干净           | 0 文件 +0/-0 | docs: fix the macOS alias path in the CLI docs (#5308)                                |
| 2026-09-11 | `82d75207` | 干净           | 0 文件 +0/-0 | chore(release): v0.20.0-rc.2                                                          |
| 2026-09-15 | `4e6b6dec` | 干净           | 0 文件 +0/-0 | chore(desktop): disable the Report button in the error dialog (#5359)                 |
| 2026-09-15 | `a3ee056f` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): v0.20.0-rc.3                                                          |
| 2026-09-17 | `186bc14b` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): v0.20.0-rc.4                                                          |
| 2026-09-18 | `b4064d12` | 冲突 3 个文件  | 0 文件 +0/-0 | docs: add StarDesk as a special sponsor (#5444)                                       |
| 2026-09-19 | `abbfef92` | 干净           | 0 文件 +0/-0 | docs: explain how to put `marktext` on PATH on every platform (#5119) (#5459)         |
| 2026-09-19 | `58b68b56` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): v0.20.0-rc.5                                                          |
| 2026-09-22 | `56c16136` | 干净           | 0 文件 +0/-0 | docs: update verify the download instructions (#5511)                                 |
| 2026-09-24 | `b7a5dbb6` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): v0.20.0-rc.6                                                          |
| 2026-09-29 | `ab8e079e` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): v0.20.0-rc.7                                                          |
| 2026-09-30 | `b41010fc` | 冲突 1 个文件  | 0 文件 +0/-0 | fix(desktop): route standard edit shortcuts to macOS native dialogs (#5582)           |
| 2026-10-02 | `f6ca4637` | 冲突 2 个文件  | 0 文件 +0/-0 | chore: bump develop to 0.21.0-dev (#5607)                                             |
| 2026-10-02 | `53226af9` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): v0.20.0                                                               |
| 2026-10-03 | `cad9e9ed` | 干净           | 0 文件 +0/-0 | docs: fix broken relative links in translated READMEs (#5616)                         |
| 2026-10-08 | `20298297` | 干净           | 0 文件 +0/-0 | docs: fix broken links in the muya and website package READMEs (#5668)                |
| 2026-10-08 | `302d8bbc` | 冲突 2 个文件  | 0 文件 +0/-0 | chore: bump develop to 0.22.0-dev (#5662)                                             |
| 2026-10-08 | `a1f0d77b` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): merge v0.21.0 into develop (#5663)                                    |
| 2026-10-08 | `ab58aa6a` | 冲突 14 个文件 | 0 文件 +0/-0 | docs: remove StarDesk sponsor from README and website (#5656)                         |
| 2026-10-08 | `b8d28c91` | 干净           | 0 文件 +0/-0 | chore(ci): remove Claude Code workflow (#5655)                                        |
| 2026-10-09 | `c5b8babf` | 冲突 1 个文件  | 0 文件 +0/-0 | fix(build): re-sign macOS arm64 builds after flipping the nodeCliInspect fuse (#5664) |
| 2026-10-11 | `712b8dd9` | 干净           | 0 文件 +0/-0 | fix(release): preserve update metadata for both architectures (#5705)                 |
| 2026-10-11 | `e5baab89` | 干净           | 0 文件 +0/-0 | feat(website): load release and community stats dynamically from GitHub (#5699)       |
| 2026-10-11 | `895fa974` | 冲突 2 个文件  | 0 文件 +0/-0 | fix(website): restore Worker compatibility and check runtime before deploy (#5698)    |
| 2026-10-12 | `ec637cde` | 冲突 1 个文件  | 0 文件 +0/-0 | docs: fix links in contributing overview (#5718)                                      |
| 2026-10-12 | `fdf5982b` | 冲突 1 个文件  | 0 文件 +0/-0 | feat(website): add individual and corporate sponsorship page (#5715)                  |
| 2026-10-14 | `c2c4bcc4` | 冲突 3 个文件  | 0 文件 +0/-0 | fix: render sponsor avatars as a circular SVG wall (#5749)                            |
| 2026-10-14 | `54be74c1` | 冲突 1 个文件  | 0 文件 +0/-0 | docs: update current sponsors                                                         |
| 2026-10-14 | `f07ea0ad` | 干净           | 0 文件 +0/-0 | docs: automatically display current sponsors in README (#5748)                        |
| 2026-10-14 | `f1da4b05` | 干净           | 0 文件 +0/-0 | docs: fix plaintext paste shortcut descriptions (#3769) (#5744)                       |
| 2026-10-18 | `d2e18775` | 冲突 3 个文件  | 0 文件 +0/-0 | feat: #5695 ship Linux arm64 packages in releases (#5778)                             |
| 2026-10-18 | `ac484359` | 干净           | 0 文件 +0/-0 | fix(release): explicitly select the previous stable version (#5781)                   |
| 2026-10-18 | `4b3bcf20` | 冲突 2 个文件  | 0 文件 +0/-0 | chore: begin v0.23.0 development (#5780)                                              |
| 2026-10-18 | `6f218d5a` | 冲突 2 个文件  | 0 文件 +0/-0 | chore(release): v0.22.0 (#5779)                                                       |
