# Easy Cloud Sync

Obsidian community plugin that syncs your vault to **AWS S3**, **Cloudflare R2**, or any **S3-compatible** endpoint, with manual snapshot backups (keeps the last 5) and a conflict UI that never uses `LOCAL_` / `REMOTE_` file names.

中文说明见 [README.zh.md](./README.zh.md)。UI language follows Obsidian (`getLanguage()`): Chinese locales use Chinese copy; everything else uses English.

> **Note:** Plugin id is `easy-cloud-sync` (community id `easy-sync` is already taken by an unrelated OneDrive plugin; `easy-sync-s3` is invalid because new ids cannot contain digits).

## Features

- Bi-directional sync with a three-way journal (IndexedDB baselines)
- Providers: AWS S3, Cloudflare R2, Other S3-compatible (custom endpoint + force path style)
- Sync on startup, on an interval (1–30 minutes, default 5), and via **Sync now**
- Sidebar ops surface: last sync summary, conflict list, backups
- Conflicts: sidebar lists unresolved paths; **Show diff** opens a dedicated page with inline hunks (− device / + cloud) and per-file resolve actions (Keep on this device / Keep in the cloud / Skip)
- Manual backups under a backup prefix; retain newest 5; Restore (overwrite same paths only)
- **Advanced → Reset local (from cloud)**: clear the journal, then overwrite this device from the cloud
- **Advanced → Reset cloud (from local)**: clear the journal, then overwrite the cloud from this device

## Privacy & security

- **No client-side encryption** in v1 — objects are stored as-is. Anyone with your bucket credentials can read vault contents.
- Network requests go only to your configured S3-compatible endpoint. No telemetry.
- The **secret access key** is stored via Obsidian **Secret storage** (requires Obsidian 1.13.0+). This plugin persists only the secret name (`secretAccessKeySecretId`) in `data.json` — never the key value. The access key ID remains a normal settings field.
- Syncing `.obsidian/` can expose other plugins’ secrets. This plugin hard-excludes its own `data.json` / plugin directory. Default editable excludes: `**/workspace*`, `.trash/**`.

## Setup

1. Install the plugin and enable it in **Settings → Community plugins** (Obsidian 1.13.0+).
2. Open **Settings → Easy Cloud Sync** and configure provider, bucket, access key ID, and secret access key (via secret storage), plus prefixes.
3. Use **Test connection**, then open the **Easy Cloud Sync** sidebar (ribbon or command) and select **Sync now**.

If you previously installed a beta under `.obsidian/plugins/easy-sync/` or `.obsidian/plugins/easy-sync-s3/`, move or reinstall into `.obsidian/plugins/easy-cloud-sync/` and disable the old folder copy.

## Commands

| ID | Name |
|----|------|
| `easy-sync-now` | Sync now |
| `easy-sync-open-sidebar` | Open Easy Cloud Sync sidebar |
| `easy-sync-backup-now` | Backup now |

## Develop

```bash
npm install
npm run dev    # watch build → main.js
npm run build  # typecheck + production bundle
npm run lint
npm test       # unit tests (node:test + tsx)
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<Vault>/.obsidian/plugins/easy-cloud-sync/`.

## Attribution

Sync engine, S3 `requestUrl` HTTP handler, journal/planner/executor, and backup snapshot layout are selectively adapted from [sathinduga/obsidian-s3-sync-and-backup](https://github.com/sathinduga/obsidian-s3-sync-and-backup) (MIT). See file headers, `LICENSE`, and `NOTICE`.

Not ported: status bar UI, client encryption, scheduled backups, retention settings UI, sync/backup enable toggles, B2/RustFS presets, `LOCAL_`/`REMOTE_` conflict artifacts.
