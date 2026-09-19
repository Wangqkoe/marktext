# Muya HTML preview 固定 DOMPurify 配置诊断（2026-09-19）

结论：独立预览清洗实例的 `setConfig(PREVIEW_DOMPURIFY_CONFIG)` 确实缩短了 **HTMLPreview 清洗本身**，但这次有界 A/B 未证明文档打开或切换变快。暂不据此提交产品优化。两组各仅 2 次，以下均为原始值，不作稳定收益百分比推断。

## 测量边界

- 基线提交 `1dde81b11f1f84d4d848f5138e9b7b954e792e6f`；Windows 10.0.26200、i7-10700；同一 Electron 生产构建，通过诊断开关在 HTMLPreview 内选择 baseline/candidate。每轮新启动应用，先打开 12 个 HTML 块暖机，再计时打开大文档和返回该文档的 tab 切换。
- 夹具复用 `source-cursor-response-perf.spec.ts` 的合成文献报告生成器，硬校验 9,309 行、626,129 字节。实际每次创建 1,200 个 HTML preview（顶层块 3,004 个），每样本 1,200 次预览清洗。
- `sanitizeMs` 为 HTMLPreview 路径逐次同步清洗累计；`createMs` 为 HTMLPreview.create 累计，**包含**清洗、DOM 解析和写入，二者不可相加。`elapsedMs` 从渲染进程发出打开/切换动作，到尾部 `Cross check` 标题出现并经过两帧，包含文件/IPC/整篇解析与渲染。
- candidate 只把 HTMLPreview 的清洗改为独立 DOMPurify 实例，并对该实例一次 `setConfig`；仍执行原来的 `escapeHTML` / `escapeInBlockHtml`。共享清洗实例、导出路径和 `isValidAttribute` 均未改。两变体使用同一个带插桩构建，暖机后才计时。
- 专用 worktree 的 `@muyajs/core` junction 原指向主仓，首次预检因探针未入 bundle 而得到 0 调用，已判为无效且**不计入数据**。复现 patch 中的临时 renderer alias 保证两个变体都读取专用 worktree 的 Muya 源；构建产物已确认包含探针，随后所有正式样本均为 1,200 调用。

## 原始结果（毫秒）

| 变体 | 轮次 | 动作 | 端到端 `elapsedMs` | 预览清洗 `sanitizeMs` | 预览创建 `createMs` |
| --- | ---: | --- | ---: | ---: | ---: |
| baseline | 1 | open | 5225.1 | 473.2 | 657.7 |
| candidate | 1 | open | 4418.4 | 167.4 | 312.2 |
| baseline | 2 | open | 4091.9 | 279.3 | 393.0 |
| candidate | 2 | open | 4278.2 | 149.0 | 275.0 |
| baseline | 1 | switch | 3796.2 | 304.9 | 424.9 |
| candidate | 1 | switch | 3877.0 | 138.8 | 261.8 |
| baseline | 2 | switch | 3593.8 | 241.9 | 342.9 |
| candidate | 2 | switch | 3925.7 | 139.8 | 259.6 |

清洗累计在两个动作的每一轮都下降，但打开一轮快、一轮慢；切换两轮候选均更慢。可能有未控制的整篇解析/布局/进程状态波动；本实验不支持把清洗局部节省直接推算为用户可见收益。

## 输出、安全与收尾

- 真实 Electron 路径的小夹具覆盖 `details open` / `summary`、图片、`javascript:` URL、允许的 `sms:` URL、事件属性和 `<script>` XSS。baseline 与 candidate 的清洗字符串数组逐字相同，预览 HTML SHA-256 同为 `e1b4ca574202edaae6fe1fd81e03c665da62ae6f84873392833fcebdce14841d`；styled HTML 导出 SHA-256 同为 `08eb4e9f12ea537247171ef6241e40fb9331e0f1fc04ad84c5851964e5e7c3ed`。恶意 URL、事件属性和脚本节点断言均通过。
- 两变体的诊断 E2E 均通过；测后撤去所有 HTMLPreview 插桩和临时 alias，无插桩生产构建通过，构建输出不含探针标记。仓库不保留产品修改，也未推送。
- 原始 JSON：`E:/Program Files/Marktext-performance-evidence/2026-09-19-html-config/baseline.json` 和 `candidate.json`。诊断测试见 [`html-preview-config-diagnostic.spec.ts`](../../packages/desktop/test/e2e/html-preview-config-diagnostic.spec.ts)；复现临时改动见 [`html-config-reproduction.patch`](html-config-reproduction.patch)，先在该基线的独立 worktree 应用 patch 并构建，设置 `MARKTEXT_HTML_CONFIG_DIAGNOSTIC=1`、`MARKTEXT_HTML_CONFIG_VARIANT=baseline|candidate`、`MARKTEXT_HTML_CONFIG_OUT=<路径>` 后分别运行该 E2E。测试默认跳过。
