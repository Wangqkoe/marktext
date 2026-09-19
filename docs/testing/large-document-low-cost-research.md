# 大文档低成本优化调研（2026-09-19）

基线：`99301a04135a9d9126ce09cc8b998712c1ab8985`。仅查一手资料并静态对照本仓库；本文没有改产品代码，也没有运行新性能实验。下文“官方事实”“本地现状”“待测推断”刻意分开，外部项目的数字不移植为 MarkText 收益。

## 已有证据和约束

- 已完成的 Source 纯 cursor/selection workspace 通知快速路径，在一份 9,309 行、626,129 字节夹具上，Arrow 中位数约 127→17 ms，Shift selection 约 171→66 ms，Insert 约 212→203 ms。插入改善不能成立；单次会话及机器的限制见 [本地验收记录](source-cursor-view-state-fastpath.md)。因此后续优先找输入时的全文处理、Source 绘制或 WYSIWYG 重复工作，而非再优化同一 cursor 通知。
- Source 使用 CodeMirror 5.65.21，构造选项位于 [`sourceCode.vue`](../../packages/desktop/src/renderer/src/components/editorWithTabs/sourceCode.vue)；WYSIWYG 是 Muya。用户已排除大架构、Source 有限视口、CodeMirror 6 迁移；`content-visibility: auto` 虽曾缩短打开/切换时间，却破坏滚动恢复和 TOC，不再主推。
- [CodeMirror 5 手册](https://codemirror.net/5/doc/manual.html)明确 `viewportMargin: Infinity` 会让全文件始终渲染，对大文档性能不利。本项目却以它配合外层 `.source-code` 滚动和 TOC 定位，[`sourceModeToc.ts`](../../packages/desktop/src/renderer/src/util/sourceModeToc.ts)及 [`source-toc-scroll.spec.ts`](../../packages/desktop/test/e2e/source-toc-scroll.spec.ts)都体现这个契约。改回有限视口不是“改一个参数”，暂不纳入候选。

## 建议按这个顺序做小实验

| 顺位 | 小改动 / 假设 | 本地命中点与必要边界 | 最小验证（先测后实现） |
| --- | --- | --- | --- |
| 1 | 仅在输入 profile 证实 UI 适配层克隆占比高时，去掉**已冻结快照**在该层的重复深拷贝；不碰 controller 的所有权保护。 | [`controller.ts#getFacadeSnapshot`](../../packages/desktop/src/renderer/src/workspace/controller.ts) 对 history 等做必要克隆并冻结返回值；其后 [`store/editor.ts#APPLY_WORKSPACE_PROJECTION`](../../packages/desktop/src/renderer/src/store/editor.ts) 又对整个 snapshot `deepClone`＋冻结，再对 `facade.projection` 第二次 `deepClone`＋冻结。同文件 `inertControllerFacadeFile` 逐字段深拷贝，tab 与 currentFile 均会构造 facade file；[`util/index.ts`](../../packages/desktop/src/renderer/src/util/index.ts) 的 `deepClone` 为 JSON 序列化/反序列化。UI 层这些复制可能是额外成本，但需要证明适配层可安全共享已有不可变对象，不能把 controller 的克隆一并删掉。 | 用单字输入 trace 分离 controller、projection mirror、Pinia 适配层耗时；若命中，只做局部不可变引用复用。验收快照不可被 Pinia/组件改写、历史隔离、双窗共享、撤销/重做、保存和持久化；输入中位数和尾部均需复测。 |
| 2 | 为 Muya **预览专用** DOMPurify 实例固定预览配置，避免重复配置解析；不得改现有共享实例的策略。 | [`packages/muya/src/utils/dompurify.ts`](../../packages/muya/src/utils/dompurify.ts) 现已复用一个实例，但预览和导出仍逐次传不同配置，[`packages/muya/src/config/index.ts`](../../packages/muya/src/config/index.ts) 明确两者策略不同。DOMPurify 3.4.11 [源码](https://raw.githubusercontent.com/cure53/DOMPurify/3.4.11/src/purify.ts)的 `_parseConfig` 会复制/处理逐次配置；`setConfig` 路径复用持久配置。[官方 README](https://github.com/cure53/DOMPurify#persistent-configuration) 明确设后忽略逐次参数。因此**仅隔离的新 preview purifier** 可安全试验，导出和 URL 属性检查仍走原实例；新实例成本、调用频次及实际收益都待测。 | 先 profile `sanitize` 的耗时及配置处理占比，只在大量 HTML block 的场景成立时做 A/B。验证 preview 与 export 的所有配置差异、HTML/图片/`details`、恶意 URL、事件属性、XSS 用例；对比渲染 HTML 与现状逐项一致。未证明收益就不增加第二个实例。 |
| 3 | 将 Source `change` 的多次通知按 **同一 CodeMirror operation** 合为一次内容发布；研究 `changes` 事件，先只覆盖批量缩进、替换、粘贴等确有多个 `change` 的动作。 | [`sourceCode.vue`](../../packages/desktop/src/renderer/src/components/editorWithTabs/sourceCode.vue) 的 `listenChange` 对每次 `change` 运行 `saveContent`；它同步 `getValue()`、全文 `wordCount()`，然后 `reportSource({ markdown, cursor, status })`。这是每次全量工作的直接代码证据，不是已测热点。CodeMirror 官方说明 `change` 在 operation 结束前、DOM 更新前触发，`changes` 在结束后把一次 operation 的更改成数组；[`operation`](https://codemirror.net/5/doc/internals.html)也用于合并显示更新。[手册](https://codemirror.net/5/doc/manual.html) | 先记录每个用户动作的 `change`/`changes` 次数、`getValue`/字数统计/`reportSource` 耗时；仅在多次 `change` 确认存在时改监听。校验最后 Markdown、cursor、status、撤销/重做、跨 tab/双窗共享及崩溃草稿。**普通单字输入仍可能一次事件一次全文处理，不能预计其约 203 ms 会下降。** |
| 4 | 仅对经实测触发阈值的大文档，试验关闭次要 Source 绘制选项，首选 `styleActiveLine`，其次单独试 `lineWrapping`；行号是否可让用户选择，须单独决定。不要一口气关多个。 | 当前 [`sourceCode.vue`](../../packages/desktop/src/renderer/src/components/editorWithTabs/sourceCode.vue) 明确开启 `lineNumbers`、`lineWrapping`、`styleActiveLine`。CodeMirror [手册](https://codemirror.net/5/doc/manual.html)给出这些可配置选项；[VS Code 官方大文件说明](https://code.visualstudio.com/updates/v1_15#_large-file-support)以选择性关闭 tokenization、line guides、wrapping/folding 为先例，但那是另一编辑器、30 MB/30 万行阈值和内存案例，**不能把它的“最高 50%”移植到 626 KB MarkText 文件，也不能照搬阈值**。 | 同夹具逐项 A/B：打开时间、Source↔WYSIWYG 切换、箭头/Shift/插入响应、滚动、内存；分别验证长行、RTL、光标可见性、折行视觉、行号及 TOC。若可见能力损失大于实测收益即撤销。 |

顺位 1 有上一轮发布链诊断线索，但输入路径占比尚未测出，必须只动 UI 适配层而不改变 controller ownership；顺位 2 仅命中含 HTML 的内容且有安全敏感性；顺位 3 只可能省去同一 operation 中的重复工作；顺位 4 是低代码成本但有功能代价的试验。任何实现均须保留内容即时可靠发布，不能仅为缩短输入响应就把完整 Markdown 提交延迟到可能丢失的后台定时器。

## 排除和谨慎使用的建议

- **CodeMirror 高亮参数不是现成神奇开关。** [手册](https://codemirror.net/5/doc/manual.html)说明 `workTime` / `workDelay` 控制伪后台高亮的工作/休息片段，但手册写的 200 / 300 ms 默认值已与本项目所装 5.65.21 [官方版本源码](https://raw.githubusercontent.com/codemirror/codemirror5/5.65.21/src/edit/options.js)不一致：该版本是 **100 / 100 ms**。该版本 `maxHighlightLength` 默认 10,000，长行超限按纯文本处理；`flattenSpans` 默认开启并合并同类 token 以减少 DOM。更重要的是同步初建行内容仍可能取样式，调后台预算不能根治 `viewportMargin: Infinity` 的全 DOM 建立。仅在 trace 指向后台高亮时再试预算；已有保护性默认值不能写成“打开即可加速”。
- **不要给现有 DOMPurify 共享实例直接 `setConfig()`。** Muya 的预览/导出策略不同，桌面端 [`util/dompurify.ts`](../../packages/desktop/src/renderer/src/util/dompurify.ts)也按调用传策略。官方 [Persistent Configuration](https://github.com/cure53/DOMPurify#persistent-configuration)明确 `setConfig()` 后逐次传给 `sanitize()` 的额外选项被忽略。顺位 2 因此限定为隔离预览实例，不能关清洗或放宽 URL/标签策略来换性能。
- **HTML preview 相同字符串不可简单早退。** [`htmlPreview.ts`](../../packages/muya/src/block/commonMark/html/htmlPreview.ts) 的 `update` 确会重新清洗、解析、写 DOM；但 [`html/index.ts#_exitSourceEditing`](../../packages/muya/src/block/commonMark/html/index.ts)明确强制重建用于丢弃用户点击产生的原生 `details` 开关状态，并恢复 HTML 中 authored `open` 属性。即使字符串相同也可能必须重建，不能作为低成本主推。只有把刷新原因和状态语义拆清、且 profile 证明重复调用昂贵，才可重新考虑。
- **没有目标调用栈就不做通用布局重排。** [Chrome Forced Reflow 文档](https://developer.chrome.com/docs/performance/insights/forced-reflow)和 [web.dev](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)建议避免写后读、批量先读后写；这是一手通用机制，不是 MarkText 已证实热点。若 trace 指到某条局部路径，再评估最小调整；不要为此大范围重写 Muya 渲染。
- **不做 Source 有限视口、CM6 迁移、全应用虚拟化或 `content-visibility: auto` 重推。** 有限视口虽有 CodeMirror 明确的性能动机，却与当前 TOC/外层滚动/查找行为和用户约束冲突；其余工程或已知回归不符合当前“低成本”目标。

## 验收口径

采用现有 [`source-cursor-response-perf.spec.ts`](../../packages/desktop/test/e2e/source-cursor-response-perf.spec.ts)及 `source-cursor-view-state-fastpath.md` 夹具作为可比基线；增加针对候选动作的独立计数/trace，不把插入、纯移动和批量编辑混成一个指标。固定机器、构建、文件、暖机及重复次数，并报告中位数与尾部值。功能回归至少覆盖 Source 输入/IME、撤销重做、WYSIWYG 切换、保存/崩溃草稿、双窗共享、TOC 定位、滚动恢复，以及 HTML 原样显示和 XSS 策略。只有收益可复现且无数据正确性或核心行为退化，才考虑将小实验产品化。
