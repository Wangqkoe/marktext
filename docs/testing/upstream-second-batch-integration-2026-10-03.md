# 第二批上游修复接入验收（2026-10-03）

## 接入范围

工作树从基线 `7419bccfe8a7d58f38c551c97717dc404cc92bbe` 创建分支
`codex/pick-upstream-second-batch`，按顺序以 `cherry-pick -x` 接入：

1. `2930c6660a5f913f95af935e465e3f8590a3bab4` → `c01cd7fb0f83250176296f4d75d59ebb53c91ee1`：按字面量匹配引用标签中的正则元字符，并按 CommonMark 规则处理大小写及空白折叠。
2. `16e986fb55cf1ce9825f05ba384a65f4741bd0ea` → `b493a11db8921b09964c52d72a44f38d9964edcf`：由 Snap 为 sequence 箭头 marker 分配唯一 ID，避免 PDF 打印容器中的第二份图表解析到编辑区的隐藏 marker。
3. `63b9509e3f90f52606427150b0bf67a5974d38dd` → `31916722e6882bc919882355ec5359a80d4ce5a6`：编辑区和导出 HTML 的表格单元格允许长连续内容换行。

本地测试适配提交为 `4f7e56be13151da516020b0322bffd995e20d6e6`，Muya E2E 定向 lint 修正为
`caee9f9399be4e09d8891858cf2840514a518018`。所有提交只存在于本地仓库；没有 push、发布或替换安装器。

## 冲突与保留边界

`blockSyntax.css` 的唯一三方冲突按本地行为解决：

- `.mu-table-cell-content` 保留基线的 `min-width: 10em`，仅加入 `overflow-wrap: anywhere`。
- 没有带入上游旧上下文的 `position: relative`、`z-index: 2` 或 `min-width: 2em`。
- 完整保留 `1e681990` 的矩形选区背景、`::before` 选区边框和层级规则。
- 导出样式精确加入 `.markdown-body table th, .markdown-body table td { overflow-wrap: anywhere; }`。

引用标签提交自动合并到本地 `scrollPage` 后，只改动 `updateRefLinkAndImage` 的标签匹配；本地 inline renderer 按 document revision 缓存引用定义的实现和 `scrollPage` DOM 监听性能改动均保留。sequence 修改只移除 vendored renderer 的两个固定 marker ID，没有改变导出协议。

上游 PDF E2E 原来写死 `/tmp`。本地适配使用 `os.tmpdir()` 和 `path.join()`，并在 `afterEach` 中以精确文件路径清理；测试仍经过真实导出对话框、Electron `printToPDF` 和落盘，并断言打印容器内每个 `url(#…)` 都解析到同一打印容器中的 SVG 元素。

新增表格回归使用两列夹具，避免把现有每列 `10em` 最小宽度造成的合理溢出误判为缺陷。系统 Chrome 在 900px 视口中实际布局长连续 token 表头、长 URL 正文和两个短内容单元格；同时用真实 `MarkdownToHtml.generate()` 输出完整 HTML，并在 700px iframe 中执行导出 CSS。断言长内容在编辑区和导出文档内均跨多行、表格不超过可用宽度、短内容保持单行，并以 computed style 验证编辑单元格仍为 `10em` 最小宽度。

## 依赖解析核验

普通已安装依赖继续复用主仓 Junction，没有执行安装或浏览器下载。为了防止验证误用主仓旧 Muya 源码，测试期间只在当前工作树临时覆盖 workspace 包入口：

- Muya E2E 的临时 `@muyajs/core` realpath 为
  `C:\Users\1407\.codex\worktrees\verify-upstream-first-six\Marktext\packages\muya`；入口 realpath 为该目录下的 `src\index.ts`。
- 独占 Vite 端口为 `6224`。实际获取的 `/main.ts` 将 `@muyajs/core` 转换为
  `/@fs/C:/Users/1407/.codex/worktrees/verify-upstream-first-six/Marktext/packages/muya/src/index.ts`，证明浏览器加载的是当前修复工作树。
- desktop build/Electron E2E 前临时隔离 `packages/desktop/node_modules`，其 `@muyajs/core/src/index.ts` realpath 同样指向当前工作树。构建产物 CSS 含 `min-width: 10em` 及 PostCSS 转换后的 `word-wrap: anywhere`；renderer JS 中固定 `markerArrowBlock` / `markerArrowOpen` 命中数为 0。
- Vite/Vitest 仅通过未提交临时配置放行 Junction 指向的已安装 CSS 依赖路径。

验证后已停止 Vite，删除全部临时配置和 Muya E2E 临时 `node_modules`，并恢复 desktop 原始 Junction：
`packages/desktop/node_modules` → `E:\Program Files\Marktext\packages\desktop\node_modules`。恢复后的 desktop `@muyajs/core/src/index.ts` realpath 为主仓原路径，说明临时隔离未修改主仓依赖。

## 实际验证

- 引用标签与性能兼容单测：
  `pnpm --filter @muyajs/core exec vitest run src/block/scrollPage/__tests__/updateRefLinkAndImage.spec.ts src/inlineRenderer/__tests__/referenceDefinitionCache.spec.ts src/inlineRenderer/__tests__/referenceLinkImageAnchor.spec.ts src/state/__tests__/referenceLink.spec.ts --maxWorkers=2`，结果 `4 files passed / 23 tests passed`。覆盖上游 7 条真实 Muya 回归、引用定义 revision 缓存及现有引用链接行为。
- Muya Chromium E2E：使用 system Chrome 运行新增表格布局、`table-cell-selection` 和 `table-rect-clipboard` 三个文件，结果 `7 passed`；复制、剪切、选区文本和矩形选区行为均通过。
- `pnpm --filter @muyajs/core lint:types`：通过。
- `pnpm --filter marktext typecheck`：通过；执行时 desktop `@muyajs/core` 已指向当前工作树。
- desktop 导出相关单测：原配置首跑中 `pdf.spec.ts`、`exportHtml.spec.ts` 被 Vite 拒绝 Junction 真实路径下的 `github-markdown-css?...inline`，`export-header-footer-diagram.spec.ts` 的 2 条测试已通过。使用未提交的临时 `server.fs.allow` 配置复跑三个文件，结果 `3 files passed / 37 tests passed`。
- `pnpm build`：通过；main `503 modules`、preload `3 modules`、renderer `5889 modules`。只有既有 CodeMirror 动态/静态 import 分块 warning。
- Electron PDF 回归：`export-pdf.spec.ts` 与新增 `issue-2423-sequence-arrows.spec.ts` 合计 `5 passed`。覆盖真实 PDF 文件头/成功事件/取消/重复导出，以及实际 PDF 导出时打印容器 SVG marker 引用的局部解析。
- 定向 ESLint：Muya `scrollPage` 源码及新增单测通过 Muya 自身配置；新增表格 E2E 用 `--no-ignore` 检查时最初发现接口命名和箭头参数括号 2 个 error，已在 `caee9f93` 修复并复跑通过；desktop 新 PDF E2E 为 `0 errors / 2 warnings`，两处 warning 都是上游测试的 non-null assertion。vendored sequence JS 按仓库配置不参与 lint。
- 定向 Stylelint：`exportStyle.css` 通过。`blockSyntax.css` 全文件为 `2 errors / 10 warnings`；同一 Stylelint 对基线文件为相同的 `2 errors / 9 warnings`，两个 error 都是既有 `no-descending-specificity`。新增的一条是 `overflow-wrap` 前空行的属性排序 warning。按仓库问题分级，这些均为非阻断记录项，未为消除 warning 扩大本票范围。

未运行全部 Muya 单元测试、全部 Electron E2E 或跨浏览器矩阵；没有下载 Chromium、Firefox 或 WebKit。额外尝试的 Muya E2E 全 tsconfig 检查暴露了该目录大量既有类型错误，且在隔离前显示会解析主仓 Muya，因此不计作验收；正式 E2E、desktop build 和 Electron 验证均在上述 worktree realpath 核验后执行。

测试结束后已删除本轮 Electron 临时 profile；未发现 `marktext-e2e-2423-*.pdf`、现有 export-pdf 临时文件或当前工作树 Electron 进程残留。
