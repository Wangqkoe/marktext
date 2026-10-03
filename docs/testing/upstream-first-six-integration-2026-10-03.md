# 前六项上游修复接入验收（2026-10-03）

## 接入范围

从产品基线 `f919b0867700169c54bbb7cc24bc79fe196fcca8` 按顺序接入：

1. `bd237262184776cb533cbba158fe44658b87ab76`：多行文本转标题时保留全部行。
2. `f10f817afb70d054c8dbcc5e7fe5b2f24238f354`：修复剪切到嵌套 code/math/html 及语言输入框选区时的状态丢失。
3. `dd5ebdfcef95cdde8c97ebe8b2e98f7adfde72bc`：Find 切换匹配时只重绘前后活跃块。
4. `8b94f6f90ce9d353c67dd5860fdb33def0748162`、`c754f2c6330e9f917b0ef50850d83de8fa99526a`：迭代式 `deepClone` 及避免测试 matcher 自身栈溢出。
5. `1d3025b2b6306613a6fa0f822ba9bcaf8890b094`：用 Vue `markRaw` 保存 CodeMirror 实例。
6. `cc718757992a08a203e106bbabbc5c7bd7c73f2b`：按 UTF-16LE 解码 Windows `FileNameW`。

所有摘取提交均保留 `cherry-pick -x` 来源，没有推送远端。

## 本地必要适配

- `sourceCode.vue` 的冲突只加入 `markRaw` import，并包装实际的 `codeMirror(container, codeMirrorConfig)` 返回值。保留本地构造期 `mode: 'markdown-math'`、scope、tab、监听、光标、滚动和 handoff 逻辑；未恢复上游旧上下文中的构造后 `setOption('mode', ...)`。
- 产品基线的 `_changeHeadingLevel` 缺少上游父版本已有的 Setext 识别，导致新增回归中 Setext h2 被当作段落升级为 h6。最小加入 `isSetextHeadingState` 判定，不带入父版本其他段落命令或嵌套容器改动。
- `issue-4921` 上游测试原用的 `mt::update-file` IPC 在当前工作区路径中不会生效：`LISTEN_FOR_FILE_CHANGE` 检测到 `workspaceFor(this)` 后会直接返回。Electron E2E 因此改用真实文件写入，经过 watcher、DocumentIO、workspace projection 和 `sourceCode.vue` props watch 后调用 `editor.value.setValue`；仍验证粘贴成功、CodeMirror 行树父子 identity 和无 renderer error。测试结束使用现有 `closeDiscardingChanges` 清理 dirty 文档。
- 新增单元测试直接调用 `registerShellHandlers()` 注册的 `mt::clipboard::guess-file-path` handler，并 mock Electron clipboard，覆盖中文/非 ASCII、NUL 分隔多路径首个非空项、空 Buffer 和非 Windows 平台保护。
- 现有真实 SFC 编译测试补充 `markRaw` stub，以匹配 `sourceCode.vue` 的新增导入。

## 依赖解析核验

验证期间将仅工作树的 desktop 依赖入口临时隔离，普通依赖仍复用已安装依赖，workspace 包明确指向当前工作树。以下 realpath 在 desktop 构建和 Muya E2E 前均得到：

```text
C:\Users\1407\.codex\worktrees\verify-upstream-first-six\Marktext\packages\muya\src\index.ts
```

因此 desktop build 和 Muya E2E 使用的是本分支 Muya 修复源码。临时 Vitest allow 配置仅用于允许读取 Junction 指向的已安装 CSS 依赖，验证后已删除，未进入产品配置。

## 实际验证

- 五个 Muya 定向回归文件：`17 passed`。首轮为 `16 passed / 1 failed`，补齐上述 Setext 前提后全绿。
- `pnpm --filter @muyajs/core test` 的限并发首跑：`215 files passed / 6 failed`，`1469 tests passed / 1 failed`。六个失败文件均因 Vite 拒绝 Junction 真实路径下的 `github-markdown-css` 或 `katex` `?inline` 文件（`Denied ID E:/Program Files/Marktext/node_modules/.pnpm/...`）。使用不提交的临时 `server.fs.allow` 配置仅复跑这六个受阻文件：`6 files passed, 22 tests passed`。这是全量首跑加受阻文件定向复核，不记作单次全绿运行。
- `pnpm --filter marktext test:unit`（通过临时 allow 配置处理同一 Junction 边界，`--maxWorkers=2`）：`81 files passed`，`1075 passed / 1 skipped`。
- `pnpm --filter @muyajs/core lint:types`：通过。
- `pnpm --filter marktext typecheck`：通过。
- Muya 变更源码定向 ESLint：通过。desktop 变更文件定向根 ESLint：`0 errors`；三个 Muya E2E 文件按仓库既有 ignore 规则产生 ignored-file warning。
- `pnpm build`：通过；main `503 modules`、preload `3 modules`、renderer `5889 modules`。仅有既有动态/静态 import 分块 warning。
- Muya Chromium E2E：三个新增文件共 `5 passed`，覆盖多行标题保存、嵌套块剪切后继续编辑、语言输入框到自身代码选区的 paste/type 后继续编辑。
- desktop Electron E2E：`source-mode-entry.spec.ts` 为 `5 passed`；适配后的 `issue-4921-codemirror-tree.spec.ts` 单独复跑为 `1 passed`。
- 新增 Windows clipboard handler 测试与现有真实 SFC 编译测试定向运行：`2 files passed, 14 tests passed`，且随后包含在 desktop 全 unit 中再次通过。

未运行全部 Electron E2E 矩阵，也未下载 Firefox/WebKit；本次只运行验收要求的 Windows Chrome/Chromium 和 Electron 覆盖。未发布、未打包安装器、未推送远端。
