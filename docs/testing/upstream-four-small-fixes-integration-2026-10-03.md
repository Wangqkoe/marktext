# 四项上游小修复接入验收（2026-10-03）

## 接入范围

工作树从基线 `c04432d7a60ad3b42a0757969545044729456b68` 创建分支
`codex/pick-upstream-four-small-fixes`，按顺序以 `cherry-pick -x` 接入：

1. `dbe6ab5f` → `59fd7986`：普通搜索转义 `{}`，关闭正则时按字面量匹配。
2. `8b5f0a46` → `8fa84e81`：代码语言清空或变为未知语言时清除旧高亮，实际 grammar 未变化时不重绘。
3. `0c33241b` → `3671257b`：带编号的宽 display math 将编号纳入可滚动宽度，避免公式与自己的编号重叠。
4. `5f402695` → `152d9fb3`：PDF/打印中的 `pre code` 长行换行。

本地测试适配提交为 `4d3b64a1`。所有提交只存在于本地仓库；没有 push、PR、发布或安装器替换。

## 适配与保留边界

- 搜索改动只扩充普通查询的正则转义字符；正则搜索、大小写和整词选项矩阵保持原行为。
- 代码语言改动保留本地 `CodeBlock.create()` 的行号 gutter、info string 首词取语言、完整元信息保存。单测覆盖清空、未知、已知切换、相同 grammar 及连续未知前缀，并定向复核两组行号测试。
- 数学样式只改 display math 的 KaTeX 编号布局，未接入 inline-math 宽度或新语法。上游原测试中的两条 same-line `$$formula$$` 用例首跑找不到 `.mu-math > .mu-math-render .katex-display`，失败快照显示编辑器将全文保留为普通段落；本地 `inlineRenderer/rules.ts` 只匹配单个 `$`，`inlineMath.ts` 固定 `displayMode = false`。上游 same-line display 功能来自未授权的独立提交 `bec5f476`，因此本地保留四条可达的 math-block 实际布局回归：宽公式、窄公式、激活浮动预览和无编号居中。
- PDF 样式只作用于 print media 下导出 HTML 的 `article.markdown-body pre code`。真实 Electron 回归在保存对话框 seam 暂停导出，切换 print media 后测量有 `language-bash` 与无语言的两段长代码均实际跨行、未超出 `pre`，随后放行真实 `printToPDF` 并核对 `%PDF-` 文件头。全部临时 PDF 使用 `os.tmpdir()` / `path.join()` 和精确文件路径清理。

## 依赖路径核验

已安装依赖继续复用主仓 Junction，没有重新安装或下载浏览器。为避免误测主仓旧 Muya，验证时仅在当前工作树创建临时覆盖：

- Muya E2E 使用独占端口 `6225` 和临时 Vite alias。实际 `/main.ts` 将 `@muyajs/core` 转换为
  `/@fs/C:/Users/1407/.codex/worktrees/verify-upstream-first-six/Marktext/packages/muya/src/index.ts`。
- desktop 类型检查、生产构建和 Electron E2E 前临时隔离 `packages/desktop/node_modules`；隔离后的
  `@muyajs/core` Junction 指向
  `C:\Users\1407\.codex\worktrees\verify-upstream-first-six\Marktext\packages\muya`。
  生产 renderer JS 含新的 `loadedLanguages` / `transformAliasToOrigin` grammar 路径；生产 CSS 含
  `.katex-html:has(> .tag)` 的 `max-content`/静态浮动编号规则以及 print `pre code` 换行规则。
- desktop 原 Junction 已恢复为
  `packages/desktop/node_modules` → `E:\Program Files\Marktext\packages\desktop\node_modules`；临时隔离目录、临时配置、Vite 服务、测试 PDF 和本轮 Electron 进程均已清理。

## 实际验证

- 搜索、代码语言与行号单测：
  `pnpm --filter @muyajs/core exec vitest run src/utils/__tests__/searchLiteralBraces.spec.ts src/utils/__tests__/search.spec.ts src/block/commonMark/codeBlock/__tests__/languageChangeRender.spec.ts src/block/commonMark/codeBlock/__tests__/lineNumbersGutter.spec.ts src/utils/__tests__/codeBlockLineNumbers.spec.ts --maxWorkers=2`，结果 `5 files passed / 52 tests passed`。
- Muya system Chrome E2E：代码语言变更 3 条、display math 布局 4 条，结果 `7 passed`。实际入口路径如上。
- PDF 单测：默认配置首跑被 Vite 拒绝 Junction 下的 `github-markdown-css?...inline`；临时 `server.fs.allow` 并显式 alias 当前工作树 Muya 后，`print-code-wrap.spec.ts` 结果 `1 file passed / 2 tests passed`。
- `pnpm --filter @muyajs/core lint:types`：通过。
- 隔离依赖后的 `pnpm --filter marktext typecheck`：通过；恢复 Junction 后对最终测试代码复跑也通过。
- `pnpm build`：通过；main `503 modules`、preload `3 modules`、renderer `5889 modules`。
- Electron PDF E2E：`export-pdf.spec.ts` 结果 `5 passed`，覆盖既有落盘/成功事件/取消/重复导出，以及新增的有语言和无语言长代码实际打印布局。隔离环境首跑因未提供 package-local `.bin/electron.cmd` 无法启动；将 `.bin` 只读 Junction 接回已安装工具后复跑全绿，Muya 入口仍指当前工作树。
- 定向 ESLint：Muya 源码及单测通过包内配置；新增 Muya E2E 按仓库配置机械格式化后，与 desktop PDF 单测/E2E 合跑为 `0 errors / 8 warnings`。warning 均为上游/测试中的 non-null assertion，按问题分级记录而未扩大修改。

## 非阻断记录

- `editor/index.ts` 的既有历史回放直接修改 language input `_text` / `parent.meta.lang`，绕过新的 `lang` setter；这是本票前已有的撤销/重做高亮边路，不影响四项明确验收，未扩展修复。
- 首次构建的 `requestAnimationFrame` setter 会对已加载 grammar 追加一次渲染；静态复审将其列为非阻断性能记录。
- 带编号的短公式现在在编号左侧剩余空间内居中，会轻微偏离整个容器中心；这是避免编号重叠的布局取舍。无编号公式保持原居中，浏览器回归已覆盖。
- build 只有既有 CodeMirror 动态/静态 import 分块 warning；未运行全部 Muya 单测、全部 Electron E2E 或跨浏览器矩阵。

独立静态复审对 `152d9fb3` 的四项业务代码结论为阻断问题 `0`。当前验收未发现未处理阻断项。
