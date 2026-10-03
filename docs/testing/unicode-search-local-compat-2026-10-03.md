# Unicode 编辑与搜索本地兼容移植验收（2026-10-03）

## 范围与提交来源

指定工作树从 clean 基线 `828cdc995a54c15f4ebfdab1e8e2a207902cbef0` 创建分支
`codex/port-unicode-search-local-compat`。以下上游依赖链按顺序以 `cherry-pick -x` 接入：

1. `911dd453` → `dc28ee89`：避免普通 inline / code token 删除拆分代理对。
2. `2631d90c` → `4281eb4c`：按扩展字素簇删除，并撤回前一提交过宽的通用 collapsed-caret 处理。
3. `10f43293` → `0eb90753`：修正 OT code-point 偏移、零宽正则死循环以及搜索匹配的字素边界。
4. `edd24288` → `1abd05c6`：捕获文本中的 `$` 按原文插入。
5. `571d1877` → `6cf08aab`：逐 match 展开 replace-all 捕获组，支持 `$0`、`$1`、`$nn`、转义引用和未参与捕获组。

本地兼容修复为：

- `df5d4354`：legacy 非 Unicode 正则的捕获只修补自身被截断的 surrogate 边界，不把安全前缀扩入 `$1`。
- `d2f09285`：保留不支持 RegExp match indices (`d`) 的公开目标；安全捕获和无捕获正则继续工作，无法定位且已含孤立 surrogate 的危险捕获拒绝返回。
- `f53d2adc`：加入 system Chrome 编辑/搜索回归与 Electron 保存重开回归，并让既有 emoji Electron 用例通过 discard seam 关闭 dirty 文档。

所有提交只存在于本地仓库；没有 push、PR、发布、安装器替换或用户应用启停。

## 本地兼容决定

### OT 与删除边界

- `ot-text-unicode` 的位置单位是 Unicode code point。`diffToTextOp` 的未变化段现在按 code point 计数；DOM selection、字符串切片和搜索范围仍使用 UTF-16 code unit，二者不混用。定向重放覆盖中英文、单 emoji、ZWJ family、肤色、旗帜和组合重音，生成 op 应用后均精确等于目标文本。
- 用户可见的 Backspace/Delete 边界按扩展字素簇处理。inline 格式 token 和代码高亮 token 只删除一个完整簇，光标按实际 UTF-16 长度移动。
- 未保留 `911dd453` 中被 `2631d90c` 后续纠正的通用 collapsed-caret 整簇逻辑；没有引入剪贴板、代码 DOM 大改、脚注或新语法。
- 冲突解决保留本地 IME、行号、格式化、代码 info string、语言高亮、预览缓存和大文档路径。`content.ts` 未夹带无关 `isCompositionEndEvent`，`format.ts` 未夹带无关 `escapeHTML`，代码块继续使用本地行号与 Prism 架构。

### 搜索与替换

- core 与 desktop 已移除 `execall`，改为可推进 `lastIndex` 的受控 exec 循环；`/(?=b)/g` 在 `ab` 上结束并返回 `[1, 1)`，不会卡死。
- 普通搜索继续转义 `{}`，保留 `dbe6ab5f` / `59fd7986` 的字面量行为以及大小写、整词矩阵。legacy `packages/muyajs` 仍依赖 `execall`，锁文件保留该 importer 与包记录。
- 正则优先尝试 Unicode 和 match indices；仅非 Unicode 合法的传统 pattern（例如 `\-`）仍可回退。完整非零匹配扩到字素簇，零宽落在簇内部时丢弃，避免插入或替换拆碎正文。
- 有 indices 时，捕获组按自己的真实范围修补 surrogate 边界。`(.|\-)` 对 `🙂` 的 `$1` 为 `🙂`；`\-(.)` 对 `-🙂` 的 `$1` 仍为 `🙂`，不会夹带 `-`。合法 Unicode `(.)` 对 family 的捕获保留正则语义为首个 code point `👨`，完整可见 match 则为整个 family。
- 无 `d` 的兼容路径通过受控替换全局 `RegExp` 模拟验证：普通正则、安全 ASCII 捕获、无捕获 legacy fallback 和零宽匹配继续工作；`(.|\-)` 捕获孤立 surrogate 时安全拒绝。没有声称实际运行 Chrome 70。项目 `chrome70` target 保持不变；V8 的 match-indices 能力从 Chrome 90 / Node 16 起提供，见 [V8 RegExp match indices](https://v8.dev/features/regexp-match-indices) 与 [V8 v9.0 release](https://v8.dev/blog/v8-release-90)。本机 Node `v24.18.0` 的 `d` 路径也已实际核验。
- 替换值逐次基于当前 match 展开；捕获内容中的 `$` 不再被二次解释，未参与捕获组为空串。`$0`、一位/两位组号和反斜杠转义引用均由单测覆盖。

## 依赖与源码路径核验

没有重新安装依赖或下载浏览器。工作树默认 `node_modules` 复用主仓 Junction，因此测试期间采用临时、可逆的路径覆盖：

- Muya E2E 使用独占端口 `6226`、临时 Vite alias 和临时 `server.fs.allow`。实际请求 `/main.ts` 得到
  `/@fs/C:/Users/1407/.codex/worktrees/verify-upstream-first-six/Marktext/packages/muya/src/index.ts`，确认 system Chrome 加载工作树新源码，而非主仓旧 Muya。
- desktop 类型检查、生产构建和 Electron E2E 使用临时物理 `packages/desktop/node_modules`；其直接依赖复用主仓 Junction，`@muyajs/core` 单独指向当前工作树 `packages/muya`，`.bin/electron.cmd` 通过只读 Junction 复用已安装 Electron。这样 desktop build 与真实 Electron 同样加载当前工作树源码。
- 结束后原 Junction 已恢复为
  `packages/desktop/node_modules` → `E:\Program Files\Marktext\packages\desktop\node_modules`。隔离目录按已验证绝对路径逐个移除 Junction 后删除空目录；临时 Vite/Playwright/performance 配置、端口服务及本轮 Electron 进程均已清理。

## 实际验证

### 单测、类型与构建

- 最终定向单测命令：
  `pnpm --filter @muyajs/core exec vitest run src/utils/__tests__/diffToTextOp.spec.ts src/utils/__tests__/search.spec.ts src/utils/__tests__/searchLiteralBraces.spec.ts src/search/__tests__/search.spec.ts src/block/base/__tests__/graphemeDelete.spec.ts src/block/base/__tests__/formatBackspace.spec.ts src/block/content/codeBlockContent/__tests__/enterBackspaceHandler.spec.ts src/block/commonMark/codeBlock/__tests__/lineNumbersGutter.spec.ts src/utils/__tests__/codeBlockLineNumbers.spec.ts src/block/commonMark/codeBlock/__tests__/languageChangeRender.spec.ts --maxWorkers=2`；结果 `10 files passed / 151 tests passed`。
- 151 条中包括 OT 精确重放、inline / code token 删除、零宽搜索、字素簇对齐、捕获替换、无 `d` 五条受控模拟，以及本地花括号、行号、格式化和语言高亮回归。
- `pnpm --filter @muyajs/core lint:types`：通过。
- 隔离依赖后的 `pnpm --filter marktext typecheck`：通过，确认局部 `IRegExpExecArrayWithIndices` 同时兼容 Muya ES2020 lib 与 desktop ES2022 lib。
- `pnpm build`：通过；main `503 modules`、preload `3 modules`、renderer `5886 modules`。只有既有 CodeMirror 动态/静态 import 分块 warning。
- `git diff --check 828cdc995a54c15f4ebfdab1e8e2a207902cbef0..HEAD`：通过。
- 所有本票修改的 Muya 源码/单测按包内 ESLint 检查为 `0 errors / 4 warnings`，四条均为 `format.ts` 既有 lookaround 量词 warning。desktop 与 Muya E2E 按根配置检查；`search-replace.spec.ts` 的旧格式 hard errors 已机械修正，剩余 warning 均为测试现有 non-null assertion，按分级不扩大业务范围。

### system Chrome 与 Electron

- system Chrome 最终组合回归 `11 passed`：普通单次/全部搜索替换 3 条、Unicode 编辑与搜索 5 条、既有 IME 3 条。覆盖 ZWJ 后编辑与 undo/redo、Backspace/Delete 整簇、零宽替换、逐 match 捕获替换、legacy fallback 捕获语义和美元/未匹配组。
- `d2f09285` 完成后再次单跑最终 Unicode 浏览器规格，结果 `5 passed`。浏览器为机器现有 system Chrome；IME 用例使用仓库既有 composition DOM event seam，不等同于人工操作系统拼音候选窗。首次组合运行只有 table IME 用例一次失败；该用例随后隔离连续两次通过，完整组合复跑也通过，没有产品代码改动。
- Electron 命令：
  `pnpm exec playwright test --config test/e2e/playwright.config.ts test/e2e/issue-4926-emoji-delete.spec.ts test/e2e/unicode-persistence.spec.ts`；结果 `3 passed`（约 `20.6s`）。两条删除用例确认单 emoji / ZWJ 后继续输入且无 renderer error。
- 保存重开用例在 `os.tmpdir()` 创建独立 markdown，正文为 `中文🙂👍🏽🇨🇳é👨‍👩‍👧y`。删除末尾 `y` 后同时核对可见 DOM、workspace markdown 和 `getMarkdownContent`，真实保存到磁盘，关闭并重新启动 Electron 打开同一文件，再次核对显示、两个内存接口和磁盘完全一致且无 renderer error。
- Electron 首跑的业务断言已经完成，但 dirty 文档让既有 `app.close()` 等待保存提示；正式夹具改用已有 `closeDiscardingChanges` seam。保存测试首版用通用 caret helper 命中了中文拆分 span 末尾并删掉“中”，随后改为点击真实 paragraph 并按 `End` 定位末尾；这两项均为夹具适配，不是产品正文错误。

### 最小性能核验

使用同一台机器、同一 system Chrome、相同输入各执行一次基线 `828cdc99` 与当前工作树；这是可观察延迟核验，不作为重复统计或所有规模的结论：

| 场景 | 基线 | 当前 |
| --- | ---: | ---: |
| 2,000 个中文段落，唯一命中普通搜索 | 5.4 ms | 14.2 ms |
| 100,000 字符中文单段普通搜索 | 73.9 ms | 102.5 ms |
| 约 60,000 字符、含 emoji/组合字符单段搜索 | 40.4 ms | 50.8 ms |
| 100,000 字符中文单段尾部编辑并等待状态稳定 | 66.8 ms | 48.6 ms |

两版尾部编辑输出都精确正确；搜索增加的绝对延迟在本轮代表规模中可接受，未观察到需要扩大实现的卡顿或缓存/分段回归，因此没有加入额外 fast path。

## 未采用部分与非阻断记录

- 未整文件替换，未接入上游冲突中无关 imports、类型清理或依赖迁移；没有触碰剪贴板、代码 DOM 大优化、脚注或新语法。本地既有 language undo/redo 高亮边路仍按上一批验收记录保留。
- 未运行 Chrome 70、Firefox、WebKit、全部 Muya 单测或全部 Electron E2E；旧目标由受控无 `d` 单测覆盖，真实浏览器/桌面验收在当前 system Chrome 与 Electron `~42.1.0` 完成。
- 根 ESLint 的 ESM package-type 提示、E2E non-null assertion warning、Muya 既有正则量词 warning 和 build 的 CodeMirror 分块 warning 均无可观察产品风险，记录后不扩大本票。

本轮实现与独立静态复审均未留下阻断问题。
