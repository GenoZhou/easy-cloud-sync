# Easy Cloud Sync

把 Obsidian 笔记库同步到**任意 S3 兼容对象存储**——AWS S3、Cloudflare R2、MinIO 等。面向希望自建存储桶、看得清冲突、并在手机上也能顺畅操作的用户。

界面语言跟随 Obsidian（`getLanguage()`）：中文界面显示中文文案，其他语言使用英文。完整英文说明见 [README.md](./README.md)。

## 为什么选 Easy Cloud Sync

**专为 S3 兼容而生。** 可对接 AWS S3、Cloudflare R2，或自定义端点（可选强制路径风格）。存储桶与凭证归你所有；网络请求只发往你配置的端点——没有中间同步服务，无遥测。

**真正用得上的冲突处理。** 当同一笔记在本机与云端都被改过时，同步会暂停该路径而不是擅自合并。侧边栏列出未解决冲突；**查看差异**打开独立页面，展示内联统一 diff（− 本机 / + 云端），并提供按文件操作：保留本机、保留云端，或暂时跳过。

**面向手机的交互设计。** 同步集中在专用侧边栏，而不是挤在状态栏。主操作为全宽、易点按的按钮；冲突与备份行把路径与操作放在同一行，触控目标足够大。解决冲突后会关闭 diff 视图并干净地回到侧边栏——手机与桌面一致。

## 功能

- 基于三方日志（IndexedDB 基线）的双向同步
- 服务商：AWS S3、Cloudflare R2、其他 S3 兼容（自定义端点 + 强制路径风格）
- 启动时同步、按间隔同步（1–30 分钟，默认 5），以及 **立即同步**
- 侧边栏：上次同步摘要、冲突列表、备份
- 手动快照备份；保留最新快照（默认 1 份，可在设置中调整）；可选在手动同步前自动备份（默认关闭）；恢复（仅覆盖同路径）
- **高级 → 重置本地（基于云端）**：清除同步日志后，用云端覆盖本机
- **高级 → 重置云端（基于本地）**：清除同步日志后，用本机覆盖云端

## 隐私与安全

- **v1 无客户端加密** — 对象按原样存储。持有存储桶凭证即可读取库内容。
- 网络请求仅发往你配置的 S3 兼容端点。无遥测。
- **Secret access key** 通过 Obsidian **密钥存储**保存（需 Obsidian 1.13.0+）。本插件只在 `data.json` 中保存密钥名称（`secretAccessKeySecretId`），从不保存密钥值。Access key ID 仍为普通设置项。
- 同步 `.obsidian/` 可能暴露其他插件密钥。本插件硬排除自身 `data.json` / 插件目录。默认可编辑排除：`**/workspace*`、`.trash/**`。

## 安装与设置

1. 安装并启用插件（**设置 → 社区插件**，Obsidian 1.13.0+）。
2. 打开 **设置 → Easy Cloud Sync**，配置服务商、存储桶、Access key ID、Secret access key（密钥存储）与前缀。
3. 使用 **测试连接**，然后打开 **Easy Cloud Sync** 侧边栏（功能区或命令），选择 **立即同步**。

安装目录：`.obsidian/plugins/easy-cloud-sync/`。

## 命令

| ID | 名称（中文界面） |
|----|------------------|
| `easy-sync-now` | 立即同步 |
| `easy-sync-open-sidebar` | 打开侧边栏 |
| `easy-sync-backup-now` | 立即备份 |

## 开发

```bash
npm install
npm run dev    # 监听构建 → main.js
npm run build  # 类型检查 + 生产打包
npm run lint
npm test       # 单元测试（node:test + tsx）
```

将 `main.js`、`manifest.json`、`styles.css` 复制到 `<Vault>/.obsidian/plugins/easy-cloud-sync/`。

## 致谢

同步引擎与 S3 传输的部分代码改编自 [sathinduga/obsidian-s3-sync-and-backup](https://github.com/sathinduga/obsidian-s3-sync-and-backup)（MIT）。详见 `LICENSE` 与 `NOTICE`。
