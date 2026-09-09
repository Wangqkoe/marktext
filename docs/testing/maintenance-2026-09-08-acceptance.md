# 2026-09-08 近期维护验收记录

- 记录截至源码：`33b1e24f809562448ecfc3eb94c041c5e7d28df7`
- 核对日期：2026-09-08
- 范围：`cdde617cb48a792d06ca1ed7a3daffb8d6476a85` 之后的维护改动，以及此前 WYSIWYG 滚动优化阶段的证据链接

本文是截至上述源码的固定阶段记录，不负责持续反映仓库最新状态。旧 Spec、Ticket、Wayfinder 和验收文档仍保留各自阶段的基线与历史结果；本文不把历史测试结果写成本次重跑结果。

## 截至记录基线的行为

| 源码提交 | 记录行为 | 验证与接受状态 |
| --- | --- | --- |
| `da337a7d9e7a2535c183215c38b878f49d5f94ce` | Markdown 图片和 HTML preview 图片都使用各自 Document View 的文档目录解析相对路径；切换文档或 pane 时，图片基准路径随对应 view 更新。 | 提交包含 Muya 单元测试及 Electron E2E；历史任务使用用户提供的四张图片检查。该提交曾生成开发阶段安装包，后续提交未重新打包。 |
| `4fc232fadd4afb53a7ffe7a5542c9ca9cf19ddb5` | 折叠的 `<details>` preview 保持为 summary 单行，不渲染重复的内嵌源码按钮；选中 HTML block 后，右侧浮动工具栏仍提供源码入口。 | 历史 E2E 覆盖折叠高度、按钮数量与浮动源码入口；用户确认 details 行为“全部正常”。 |
| `6f1f7d5a6dd638066b3b63c1d5721511e2a1e70e` | Folder tree 标题栏提供文件名、修改时间、创建时间各升/降序共 6 种排序；选择写回 `fileSortBy`/`fileSortOrder` preferences。文件夹始终按名称 A–Z 排列，文件按所选规则排列。 | 历史 Electron E2E 覆盖 6 项菜单、排序与 preference 同步；用户确认排序行为“全部正常”。 |
| `fca8fe7fea85068958e99deb624a937679c2bad5`、`999b2f322e3f726e2fe5a6bdbb2d6d9a3cb2ca4f` | Editor preference `highlightColor` 默认 `#ffff00`。颜色控件显示大写 HEX，支持 RGB/HEX、色相/明度饱和度区域、随机、恢复默认、当前色及最多 8 个内存历史色；历史排除当前色并去重。浏览器没有 `EyeDropper` 能力时屏幕取色按钮禁用。不带冒号的设置标题加粗，字重为 600。 | 历史 Electron E2E 覆盖即时应用、持久化、Markdown 不变及新版 picker 交互；用户确认初版 picker 功能正确，并确认新版 picker“全部符合预期”。 |
| `812fd9658df7d2df89fb3c7b582a847e8aed1aec` | 首次把 clean 文档刷新到编辑器时，接受编辑表面的 canonical Markdown 作为 clean baseline，避免空行规范化造成误报 dirty；之后的真实编辑仍标记 dirty。该过程不写回原文件。 | 历史 workspace 单元测试及 Electron E2E 通过；历史任务使用用户提供的两份日报副本完成 E2E，原文件未修改。没有单独记录为明确的用户人工确认。 |
| `3bf53e72373cd03716b118586a8dbec784bf44f0`、`33b1e24f809562448ecfc3eb94c041c5e7d28df7` | titlebar、tab 和 Opened Files 的 dirty 圆点位于文件名之前。dirty 圆点在 active/hover 状态保持可见；Opened Files 圆点与文件名间距为 5px，并与 close 控件分离。 | 历史开发构建人工检查；用户确认最终 `33b1e24f` 效果“符合预期”。 |

记录基线 `33b1e24f` 只在本地源码和开发构建中验证，没有基于该提交生成新的安装包。`da337a7d` 的历史安装包不能证明其后的 details、排序、颜色、clean baseline 或 dirty marker 改动已进入安装包。

颜色 picker 的原型提交 `8b91a75a678737b2d0da9fa01ee1e9138d298725` 位于独立原型分支，不在记录基线中；记录行为以上表中的正式实现为准。

## WYSIWYG 滚动阶段

WYSIWYG 滚动阶段的集成提交、T05/T06/T07 结论、平台限制和阶段清理证据统一见[滚动 profile](desktop-scroll-profile.md)。

## 本次文档检查

本次只核对 Git 历史、源码、测试和文档，并检查文档链接、提交可解析性和 diff；没有重跑单元测试、E2E、性能测试、build 或打包。上表测试状态均来自对应历史任务报告。
