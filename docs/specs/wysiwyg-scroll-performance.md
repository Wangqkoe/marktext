# WYSIWYG 滚动性能规格

- Status: ready-for-agent
- 确认日期：2026-09-06
- Baseline: `01a3008b8f21a2622deea5985d60dd714b51803a`

## Problem Statement

当前 WYSIWYG 长文档在滚动时会出现明显长帧，标题越多越严重。现有实现已经把同一 renderer animation frame 内的重复滚动报告合并，但仍会在连续滚动期间按帧将 `scrollTop` 提交给 workspace；每次提交都会发布完整 projection，并使 Outline 的 TOC 数据和树节点参与更新。用户看到的是原生滚动位置已经改变，但主线程仍周期性承担与标题数量相关的全局状态和 Outline 更新，因而感觉不如 Chromium 网页滚动顺滑。

已安装版本的因果对照表明，这不是所有滚动区域共用的帧率上限，也不是页面高度本身造成的问题：400 个标题的 WYSIWYG 夹具三轮中位数长帧率为 17.05%，1,000 个标题时为 19.64%；等高纯正文夹具为 0%；只移除 WYSIWYG 的 workspace 滚动报告后，1,000 个标题夹具也降为 0%。Files、Folder tree、Outline 和多种特殊滚动交互没有复现同一瓶颈。Source 大文档容量和大量 Opened Files 的压力是另外两类待调查问题。

本规格需要在不改变 Chromium 原生输入、既有程序化跳转语义、View 所有权和数据安全边界的前提下，消除连续 WYSIWYG 滚动对 workspace projection 和 Outline 的逐帧压力，并保证用户结束滚动或切换生命周期时不会丢失最终位置。

## Solution

WYSIWYG 的原生滚动容器直接持有并呈现每个 View 的 **Live Scroll Position**。滚轮、触摸板和物理滚动条拖动继续由 Chromium 原生处理，不增加自定义惯性、插值、输入延迟、滚动曲线或全局滚动引擎。

连续原生滚动期间不逐帧发布 workspace projection。最后一次原生滚动事件后约 150 ms 没有新事件时，将该 View 的最新 Live Scroll Position 一次性更新为 **Committed Scroll Position**。提交相同数值不产生 workspace notification；滚动位置提交本身也不重建 Outline。Outline 仅在标题结构或标题文字实际变化时更新，纯滚动、光标变化和选择变化均不触发 TOC 重建。

在标签切换、编辑模式切换、Split Right、Move to Left/Right、Move to New Window、关闭标签页、关闭窗口、编辑器卸载或刷新等可能替换、转移或销毁当前 surface 的操作前，系统必须直接捕获当前 surface 的 Live Scroll Position，使生命周期操作使用最终可见位置，而不等待 150 ms idle timer。Split Right 在命令执行时继承捕获到的位置，此后左右两个 View 各自拥有独立的 Live Scroll Position 和 Committed Scroll Position。

TOC、搜索、typewriter 等现有程序化滚动动画在动画期间不逐帧提交；动画正常结束时提交一次最终位置。恢复或动画的最终位置与当前 Committed Scroll Position 相同时，不产生通知。若当前 lease 的普通 idle 提交因短暂 workspace mutation 被拒绝，系统只保留最新值并进行有界重试；旧 lease、旧 surface 或迟到 callback 永远不能覆盖后继 View。生命周期捕获优先于普通 idle 提交，并必须与现有内容、历史记录和持久化所有权隔离。

所有 renderer 滚动与滚轮交互继续遵守 **Scroll Performance Contract**：共享测量词汇、规模夹具、输入覆盖和验收矩阵，但按各 surface 的原生纵向滚动、标签栏横向滚动、图片缩放、键盘定位等语义分别实现。本规格只修复已有因果证据支持的 WYSIWYG 路径。

## User Stories

1. As a WYSIWYG 用户, I want 滚轮滚动由 Chromium 原生容器即时响应, so that 文档位置与输入直接对应且没有额外惯性或延迟
2. As a 触摸板用户, I want 连续手势只改变当前 View 的 Live Scroll Position, so that 高频输入不会逐帧触发全局 workspace 更新
3. As a 滚动条用户, I want 拖动物理 thumb 时页面与指针 1:1 跟随, so that 直接定位长文档不会被自定义动画干扰
4. As a 长文档用户, I want 连续滚动期间不发布 workspace projection, so that 标题数量不会把每个滚动帧放大成全局渲染工作
5. As a 长文档用户, I want 停止原生滚动约 150 ms 后只提交最新位置, so that 当前会话仍能恢复到我最终停下的位置
6. As a 用户, I want 相同的滚动位置不产生 workspace notification, so that 无变化的恢复、事件或动画不会造成多余工作
7. As a 使用 Outline 的用户, I want 纯滚动不重建 TOC 或 Outline 节点, so that 隐藏或显示的大纲都不会拖慢正文滚动
8. As a 编辑用户, I want 光标和选择变化本身不重建 Outline, so that 与标题内容无关的交互保持轻量
9. As a 修改标题的用户, I want 标题结构或标题文字真正变化时 Outline 正常更新, so that 性能优化不会让大纲内容过期
10. As a 切换标签页的用户, I want 切换前捕获 outgoing View 的 Live Scroll Position, so that 立即切走也不会丢失最后一次滚动
11. As a 切换 WYSIWYG/Source 模式的用户, I want 模式切换前捕获当前 surface 的最终位置, so that 过渡使用确定且最新的 View 状态
12. As a 使用 Split Right 的用户, I want 执行命令时右侧 View 继承左侧最新可见位置, so that 新视图从我正在阅读的位置开始
13. As a 使用 Split Right 的用户, I want 拆分后的两个 View 独立滚动和提交, so that 一侧滚动不会移动或覆盖另一侧
14. As a 使用 Move to Left/Right 的用户, I want 移动前捕获该 View 的最新位置, so that View 换 pane 后仍保持阅读连续性
15. As a 使用 Move to New Window 的用户, I want 转移前捕获该 View 的最新位置, so that 新窗口从原窗口最后可见的位置打开
16. As a 关闭标签页的用户, I want 关闭前处理尚未 idle 的最终位置, so that 生命周期结束不会留下迟到的滚动回调
17. As a 关闭窗口的用户, I want 窗口销毁前完成当前 surface 的最终捕获, so that 关闭流程不会与待执行的 idle 提交竞争
18. As a renderer 生命周期维护者, I want 编辑器卸载或刷新前捕获 Live Scroll Position, so that surface 替换不会丢值或把旧值写给后继 View
19. As a 使用 TOC 跳转的用户, I want 既有程序化滚动动画保持原有视觉语义且只在结束时提交一次, so that 导航顺滑而不会逐帧发布全局状态
20. As a 使用搜索跳转的用户, I want 搜索定位动画只提交最终位置, so that 定位结果正确且动画过程不会重建 Outline
21. As a 使用 typewriter 或其他既有程序化定位的用户, I want 动画中间值留在 surface 内, so that 自动定位不会重新引入逐帧 workspace 压力
22. As a 用户, I want 被短暂 workspace mutation 拒绝的 idle 提交只保留最新位置并有界重试, so that 系统繁忙时既不丢最终值也不形成无限任务
23. As a 多 View 用户, I want 旧 lease、旧 surface 和迟到 callback 被拒绝, so that 先前 View 的滚动不能覆盖当前 View
24. As a 文档用户, I want scroll-only 捕获不携带旧 Markdown、history 或 dirty 状态, so that 滚动优化不会导致内容丢失或错误持久化
25. As a 用户, I want Committed Scroll Position 只保证当前应用会话内的连续性, so that 本次修复不会悄悄改变重启或崩溃恢复产品语义
26. As a MarkText 维护者, I want 所有滚动区域共享 Scroll Performance Contract 和验收矩阵, so that 不同交互可以用一致证据比较而无需共享运行时实现
27. As a MarkText 维护者, I want WYSIWYG、Source、Files、Outline、Search、Preferences、Opened Files、标签栏和特殊滚轮交互按各自语义测试, so that 一个区域的修复不会通过全局拦截破坏其他区域
28. As a Windows 验收人员, I want 分别人工测试滚轮、可用时的触摸板和物理滚动条 thumb, so that 自动化无法模拟的真实输入路径得到覆盖
29. As a 跨平台用户, I want Linux/macOS 未测试状态被明确记录, so that Windows 结果不会被误报为跨平台结论
30. As a 发布负责人, I want 安装版 400 标题夹具达到已确认的长帧阈值, so that 修复以用户实际运行的应用而非仅开发构建作为性能证据

## Implementation Decisions

- WYSIWYG 原生 scroll surface 是 Live Scroll Position 的唯一实时所有者；workspace 只持有 Committed Scroll Position。两者允许在活跃滚动期间短暂不同步。
- 原生滚动输入和 Chromium scroll physics 保持不变。不得安装接管 wheel/touchpad/thumb 的统一输入层，不得增加 `smooth` 行为、自定义惯性或逐帧插值。
- 普通原生滚动使用约 150 ms trailing idle 边界。每个当前 View 只保留最近的 Live Scroll Position，idle 到期后最多尝试提交该最终值；新事件会取代旧候选并重新开始 idle 等待。
- Live Scroll Position 的变化不发布 workspace projection。idle commit 只更新该 View 的 Committed Scroll Position，并且相同值是无通知的 no-op。
- scroll-only 更新不得导致 Outline/TOC 派生数据重建。TOC 更新以标题结构或标题文字是否真正变化为依据，而不是以 facade、projection、光标、选择或 scroll snapshot 的对象身份为依据。
- 生命周期捕获是一个明确的同步所有权边界，覆盖标签切换、模式切换、Split Right、Move to Left/Right、Move to New Window、关闭标签页、关闭窗口、编辑器卸载和刷新。操作开始时直接读取当前 surface，优先于 pending idle 候选，并使已排队的旧 callback 失效。
- Split Right 使用命令边界捕获到的最新位置初始化新 View；创建完成后，各 View 的 Live Scroll Position、Committed Scroll Position、光标和模式继续保持 View 级独立。
- 程序化滚动动画不复用原生输入的 idle 节流来逐帧报告。动画期间位置由 surface 持有，动画结束时提交一次最终值；取消、替换和 same-value 结果不得产生迟到或重复通知。
- 临时 workspace mutation 只允许当前 lease 的最新 idle 候选进行有界重试，并且任一时刻不得累积无界 frame/timer。永久 fence、旧 lease、已卸载 surface 和被后继 generation 取代的请求不得重试。
- 生命周期最终捕获必须只携带有限数值的滚动位置。它不能携带 Markdown、portable history、dirty 状态或其他完整 editor report，也不能创建错误的 DocumentIO 写入或 crash draft。
- Committed Scroll Position 是 session-only 状态。本规格不增加跨应用重启或崩溃后的滚动位置持久化。
- 所有 surface 共享 Scroll Performance Contract、测量工具、规模夹具、输入分类和验收记录；原生纵向滚动、标签栏横向滚动、图片缩放和键盘 `scrollIntoView` 等仍保留各自实现与语义。
- 当前实现范围只包含有因果证据的 WYSIWYG 滚动报告、workspace scroll-only 状态发布和 TOC/Outline 派生更新路径。不得借本规格建立统一 runtime scroll engine，也不得顺手重构其他 renderer 滚动容器。
- Source 大文档容量和大量 Opened Files 的压力分别进入独立调查票据；它们不阻断本规格达到 WYSIWYG 验收标准后的安装包验收。

## Testing Decisions

- 测试优先验证用户可观察行为和所有权契约，不断言私有函数形状、具体定时器实现或代码所在位置。最高层真实 renderer 行为负责证明原生输入、可见位置、workspace convergence 和 Outline 稳定性；较低层只补充 UI 时序难以确定覆盖的并发与生命周期安全。
- 主要 seam 是真实 Electron renderer E2E。测试从实际 WYSIWYG scroll container 驱动原生等价滚动、Playwright wheel 和现有程序化导航入口，并通过 production workspace snapshot 观察 Live/Committed 结果及 projection revision。
- Electron E2E 必须确定性证明：连续滚动期间 DOM 位置立即变化而 Committed Scroll Position 不逐帧变化；最后事件后约 150 ms 只提交最终值；same-value 不发布；滚动期间没有 workspace projection 发布；scroll-only idle commit 不替换或重建 Outline/TOC 节点。
- Electron E2E 必须覆盖 TOC、搜索和 typewriter 等实际程序化动画入口，证明动画视觉语义不变、过程中不逐帧提交、结束时只提交一次最终值；same-value 或被替换动画不产生迟到通知。
- 辅助 seam 是 WorkspaceController 与真实 pane composition 的单元/组合测试。该 seam 覆盖标签/模式切换、Split Right、Move to Left/Right、Move to New Window、关闭、卸载和刷新前的最终捕获，以及两个 Split Right View 的位置隔离。
- 单元/组合测试必须覆盖：临时 mutation 只重试当前 lease 的最新值；有界调度不会累积；旧 lease、永久 transfer fence、disposed surface 和强制触发的迟到 callback 不覆盖后继 View；进行中的 adapter flush 与生命周期捕获按最新观察顺序线性化。
- 单元/组合测试必须证明 scroll-only 最终捕获不能携带 stale Markdown/history，不能错误写入 DocumentIO 或 crash draft，同时内容、历史和其他安全字段在并发 flush 中仍按既有契约应用。
- 既有 renderer scroll E2E、scroll report frequency 测试、workspace runtime/composition 测试、TOC 导航、Source TOC 导航和 scroll-up-arrow 场景是 prior art。新断言应扩展这些最高层 seam，不为相同行为建立第三套测试接口。
- 自动化硬门槛包括一项确定性回归测试：活跃 WYSIWYG 滚动不得发布 workspace projection，也不得触发 TOC/Outline 重建。该门槛必须能在不依赖主机帧率的情况下稳定失败于旧行为、通过于新行为。
- 安装版性能验收使用 400 标题 WYSIWYG 夹具，运行三轮并取每轮 `>50 ms` frame-gap 比例的中位数；通过标准为中位数不超过 5%。运行前记录空闲 requestAnimationFrame cadence，确认 50 ms 阈值能区分空闲 cadence；若环境 cadence 使固定阈值失真，必须记录等价校准、环境和原始数据，不得只凭肉眼或单轮结果判定。
- Windows 人工验收必须在安装版上分别覆盖鼠标滚轮、可用时的物理触摸板和物理 scrollbar thumb，验证长标题文档中输入 1:1 跟手、停止后不额外续滑、切换/拆分/移动/关闭后位置正确，并抽查矩阵内其他 surface 未受全局回归影响。
- Scroll Performance Contract 验收矩阵至少记录 WYSIWYG、Source、Files/Folder tree、Outline、Search、Preferences、Opened Files、标签栏横向滚动、图片 viewer 缩放、命令面板及其他可滚动 popup。矩阵统一记录 fixture 规模、输入语义、空闲 cadence、frame gaps、响应延迟、平台和限制，但每个 surface 使用适合自身交互的运行路径。
- Linux/macOS 的物理输入和安装版性能在本轮标为未测试，不把 Windows 结果外推为跨平台通过；后续具备对应环境时按同一 Scroll Performance Contract 补测。

## Out of Scope

- 建立所有 renderer surface 共用的 runtime scroll engine、输入拦截层或滚动物理实现。
- 改变 Chromium 原生 wheel、touchpad、scrollbar 行为，或改变现有 TOC、搜索、光标、typewriter 和 Source 导航的动画语义。
- 为 Committed Scroll Position 增加跨应用重启、崩溃或新会话恢复。
- 在本规格中修复或重新设计 Source 10,000/50,000 行的大文档加载、DOM materialization 或滚动容量问题。
- 在本规格中修复 100 个及更多 Opened Files 时的加载或滚动压力。
- 优化没有独立失败证据的 Files、Folder tree、Outline 容器、Search、Preferences、标签栏、图片 viewer、命令面板或 popup；这些区域只参与共享验收矩阵和回归抽查。
- 解决与本因果链无关的既有 scroll-up-arrow 基线问题。
- 声称 Linux 或 macOS 已通过人工或安装版验收。

## Further Notes

- 本规格遵循 [Scroll Performance Contract ADR](../adr/0001-scroll-performance-contract.md)：统一的是证据、术语和验收，不是 runtime engine。只有至少两个普通滚动 surface 被证明具有相同因果瓶颈，并且一个共同抽象能实测改善二者时，才重新考虑共享运行时。
- 术语以根目录 [domain glossary](../../CONTEXT.md) 为准：View 是文档的一次呈现；Live Scroll Position 是 surface 当前显示的位置；Committed Scroll Position 是当前应用会话内为 View 记录的位置。
- 已有 profile 的关键对照是：WYSIWYG 400 headings 的 `>50 ms` 长帧率三轮中位数 17.05%，1,000 headings 为 19.64%；等高无 headings 夹具为 0%；只禁用 WYSIWYG workspace scroll report 后 1,000 headings 为 0%。完整历史计数、overflow inventory 和环境限制见 [desktop renderer scroll profile](../testing/desktop-scroll-profile.md)。
- 本规格 supersedes 历史 T06 的“连续滚动中同一 animation frame 至多一次 report/commit”作为最终性能目标。T06 的同帧合并、same-value no-op、lease fencing、unmount flush 和持久化隔离验证仍是有效的阶段性证据与安全基线；新目标是在活跃原生滚动期间不发布 workspace projection，并在 idle 或生命周期边界提交最终位置。
- 规格发布为仓库内 `ready-for-agent` 文档；本轮不创建或发布实现 ticket。
