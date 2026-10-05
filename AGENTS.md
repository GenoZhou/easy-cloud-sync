# Easy Cloud Sync — agent notes

Obsidian community plugin (`easy-cloud-sync`). TypeScript → `main.js` via **npm** + **esbuild**. Release artifacts: `main.js`, `manifest.json`, `styles.css`.

```bash
npm install
npm run dev      # watch
npm run build
npm run lint
npm test
```

## Hard rules

- Keep `main.ts` lifecycle-only; feature code in modules under `src/`.
- Never change `manifest.json` `id` after release; keep `minAppVersion` accurate.
- Do not commit `node_modules/`, `main.js`, `*.map`, or `.dev-workflow/`.
- Network only to the user-configured S3-compatible endpoint; no telemetry; disclose risks in settings/README.
- Use `this.register*` for events/intervals/DOM; unload must not leak.
- Stable command IDs; i18n all user-facing strings (`src/i18n/`).

## Sync / backup / restore

- **Mutual exclusion**: sync, backup, and restore never run together — guard via `isVaultMutationBusy()`.
- **Progress**: update Sync/Backup labels + `disabled` in place (`updateOperationUi`); do not rebuild the sidebar on every progress tick.
- **Sidebar refresh**:
  - Sync/conflicts → `refreshSyncState()` (do **not** re-fetch backups).
  - Backups → open sidebar, after backup/delete-all, when `backupPrefix`/connection becomes valid, or **Refresh list**.
  - Plugin `finally` owns post-backup list refresh (no extra `.then(refreshBackups)` on the button).
- **Backup format**: per-file objects under `backupPrefix/backup-{timestamp}/…` + `.backup-manifest.json` (no cloud ZIP / no Download ZIP UI unless requested).
- **Delete all backups**: only `backup-*` folders via `listBackups` → `deleteBackup`; continue on per-item failure and report counts.

## Release (short)

SemVer in `manifest.json` + `versions.json`; GitHub release tag = version (no `v`); attach `manifest.json`, `main.js`, `styles.css`.
