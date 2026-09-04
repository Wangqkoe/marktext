# 桌面 UI 与文件夹导航优化 Spec

> 历史冻结规格：本文的既有 Move/Open/Split 组保留当时术语。旧 Split 移动动作的后续名称与真正的同文档 Split Right 见 [Move tabs 与 Split Right 规格](move-tabs-and-split-right.md)；不改写本阶段原验收范围。

- 状态：用户已确认，待实现
- 最终确认日期：2026-08-31
- 基线：`6bd21820029885e08ae8e4938cede71ad9ae30ca`
- 产品证据：`codex/prototype-sidebar-spacing-divider`，提交 `c48bd27e`、`924bd80e`

## 1. 目标

本阶段在不改变 Markdown 数据语义的前提下，改善编辑器窗口、Files/Outline 导航和 renderer 滚动体验：

1. 为 Windows/Linux 编辑器窗口增加紧凑而完整的 Concise 标题栏。
2. 采用已确认的 Files 视觉层级，并修复 Outline 的换行设置。
3. 提供安全、彻底但不关闭文档的 Close Folder 生命周期。
4. 让标签页与 Opened Files 使用同一份完整菜单契约，并支持按文档父目录打开/关闭 Folder。
5. 在 Files/Outline 内提供轻量的行内导航过滤，同时保留正文 Find in Folder。
6. 消除所有 renderer 滚动容器的明显卡顿，保持原生直接跟手。
7. 修复数字、日期、LTR/RTL 混合文件名在标题栏中的视觉倒序。

成功结果必须可观察：用户能在指定平台选择 Concise；Folder root 关闭后不会复现或被迟到事件恢复；导航过滤行为与本文完全一致；长文档、多标签和密集 Sidebar 中原生滚动不再被同步状态提交拖慢；所有规定文件名均正确显示。

## 2. 术语与产品边界

- **Folder root**：当前编辑窗口附着并显示在 Files 中的根目录。产品文案、Spec 和验收统一使用 Folder/Folder root，不使用 Project。
- 当前源码中的 `project`、`projectTree`、`OPEN_PROJECT` 等是历史内部符号；可以继续作为内部实现名，但不得泄漏为新增产品术语。
- 除 Concise 明确的平台限制外，Sidebar、Folder 生命周期、菜单、搜索、滚动和标题显示修复均覆盖 MarkText 当前支持的平台。

## 3. 范围

### 3.1 Concise 标题栏

- 保留现有 Custom 和 Native 的行为与名称，Custom 继续为默认值；新增 Concise。
- Concise 仅在 Windows/Linux 的编辑器窗口可选，修改后需要重启生效；macOS 不提供 Concise 选项。
- Preferences 等辅助窗口在选择 Concise 时仍使用现有 Custom 式无边框窗口控件，不显示应用菜单，不变为 Concise 编辑器标题栏。
- Concise 编辑器窗口使用单条、总高精确为 `30px` 的 frameless titlebar：
  - 左侧按现有应用菜单顺序与当前本地化显示 File、Edit、Paragraph、Format、Window、Theme、View、Help。
  - 右侧使用现有最小化、最大化/还原、关闭按钮。
  - 文档标题相对整个窗口宽度精确居中，而不是相对左右剩余空间居中。
- 标题有安全最大宽度，不得覆盖左右交互区。空间不足时先缩短标题，不能折叠顶级菜单。
- 长标题从中间省略并保留扩展名；悬停显示完整标题。
- 点击顶级菜单按钮时，弹出**当前窗口实时 Electron application menu** 的对应 submenu；必须保留当时的 enabled/checked/radio 状态、accelerator 和 submenu 内部原生键盘操作。

### 3.2 Files/Outline 视觉

- 正式实现采用已确认的 prototype A：Files 整个内容区统一增加 `12px` inset。
- Opened Files 与 Folder tree 之间使用主题自适应 `1px` 细线及适度留白。
- inset 只作用于 Files 内容，不作用于 Outline。
- 证据分支仅用于产品判断；正式实现必须在目标分支重新实现，不 cherry-pick throwaway prototype。
- 保留现有 **Wrap text in TOC** 设置及默认值。开启时，Outline heading 随 Sidebar 实际宽度完整换行且无行数上限；关闭时保留现有单行截断/横向行为。

### 3.3 Close Folder

- Folder root 的右键菜单精确分组与顺序为：
  1. New File
  2. New Directory
  3. separator
  4. Close Folder
  5. separator
  6. Copy
  7. Cut
  8. Paste
  9. 后续既有适用项
- Close Folder 仅出现在 Folder root 菜单，不出现在子目录或文件菜单。
- File 主菜单中，Close Folder 紧跟 Open Folder...，两者之间没有 separator；无 Folder root 时 Close Folder disabled。
- 关闭动作必须作为一次完整的 Folder root 生命周期转换：
  - 清除 main `EditorWindow` 当前 root，并停止该 root 的目录 watcher。
  - 清除 renderer Folder tree、选中项、创建/重命名缓存、复制/剪切 clipboard、pending tree events 及其他只属于该 root 的状态。
  - 清除 buffered restore 中的 Folder root，使重启不能恢复已关闭 root。
  - 迟到的旧 root watcher 事件必须被识别并丢弃，不能进入空状态，也不能污染随后打开的新 root。
  - 切换到 Files，保持 Sidebar 可见，显示 Open Folder 空状态。
- 关闭 Folder root 时必须保留：全部 tabs、Opened Files、dirty/unsaved 内容、每个已打开文件自身的 watcher、最近目录列表以及文件/目录选择器的 last path。
- 无 root 时再次 Close Folder 是不可触发状态；如果内部重复请求到达，行为应幂等，不得清空 tabs 或报错。

### 3.4 Tabs/Opened Files 菜单

- Opened Files 仍只展示当前 focused pane 的标签页。
- Opened Files 条目的右键菜单必须与当前 focused pane 标签页使用**同一个菜单构造契约与动作实现**，包括 Move、Open、Split；不得复制两份菜单定义。
- 完整菜单分组为：
  1. 现有 close 组（Close、Close Others、Close Saved Tabs、Close All Tabs）
  2. separator
  3. Open This Folder 或 Close This Folder（二者只显示其一）
  4. separator
  5. Rename、Copy Path、Show in Folder
  6. 既有 Move/Open/Split 组
- 对有磁盘路径的文档，规范化其直属父目录与当前 Folder root；完全相同时显示 Close This Folder，否则显示 Open This Folder。
- untitled 文档没有可用路径，Folder 项 disabled。
- Open This Folder 始终在当前窗口替换 Folder root，不遵循 `openFolderInNewWindow` 偏好。
- Close This Folder 复用 3.3 的同一关闭语义，不能另建弱化版本。
- 菜单动作必须捕获用户实际右击的 pane/view/document；不能在异步回调时改用已变化的全局 `currentFile`。

### 3.5 Files/Outline 行内搜索

#### 共同交互

- 搜索按钮位于 Files/Outline 标签栏右侧。
- 点击按钮，在标签栏下方展开输入框并把原内容向下挤；再次点击或按 Esc 时关闭并清空。
- 在 Files 与 Outline 间切换时，输入框保持打开，但清空 query 并切换 placeholder。
- query 不持久化；不新增快捷键。
- 该按钮在 Files/Outline 上下文中切换行内框，不再作为“进入 Search view”的动作；既有 Edit → Find in Folder 仍进入独立 Search view。正文 ripgrep 搜索和独立 Search view 完整保留，不被改名、替换或复用为本过滤器。

#### Files 过滤语义

- 对 basename 做大小写不敏感子串匹配，搜索范围包含 Opened Files 和 Folder tree 的文件/目录。
- 语法只在 query 开头识别稳定英文关键字，关键字大小写不敏感，prefix 后 trim 空白：
  - 无 prefix：同时搜索文件和目录。
  - `file:`：仅文件。
  - `folder:`：仅目录。
  - 未知 prefix：整段按普通文字搜索。
- 不支持布尔、glob、regex、quotes 或 escape。Files placeholder 必须提示 `file:` / `folder:`；Outline 不使用该语法。
- 无 prefix 时文件优先：
  - 文件命中保留完整祖先并自动展开命中路径。
  - 目录命中默认只显示折叠节点。
  - 同一目录自身和后代文件同时命中时，优先展示文件路径，不重复一个额外的目录结果。
  - 其他仅目录命中保持折叠。
  - 用户手动展开命中目录后，显示该目录原始完整内容。
- `file:` 空 term 显示全部文件及其祖先，并隐藏空目录。
- `folder:` 空 term 显示全部目录，且均为折叠节点。
- 真正空 query 显示未过滤的完整 Files。
- 搜索开始时保存原展开状态；清空或关闭 query 后原样恢复，搜索期间的自动展开不能覆盖该状态。
- 无 Folder root 时：无 prefix 和 `file:` 仍过滤 Opened Files；`folder:` 无结果，同时保留 Open Folder 入口。

#### Outline 过滤语义

- 对 heading 文字做大小写不敏感子串匹配。
- 保留命中 heading 及全部祖先，自动展开命中路径。
- 搜索开始时保存原展开状态；清空或关闭 query 后原样恢复。

### 3.6 全 renderer 滚动性能

- 覆盖 WYSIWYG、Source Code、Files、Outline、Search、Preferences 以及其他 renderer scroll containers。
- wheel、touchpad 与 native scrollbar thumb 必须保持原生、直接、1:1 跟手。
- 不增加 inertia、输入延迟、自定义滚动曲线或自定义 scrollbar；不改变现有 TOC/search/cursor 等程序化跳转动画。
- 已知高可信热点是 WYSIWYG `scroll` 事件重复上报 `scrollTop`，再触发 workspace commit、完整 projection/facade snapshot 克隆和订阅通知。实现必须先用 profile/计数证据确认，再做最小优化；不得假定它是所有区域唯一根因，也不得借机重写所有滚动。
- 自动化频率约束：
  - 未变化的 `scrollTop` 不得产生新的 workspace commit/projection 发布。
  - 连续原生滚动中，同一 renderer animation frame 对同一活动 view 至多上报一次最终 `scrollTop`，并至多触发一次相应 commit/projection 发布。
  - 旧 lease、非活动 view 或已卸载容器的迟到上报仍必须被拒绝，不能污染当前 view。
- 人工验收必须覆盖长文档、多 tabs、WYSIWYG/Source 切换、密集 Files/Outline/Search、Preferences 长页面，并分别使用 wheel/touchpad（设备可用时）和 scrollbar thumb。

### 3.7 数字/日期/双向文字标题显示

- 磁盘 filename 数据本身正确；当前根因是 Custom titlebar 对整段标题使用 `direction: rtl`，导致 Unicode bidi 视觉倒序。
- Custom 与 Concise 都必须正确显示至少以下标题：`123.md`、`2026-08-30.md`、`1.2.3.md`、中文、英文、阿拉伯/RTL、LTR/RTL 混合文件名。
- 保留窄窗时标题尾部/扩展名可识别的产品意图，但不得再使用会把 `2026-08-30.md` 显示为 `md.2026-08-30` 的整段 RTL 技巧。
- 此修复须与 Concise 的中间省略、安全居中共同工作，不得修改磁盘文件名或文档路径。

## 4. 非范围

- Alt mnemonic、用左右方向键切换顶级菜单、打开菜单后悬停切换顶级菜单、顶级菜单 overflow/折叠。
- 改变 macOS 原生/现有标题栏体验，或让 macOS/辅助窗口使用 Concise。
- 改变现有 Custom/Native 行为、默认标题栏选项或不经重启热切换窗口 frame。
- 替换 Edit → Find in Folder、ripgrep Search view，或给行内搜索增加布尔、glob、regex、quotes、escape、快捷键、持久化。
- 自定义滚动条、滚动物理/inertia、全局禁用程序化滚动动画。
- 关闭 tabs、保存或丢弃 dirty 内容、停止文件自身 watcher、清除 recent folders/last picker path。
- cherry-pick 或保留 prototype switcher/throwaway UI。
- 修复原型调试期间发现的既有 `UPDATE_WORD_COUNT` 只读赋值开发态异常。它是记录项；只有成为本功能必需验收的直接阻断时，才由协调任务升级并另行授权最小修复。

## 5. 空、错误与边界行为

- 无 Folder root：Files 显示 Open Folder；File → Close Folder disabled；Folder 搜索遵循 3.5 的无 root 规则。
- 空 Folder root：仍显示 Folder root 与 Close Folder；`file:` 空 term 没有文件结果，`folder:` 空 term 可显示 root 以下目录；普通空 query 保留原空目录状态。
- 空 Outline：输入可打开；任意非空 query 显示无结果；关闭/清空不改变文档。
- 菜单在弹出前实时读取当前窗口菜单；若窗口已销毁或对应 submenu 不存在，则安全地不弹出，不调用其他窗口菜单。
- watcher stop/close 为异步或事件已排队时，旧 root 事件必须通过 root 身份/世代检查丢弃。
- 打开 Folder 失败时保留原 root 及其状态，不进入半关闭/半打开状态；Close Folder 自身不做磁盘删除，不因路径暂时不可访问而失败。
- 路径比较必须用现有跨平台规范化/同路径 seam，处理 Windows 大小写和分隔符差异，不能只比较原始字符串。
- 极窄窗口中顶级菜单与窗口控件保持可操作；标题可缩到最小或隐藏可见文本，但不得覆盖交互区或把菜单折叠。

## 6. 数据安全与并发要求

1. Close Folder 是内存/监听关系变更，绝不删除、移动或覆盖磁盘文件。
2. dirty/unsaved buffers、历史、tabs/panes 和文件 watcher 在关闭/替换 root 前后保持不变。
3. root watcher 必须有可验证的所有权边界；unwatch 后已开始的 `stat/readFile`、排队 chokidar 回调或 renderer pending event 不能写入新 root。
4. 打开另一个 Folder 与关闭当前 Folder 必须串行化或以世代令牌判定最后一次有效转换；不能混合两棵树。
5. buffered state 的 root 清除必须在可接受的持久化边界内完成，并覆盖“立即关闭应用再重启”的测试；不能仅依赖普通 1 秒 debounce 而留下恢复旧 root 的窗口。
6. per-window 菜单动作必须绑定发起窗口，不能使用另一个活动窗口的 root/menu 状态。
7. 菜单/搜索/滚动的异步回调必须保留 pane/view/root/lease 身份验证。

## 7. 可观察验收标准

### 标题栏

- Windows/Linux Preferences 可见 Custom、Native、Concise，Custom 默认不变；macOS 无 Concise。
- 重启后 Concise 编辑器只有一条 30px titlebar；辅助窗口保持 Custom 式 frameless 控件且无菜单。
- 八个本地化菜单按既有顺序显示，右侧窗口按钮工作，标题以窗口中心为基准。
- 修改菜单 checked/enabled 状态后立即从 Concise 打开，弹出菜单状态与当前窗口 Electron 菜单一致；submenu accelerator 与原生键盘导航可用。
- 规定的数字、日期、中英、RTL、混合文件名在 Custom/Concise、正常/窄窗中不倒序；长标题中间省略、扩展名保留、hover 可见全名。

### Folder 与菜单

- root/子目录/文件三种右键菜单逐项比对，只有 root 在指定位置出现 Close Folder。
- File → Open Folder... 后无 separator 紧接 Close Folder；开/关 root 时 enabled 状态实时同步。
- Close Folder 后 tabs、dirty 内容、Opened Files 均原样保留，Sidebar 可见并停在 Files 空状态；编辑/保存打开文档仍正常。
- 在 close 后注入/等待旧 root watcher 事件，不出现旧节点；再打开新 root 也不混入旧节点。
- 关闭应用并重启后不恢复已关闭 root。
- 标签页与 Opened Files 对同一 focused-pane 文档的菜单条目、顺序、enabled 状态和动作结果一致；Move/Open/Split 均可用。
- 文档父目录等于 root 时为 Close This Folder，否则为 Open This Folder；untitled disabled；Open This Folder 总在当前窗口替换 root。

### Sidebar

- Files 的 Opened Files、root 标题、文件与目录行均应用统一 12px inset；两区间有主题自适应 1px 细线和留白；Outline 横向位置不受影响。
- Wrap text in TOC 开启后长 heading 根据 Sidebar 宽度完整多行展示、无行数上限；关闭后为既有单行行为。
- 行内框的位置、展开挤压、Esc/二次点击、Files/Outline 切换清空及 placeholder 均符合 3.5。
- 使用包含同名目录/文件、深层命中、空目录、无 root、untitled、空 term 和未知 prefix 的夹具逐项验证 Files 结果与展开恢复。
- 使用重复/嵌套 headings 验证 Outline 命中、祖先保留、自动展开和清空恢复。

### 滚动

- 自动测试证明 3.6 的 report/commit 频率约束，并证明程序化 TOC/search/cursor 跳转仍保留原动画语义。
- 指定人工矩阵中滚动条位置与输入直接对应，无肉眼可见的周期性停顿或“放手后继续滑动”；其他 renderer 容器不存在因全局拦截造成的新卡顿。
- profile/计数报告记录优化前后 WYSIWYG 热点，并对每个仍有问题的区域给出独立证据，而不是推断同一根因。

## 8. 风险与未知项

- **高风险：Folder root 生命周期。** main/renderer/buffer/watcher 跨进程状态分散，迟到 watcher I/O 和 debounce 可能恢复旧 root；实现和独立复审均须使用 `gpt-5.6-sol`、extra high。
- **高风险：跨 workspace 菜单所有权。** focused pane 投影、legacy Pinia facade 与异步菜单回调并存；错误捕获会操作错误文档；实现和独立复审均须使用 `gpt-5.6-sol`、extra high。
- **高风险：滚动性能。** 优化触及 workspace commit/projection/订阅正确性，过度节流可能丢失最终位置或破坏 lease；实现和独立复审均须使用 `gpt-5.6-sol`、extra high。
- Electron 是否能直接弹出某个已有 `MenuItem.submenu`、以及何时需构造保留角色/状态的临时菜单，需在实现票中以 Electron 42 的实际行为验证；产品结果不可因此改变。
- Element Plus tree 的默认 label/nowrap 样式可能覆盖现有 TOC word-wrap CSS；需要 DOM/E2E 验证实际 computed style。
- 所有 locale 都需要新增文案；不得用英文硬编码替代本地化。英文稳定 prefix `file:`/`folder:` 是语法，不翻译。
- `UPDATE_WORD_COUNT` 开发态异常保持记录项，除非出现明确阻断证据并由协调任务升级。

## 9. 最终确认与变更控制

用户于 **2026-08-31** 最终确认本 Spec 中的 A–H shared understanding，包括 prototype A、Close Folder 数据保留边界、共享菜单契约、行内搜索精确语法、全 renderer 原生滚动目标以及 bidi 根因。

实现不得以技术便利为由悄悄偏离。任何改变可见行为、平台范围、数据保留边界、搜索语法、菜单顺序或滚动语义的提议，都必须先更新本 Spec、标出受影响 Tickets，并获得用户或获授权产品决策者明确确认。
