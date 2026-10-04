# 代码块编辑与渲染本地兼容移植验收（2026-10-03）

## 范围与提交来源

指定工作树从 clean 基线 `bdd1c20c562ad4b01e2879a6e9ca1c26cfa6e771`
创建分支 `codex/port-codeblock-local-compat`，按依赖顺序以
`cherry-pick -x` 接入：

1. `19faab1620150400ec472c18dd3928f4b5b08faf` →
   `1762181cab9879edf7709e221d280bdb2cc01a0f`：为代码块末尾空行提供真实
   line box，修复连续 Enter、空行上下移动和高亮片段切片。
2. `876f8592b6f720ee76273c2da157d996d76a4187` →
   `14cdf4f4fc53b0fb121669d1e5f49dcb5d90d309`：最终 HTML 相同时不再重写
   `innerHTML`，保留正文 DOM node identity 与真实 IME 组合节点。

本地必要兼容提交
`0e5524790b2f730cb1c243d81f07afafe5013711` 处理两个可达阻断：plain code
中引号和 HTML 特殊字符的序列化形式不同，以及 trailing-break wrapper 下 Chrome
已经返回正确 offset 时旧 soft-line 补偿仍把 offset 再加一。

所有提交只存在于本地仓库；没有 push、PR、发布、安装或替换用户应用。

## 基线直接复现

在 `bdd1c20` 上用临时 system Chrome 用例直接复现，随后删除临时文件：

- `hello\n\n` 只有 2 个 line box，预期为 3；末尾空行没有独立可点击/可绘制行。
- 从末尾空行执行 `ArrowUp` 没有留在代码块内的上一行。
- 对文本未变化的代码块调用 `update()` 后，`firstChild` identity 改变。

移植 `876f` 后，plain path 的 `echo "<x>" & 'y'` 仍会重建节点：本地
`escapeHTML` 生成 `&quot;`/`&#39;`，浏览器 `innerHTML` 序列化则保留引号，直接字符串
比较为不等。最小修复仅在快速比较不等时用同一 `ownerDocument` 创建临时 `div`
规范化 produced HTML，再做一次比较；Prism path 的 HTML 已是 canonical。

末行输入还暴露旧 `lineBreakAutoPair` 补偿与新 wrapper 冲突。直接 capture 证据为：
Enter 后 DOM 是 `hello\n<mu-trailing-break><br>`，caret offset 为 6；输入第一个 `a`
时浏览器原始 selection 已在 `Text("a")@1`，转换后的 `start/end` 都是 7，旧逻辑又加一
成为 8，随后 clamp 到 code content 的 child index 1，使后续 `b/c` 插入到错误位置。
本地修复只在 raw DOM text 与 `blockText + event.data` 不同时执行旧替换和非 Firefox
offset 补偿；raw text 已正确时保留浏览器 offset。没有修改通用 selection 映射。

## 本地兼容决定

- 保留本地 `Content` composition 机制：`compositionstart` 只设置 `isComposed`，
  `compositionend` 调用 `inputHandler`；没有引入上游 `COMPOSITION_ANCHOR`、
  `_compositionAnchor` 或 seed 方法。上游依赖该内部机制的单元断言改为验证本地机制下
  trailing break 在 composition guard 期间不被破坏；真实末行 IME 由 CDP 验收。
- 保留 `Content.arrowHandler` 的 RTL、Shift+Arrow、空末段 guard 和首/末边界退出语义；
  代码块专属空行 Up/Down 只在命中时提前返回，其余继续调用 `super`。
- 保留 Unicode grapheme deletion、line-number gutter 缓存与 `ResizeObserver`、preview
  缓存及 math/diagram/html preview、完整 info string 与首词 language、实际 grammar setter。
- `getHighlightHtml` 仍兼容三参数调用；代码块的四参数路径先切片再高亮，并用 trailing
  wrapper 表示尾空行，移除了使用全局 start/end 判断局部片段的旧末尾分支。
- unchanged guard 只包围两处正文 `innerHTML` 赋值；line numbers、preview、grammar 和
  search highlight/clear 仍按原路径执行，合法文本、语法与搜索变化继续更新。

## 依赖与路径隔离

没有重新安装依赖或下载浏览器。Muya system Chrome 使用机器现有 Chrome、独占端口
`6228`、临时 Vite source alias 与 `server.fs.allow`；实际 `@muyajs/core` 指向当前工作树
`packages/muya/src`，没有误测主仓旧源码。

desktop 原 `packages/desktop/node_modules` 是指向
`E:\\Program Files\\Marktext\\packages\\desktop\\node_modules` 的 Junction。类型检查、构建和
Electron 期间使用临时物理 overlay：普通依赖与 `.bin` 复用主仓依赖，
`@muyajs/core` 单独指向当前工作树 `packages/muya`。验收后逐个移除 overlay 内链接与
自有空目录，再恢复原 Junction。

## 实际验证

### core 单元、类型、lint 与构建

- 定向 core 组合覆盖 `autoPair`、codeblock arrow/Enter/Backspace/trailing newline、
  render idempotence、info/language、preview、line numbers、Tab、Unicode grapheme delete、
  search 和 table composition，结果 `15 files passed / 155 tests passed`。
- 新增 `lineBreakAutoPair` 单元分别固定旧 collapsed DOM 的 offset 补偿，以及 wrapper
  下 raw DOM 已正确时 offset 不得二次增加。render idempotence 覆盖 plain/Prism、
  trailing break、grammar、search highlight/clear，以及带引号和 HTML 特殊字符的 plain
  code identity。
- `pnpm --filter @muyajs/core lint:types`：通过。
- `pnpm --filter marktext typecheck`：通过；desktop 的 `@muyajs/core` 指向当前工作树。
- 全部改动 source/unit 按 Muya 配置定向 ESLint 通过；四个新增或修改 E2E 文件用根配置
  `--no-ignore` 检查为 0 error。报告 17 个 non-null assertion warning 和根
  `MODULE_TYPELESS_PACKAGE_JSON` 提示，均为既有规则 warning。
- `pnpm build` 在最终 source 和隔离 overlay 上通过：main `503 modules`、preload
  `3 modules`、renderer `5886 modules`；仅有既有 CodeMirror dynamic/static import
  分块 warning。

### system Chrome

最终相关组合运行 38 条：本票 trailing line/真实 IME/line-number gutter、Unicode、既有
codeblock、DOM identity、段落 soft line 和新增 hard line 连续输入中 37 条通过。唯一失败
是既有 table synthetic IME 用例：页面可见 DOM 与 active block 已为 `x中文`，但紧接着
读取的 `getMarkdown()` 仍为旧 `x`。同一用例随后隔离运行 `1 passed`；按组合负载下偶发
同步时序记录，没有为此修改既有夹具或产品源码，也没有把结果写成 38/38。

目标覆盖包括：空块及一到多个尾换行、plain/Prism、连续 Enter、末行 click/Up/Down 后
typing、首行 ArrowUp 退出、真实 line box/caret、wrapped line-number gutter 与末空行、
真实 CDP `Input.imeSetComposition` 两次中文提交、emoji `🙂` 和组合正文 `é` 保护、短暂停顿
IME、普通 typing、引号/HTML 特殊字符 identity、search highlight/clear、Unicode search/
delete、IME Tab，以及段落/table composition。

真实末行 IME 的首个测试设置曾直接 `setContent` 为带双尾换行的代码块，再执行
`Control+End`；composition 片段落在第 2 行而预期第 3 行。该 Ctrl+End 边界的具体原因
没有定位，因此只作为非阻断观察记录，不称为纯夹具故障。最终验收从受保护正文
`🙂é` 开始，通过 UI 实际执行两次 Enter，再用 CDP 组合并提交 `你`、短暂停顿后提交
`好`，composition 过程位于第 3 行且最终 text 为 `🙂é\n\n你好`；这一调整没有修改
产品源码。

### 真实 Electron 保存重开

使用最终 source 重新构建后运行：
`pnpm exec playwright test --config test/e2e/playwright.config.ts test/e2e/codeblock-editing-persistence.spec.ts --reporter=line`；
结果 `1 passed`（约 `15.5s`）。

夹具在独立临时 Markdown 与 profile 中打开包含 `const seed = "🙂é"` 的 JavaScript 代码块，
真实执行两次 Enter，并用 CDP 依次组合/提交 `你`、短暂停顿后组合/提交 `好`。可见 DOM、
workspace snapshot 和 `getMarkdownContent` 都等于
`const seed = "🙂é"\n\n你好` 对应的 fenced Markdown；通过真实 save IPC 写盘后磁盘相等。
关闭并以同一 file/profile 重开后四个来源仍一致，两个 Electron 进程捕获的 renderer
error 都为 0；dirty 清理由 `closeDiscardingChanges` 完成。

## 非阻断记录与清理

- 没有运行全部 core/Electron E2E 或 Firefox/WebKit；本票运行相关 unit、system Chrome
  和真实 Electron 门禁。
- Chrome 组合中的 table synthetic IME 偶发同步、未定位的 direct-setContent +
  Ctrl+End 行边界、build 的 CodeMirror 分块 warning、ESLint package-type 和 non-null
  warning 均按问题分级记录，没有扩展为通用 IME/selection/canonicalization 改造。
- 本票没有性能测量，也不声称性能收益。
- 最终执行 `git diff --check bdd1c20..HEAD`，清理临时 alias、测试输出、owned 进程和端口
  `6228`，并恢复 desktop 原 Junction；完成状态以最终提交和工作树核验为准。

本轮实现和独立关键静态复审没有留下阻断问题。
