# Easy Sync

Obsidian community plugin that syncs your vault to **AWS S3**, **Cloudflare R2**, or any **S3-compatible** endpoint, with manual snapshot backups (keeps the last 5) and a conflict UI that never uses `LOCAL_` / `REMOTE_` file names.

## Features

- Bi-directional sync with a three-way journal (IndexedDB baselines)
- Providers: AWS S3, Cloudflare R2, Other S3-compatible (custom endpoint + force path style)
- Sync on startup, on an interval (1–30 minutes, default 5), and via **Sync now**
- Sidebar ops surface: last sync summary, conflict list, backups
- Conflicts: sidebar lists unresolved paths; **Show diff** opens a dedicated page with inline hunks (− device / + cloud) and per-file resolve actions (Keep on this device / Keep in the cloud / Skip)
- Manual backups under a backup prefix; retain newest 5; Download zip; Restore (overwrite same paths only)

## Privacy & security

- **No client-side encryption** in v1 — objects are stored as-is. Anyone with your bucket credentials can read vault contents.
- Network requests go only to your configured S3-compatible endpoint. No telemetry.
- The **secret access key** is stored via Obsidian **Secret storage** (requires Obsidian 1.11.4+). This plugin persists only the secret name (`secretAccessKeySecretId`) in `data.json` — never the key value. The access key ID remains a normal settings field.
- Syncing `.obsidian/` can expose other plugins’ secrets. This plugin hard-excludes its own `data.json` / plugin directory. Default editable excludes: `**/workspace*`, `.trash/**`.

## Setup

1. Install the plugin and enable it in **Settings → Community plugins** (Obsidian 1.11.4+).
2. Open **Settings → Easy Sync** and configure provider, bucket, access key ID, and secret access key (via secret storage), plus prefixes.
3. Use **Test connection**, then open the **Easy Sync** sidebar (ribbon or command) and select **Sync now**.

## Commands

| ID | Name |
|----|------|
| `easy-sync-now` | Sync now |
| `easy-sync-open-sidebar` | Open Easy Sync sidebar |
| `easy-sync-backup-now` | Backup now |

## Develop

```bash
npm install
npm run dev    # watch build → main.js
npm run build  # typecheck + production bundle
npm run lint
npm test       # unit tests (node:test + tsx)
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<Vault>/.obsidian/plugins/easy-sync/`.

## Attribution

Sync engine, S3 `requestUrl` HTTP handler, journal/planner/executor, and backup snapshot layout are selectively adapted from [sathinduga/obsidian-s3-sync-and-backup](https://github.com/sathinduga/obsidian-s3-sync-and-backup) (MIT). See file headers and `LICENSE`.

Not ported: status bar UI, client encryption, scheduled backups, retention settings UI, sync/backup enable toggles, B2/RustFS presets, `LOCAL_`/`REMOTE_` conflict artifacts.
