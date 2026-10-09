# Easy Cloud Sync

Keep your Obsidian vault in sync with **any S3-compatible object store** — AWS S3, Cloudflare R2, MinIO, and more. Built for people who want their own bucket, clear conflict handling, and a sync UI that works well on phone as well as desktop.

中文说明见 [README.zh.md](./README.zh.md)。UI language follows Obsidian (`getLanguage()`): Chinese locales use Chinese copy; everything else uses English.

## Why Easy Cloud Sync

**S3-compatible by design.** Point the plugin at AWS S3, Cloudflare R2, or a custom endpoint (with optional path-style addressing). You own the bucket and the credentials; network traffic goes only to the endpoint you configure — no intermediary sync service, no telemetry.

**Conflict resolution you can actually use.** When the same note changes on this device and in the cloud, sync pauses that path instead of guessing. The sidebar lists unresolved conflicts; **Show diff** opens a dedicated page with an inline unified diff (− this device / + cloud) and per-file actions: keep on this device, keep in the cloud, or skip for now.

**Thoughtful mobile UI.** Sync lives in a dedicated sidebar — not a cramped status-bar widget. Primary actions are full-width, tappable buttons; conflict and backup rows keep path + action on one line with touch-friendly targets. Resolving a conflict closes the diff view and returns you to the sidebar cleanly on phone and desktop.

## Features

- Bi-directional sync with a three-way journal (IndexedDB baselines)
- Providers: AWS S3, Cloudflare R2, Other S3-compatible (custom endpoint + force path style)
- Sync on startup, on an interval (1–30 minutes, default 5), and via **Sync now**
- Sidebar ops surface: last sync summary, conflict list, backups
- Manual snapshot backups under a backup prefix; keep the newest snapshots (default 1, configurable); optional snapshot before manual sync (off by default); Restore (overwrite same paths only)
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

Install folder: `.obsidian/plugins/easy-cloud-sync/`.

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

## Credits

Portions of the sync engine and S3 transport are adapted from [sathinduga/obsidian-s3-sync-and-backup](https://github.com/sathinduga/obsidian-s3-sync-and-backup) (MIT). See `LICENSE` and `NOTICE`.
