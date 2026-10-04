# Easy Sync S3

Obsidian 社区插件：将笔记库同步到 **AWS S3**、**Cloudflare R2** 或任意 **S3 兼容** 端点；支持手动快照备份（保留最近 5 份）与冲突界面（不使用 `LOCAL_` / `REMOTE_` 文件名）。

界面语言跟随 Obsidian（`getLanguage()`）：中文界面显示中文文案，其他语言使用英文。完整英文说明见 [README.md](./README.md)。

> **说明：** 插件 id 为 `easy-cloud-sync`（社区 id `easy-sync` 已被无关的 OneDrive 插件占用；`easy-sync-s3` 因新 id 不能含数字而无效）。

## 功能

- 基于三方日志（IndexedDB 基线）的双向同步
- 服务商：AWS S3、Cloudflare R2、其他 S3 兼容（自定义端点 + 强制路径风格）
- 启动时同步、按间隔同步（1–30 分钟，默认 5），以及 **立即同步**
- 侧边栏：上次同步摘要、冲突列表、备份
- 冲突：侧边栏列出未解决路径；**查看差异** 打开独立页面（− 本机 / + 云端）并提供「保留本机 / 保留云端 / 暂时跳过」
- 手动备份；保留最新 5 份；恢复（仅覆盖同路径）
- **高级 → 重置本地（基于云端）**：清除同步日志后，用云端覆盖本机
- **高级 → 重置云端（基于本地）**：清除同步日志后，用本机覆盖云端

## 隐私与安全

- **v1 无客户端加密** — 对象按原样存储。持有存储桶凭证即可读取库内容。
- 网络请求仅发往你配置的 S3 兼容端点。无遥测。
- **Secret access key** 通过 Obsidian **密钥存储**保存（需 Obsidian 1.11.4+）。本插件只在 `data.json` 中保存密钥名称（`secretAccessKeySecretId`），从不保存密钥值。Access key ID 仍为普通设置项。
- 同步 `.obsidian/` 可能暴露其他插件密钥。本插件硬排除自身 `data.json` / 插件目录。默认可编辑排除：`**/workspace*`、`.trash/**`。

## 安装与设置

1. 安装并启用插件（**设置 → 社区插件**，Obsidian 1.11.4+）。
2. 打开 **设置 → Easy Sync S3**，配置服务商、存储桶、Access key ID、Secret access key（密钥存储）与前缀。
3. 使用 **测试连接**，然后打开 **Easy Sync S3** 侧边栏（功能区或命令），选择 **立即同步**。

若此前 beta 安装在 `.obsidian/plugins/easy-sync/` 或 `.obsidian/plugins/easy-sync-s3/`，请改用（或迁移到）`.obsidian/plugins/easy-cloud-sync/`，并停用旧目录副本。

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

同步引擎、S3 `requestUrl` HTTP 处理、日志/规划/执行与备份快照布局选择性改编自 [sathinduga/obsidian-s3-sync-and-backup](https://github.com/sathinduga/obsidian-s3-sync-and-backup)（MIT）。详见文件头与 `LICENSE`。

未移植：状态栏 UI、客户端加密、定时备份、保留策略设置 UI、同步/备份开关、B2/RustFS 预设、`LOCAL_`/`REMOTE_` 冲突产物。
