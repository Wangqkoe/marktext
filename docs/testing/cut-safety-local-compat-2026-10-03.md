# 剪切安全本地兼容移植验收（2026-10-03）

## 范围与提交来源

指定工作树从 clean 基线 `35623bc33df6d92d5d16eb8bc768b0b4a746235e`
创建分支 `codex/port-cut-safety-local-compat`，按依赖顺序以
`cherry-pick -x` 接入：

1. `0e156b0acf5f98a78c2078c0b0fb405e614c65d6` →
   `1adf6c77a50eaa930ef3a24730f6fa6dc21e0675`：剪切起点在 list/quote
   内时删除同容器内已选中的后续内容。
2. `00f15b23d924813a06e528bc29e685c80e1e6d1f` →
   `34eb4464b26503b6ee3e873f5130333cd6c09af9`：剪切终点在 table
   内时保留终点 cell 尾文及选区后的正文，按选区覆盖范围清空 cell
   或删除整表，并立即刷新 DOM。

本地必要兼容提交
`d3ba78b05212e074166b83b2d99733a7f82117eb` 修复真实 Ctrl+X 的 copy
前置路径：普通文本选区触及 quote 内嵌 table 时继续沿用 table 原子复制语义，
避免生成畸形 table state 后在 Markdown 序列化中抛错。

所有提交只存在于本地仓库；没有 push、PR、发布、安装器替换或用户应用启停。

## 基线直接复现

在 `35623bc33df6d92d5d16eb8bc768b0b4a746235e` 上临时加入三个定向用例，
运行后删除临时文件，得到以下直接失败：

- 从 list 第一项剪切到容器外时抛出
  `TypeError: Cannot destructure property 'path' of 'this.parent' as it is null`，
  history 同时记录相同 unhandled error；选中的后续 list 内容未能安全删除。
- 从外部剪切到嵌套 table 时，预期正文轮廓为
  `[a, empty header, 1, after, more]`，实际为
  `[a1, empty cell, empty cell]`；终点 cell 尾文被移出 table，且 `after`、`more`
  被误删。
- 从含后续项的 list 剪切到部分 table 时，预期为
  `[a, empty header, 2, 34]`，实际为
  `[a2, b, empty header, empty cell, 34]`；list 后续项残留且 cell 尾文被移走。

移植两条上游提交后，真实 Electron Ctrl+X 又给出一项可达阻断：
`getClipboardData → StateToMarkdown._serializeTable` 在
`cell.text.trim()` 抛出 `TypeError`，剪切没有发生。相同选区的单元回归在
`34eb4464` 上为 `1 failed / 10 passed`。根因是 `Table.getState()` 已把运行时
`TableInner` wrapper 展平为 row state，而通用 container builder 又按运行时 child
递归，构造出 `table → table → row → cell`。最小修复只让两个 container builder
遇到 table 时返回完整合法 table state；矩形选区仍走既有专用 copy 路径，serializer
不增加吞错逻辑。

## 本地兼容决定

- 冲突解决保留本地 frozen/矩形 table 两阶段删除、整行/整列/整表结构删除、
  selected image、language-input collapse、Unicode 搜索、代码行号/preview，及
  嵌套 code/math/html 的 `getAnchor()` 安全路径。
- `collapseLanguageInputCut` 使用起点 `getAnchor()` 判断所属 code block；否则嵌套在
  list/quote 的语言输入剪切会错误移除外层容器。该兼容修正属于本票数据安全边界。
- 未引入上游无关 `LangInputContent` import 或整文件替换。非 table 终点继续使用本地
  普通尾文合并语义；table 内两端继续使用本地 cell 合并语义。
- 普通文本选区中的 table 保持既有 whole-table copy 语义；冻结的矩形选区继续只复制
  所选矩形。本票没有实现新的 partial-table clipboard 算法。

## 依赖与路径隔离

没有重新安装依赖或下载浏览器。Muya system Chrome 使用机器现有 Chrome、独占端口
`6227`、临时 Vite alias 与 `server.fs.allow`。实际 `/main.ts` 将
`@muyajs/core` 解析到
`C:/Users/1407/.codex/worktrees/verify-upstream-first-six/Marktext/packages/muya/src/index.ts`，
确认浏览器加载当前工作树源码。

desktop 原 `packages/desktop/node_modules` 是指向
`E:\Program Files\Marktext\packages\desktop\node_modules` 的 Junction。类型检查、构建和
Electron 期间使用临时物理 overlay：普通依赖及 `.bin` 只读复用主仓依赖，
`@muyajs/core` 单独指向当前工作树 `packages/muya`。最终恢复原 Junction，逐个移除
overlay 内 Junction 后删除空目录；临时 alias 配置、测试输出、端口服务和本票 Electron
进程均清理。

## 实际验证

### core 单元、类型、lint 与构建

- `34eb4464` 完成后的剪切及相关回归命令覆盖
  `cutRestOfContainer5385`、`cutIntoTable5400`、`trackCCut`、
  `crossBlockCutGuard`、`cutIntoNestedCodeBlock4903`、`cutLanguageInput918`、
  `languageInputCodeSelection4903`、`cutSelectedImage`、`keydownTableGuard`、
  `graphemeDelete` 与 `search`，结果 `11 files passed / 118 tests passed`。
- copy blocker 修复后运行：
  `pnpm --filter @muyajs/core exec vitest run src/clipboard/__tests__/cutIntoTable5400.spec.ts src/clipboard/__tests__/getClipboardData.spec.ts src/clipboard/__tests__/copyCrossBlockQuote.spec.ts`；
  结果 `3 files passed / 19 tests passed`。这组与前述 118 条有文件重叠，不合并伪造总数；
  新增覆盖 outside→quote/table 的 partial builder 与同一 quote 内 table range builder。
- `pnpm --filter @muyajs/core lint:types`：通过。
- `pnpm --filter marktext typecheck`：通过，desktop 的 `@muyajs/core` 指向当前工作树。
- Muya source/unit 按包配置定向 ESLint 通过；两个 Muya E2E 使用 `--no-ignore`
  定向检查通过；desktop Electron spec 按根配置检查通过。根配置只报告既有
  `MODULE_TYPELESS_PACKAGE_JSON` 提示。
- `pnpm build` 在最终 source 上通过：main `503 modules`、preload `3 modules`、
  renderer `5886 modules`。只有既有 CodeMirror 动态/静态 import 分块 warning。

### system Chrome

通过临时 `playwright.cut-safety-local.config.ts` 使用 system Chrome 运行：
`cut-rest-of-container-5385`、`cut-into-table-5400`、`table-rect-clipboard`、
`cut-into-nested-code-block-4903`、`language-input-code-selection-4903`、
`undo-redo` 与 `unicode-search`；结果 `7 files / 24 tests passed`。

覆盖正/反向选区、真实 Cmd/Ctrl+X、Delete、type-to-replace、undo/redo、table DOM
即时更新、矩形 table、本地语言输入、嵌套 code 与 Unicode 回归。首轮冷 Vite 有一个
setup timeout；服务预热后同一组合全绿。表格用例最初比较 parser canonical spacing，
随后改为 cell/结构语义断言；没有因此修改产品源码。

### 真实 Electron 保存重开

命令：
`pnpm exec playwright test --config=test/e2e/playwright.config.ts test/e2e/cut-safety-persistence.spec.ts --reporter=line`；
最终结果 `1 passed`（加入事件时 focus 断言后的复跑约 `10.3s`）。

夹具在 `os.tmpdir()` 创建独立 Markdown 和 profile，通过 Muya selection seam 设置
`alpha@2 → 12@1`，再真实执行 `page.keyboard.press('Control+X')`；没有直接调用
`cutHandler()`。实际 `cut` DOM event 恰好一次，带 `clipboardData`，事件发生时 Muya
持有 focus。剪切后 table cells 为 `['', '2']`，可见 DOM 保留 `al`、`quote tail`、
`after`，删除 `remove`、`before`。workspace snapshot 与 `getMarkdownContent` 相等，
保存后的磁盘内容相等；关闭并以同一 profile 重新打开同一文件后，DOM、workspace、
`getMarkdownContent` 和磁盘仍一致，两个 Electron 进程捕获的 renderer error 均为 0。

copy blocker 修复后第一次 Electron 启动仍使用修复前的旧 renderer bundle，cells 保持
`['h', '12']`；检查产物确认没有 atomic-table guard 后，重新执行最终 source build，
同一真实 Ctrl+X 用例即通过。该次旧 bundle 运行只记录为构建路径证据，不计作产品失败。

## 非阻断记录与清理

- 没有运行全部 Muya unit、全部 Electron E2E 或 Firefox/WebKit；本票运行明确相关的
  core、system Chrome 和真实 Electron 门禁。
- build 的 CodeMirror 分块 warning、根 ESLint 的 package type 提示、冷 Vite 的一次
  setup timeout 均无可观察数据安全风险，按问题分级记录而不扩票。
- `git diff --check 35623bc33df6d92d5d16eb8bc768b0b4a746235e..HEAD` 通过；
  最终工作树 clean，`packages/desktop/node_modules` 已恢复到主仓 Junction，端口 `6227`
  无 listener，本票临时服务、Electron/Chrome 进程与配置均无残留。

本轮实现和独立关键静态复审没有留下阻断问题。
