# 当前 Windows x64 包（2026-09-19）

源码提交：`078394878cd589b9e198333ebe9834c607e558ef`；版本仍为 `0.20.0-rc.1`。该提交只记录 [Source 批量通知暂缓决定](source-batch-timing.md#决策暂缓实施2026-09-19)，未改产品代码。以干净工作树重新执行 locales minify、native rebuild、Vite build、`electron-builder --win --x64 --publish never --config.directories.output='E:/Program Files/Marktext-builds/07839487'`，命令退出码 0。独立输出目录保留旧包，不覆盖主仓 `dist`。

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| `marktext-win-x64-0.20.0-rc.1-setup.exe` | 125881860 | `0014648E1E32E48F9B2F318FAE969B5E61E49501623AE28CE28344E2DBC04C2A` |
| `marktext-win-x64-0.20.0-rc.1.zip` | 173478324 | `237DAD1980A5B762091C83A90CBB82C3FBCCA47469D8D944E8A3F84E7462C61D` |

完整交付位于 `E:/Program Files/Marktext-builds/07839487/`，含 `SHA256SUMS.txt`、`BUILD-INFO.txt`、blockmap、`latest.yml` 和 `win-unpacked`。包内 `app.asar/package.json` 版本正确，打包的 main/preload/renderer 主文件与本次 Vite 输出逐字节相同，未含临时批量性能探针；目标 `rg.exe --version` 正常。ZIP 191 个条目全量 CRC 检查通过；安装器 PE 头及 `latest.yml` 记录的 SHA-512/字节数相符。未找到 7-Zip，故没有独立解压验证 NSIS 内嵌归档。

使用真实 `win-unpacked/marktext.exe` 和独立临时 user-data 配置启动，打开临时合成 Markdown、切换 Source 并核对全文，冒烟测试通过；随后关闭测试进程并清理临时配置。这不是全套 E2E 或性能验收，也不代替人工桌面验收。安装器与解包程序的 Authenticode 状态均为 **NotSigned**。未运行安装器、未改日常用户配置、未推送或发布。
