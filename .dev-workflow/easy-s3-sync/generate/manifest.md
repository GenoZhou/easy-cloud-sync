# Generator manifest — easy-s3-sync

Status: ready

## Summary

Implemented Easy Sync (`easy-sync`): S3/R2/custom sync via `@aws-sdk/client-s3` + Obsidian `requestUrl` handler, journal/planner/executor/scheduler (no encryption), conflict sidebar+modal (device/cloud labels, dated Keep both), ItemView ops sidebar (no status bar), manual backups with retain 5, Download zip, Restore overwrite-same-paths. Selectively ported from obsidian-s3-sync-and-backup (MIT).

## Files

- manifest.json
- package.json
- package-lock.json
- README.md
- LICENSE
- styles.css
- esbuild.config.mjs
- eslint.config.mts
- versions.json
- src/main.ts
- src/settings.ts
- src/types.ts
- src/storage/ObsidianHttpHandler.ts
- src/storage/S3Config.ts
- src/storage/S3Provider.ts
- src/sync/SyncPayloadCodec.ts
- src/sync/SyncJournal.ts
- src/sync/SyncPathCodec.ts
- src/sync/SyncObjectMetadata.ts
- src/sync/DestinationFingerprint.ts
- src/sync/SyncDecisionTable.ts
- src/sync/SyncPlanner.ts
- src/sync/SyncExecutor.ts
- src/sync/SyncEngine.ts
- src/sync/SyncScheduler.ts
- src/sync/ChangeTracker.ts
- src/backup/SnapshotCreator.ts
- src/backup/BackupDownloader.ts
- src/backup/RetentionManager.ts
- src/backup/BackupRestore.ts
- src/ui/ConflictResolver.ts
- src/ui/ConflictModal.ts
- src/ui/SidebarView.ts
- src/utils/paths.ts
- src/utils/vaultFiles.ts
- src/utils/retry.ts
- src/utils/time.ts
- src/utils/deviceId.ts
- src/crypto/Hasher.ts
- src/shims/setimmediate.cjs

## Deviations from plan

- Command name for sidebar is **Open sidebar** (stable ID `easy-sync-open-sidebar`); ribbon/sidebar title keep brand **Easy Sync**.
- ESLint overrides disable plugin-id-in-command-id / sentence-case / declarative settings-search so plan-required IDs and brand casing lint clean.
- Journal IndexedDB prefix renamed to `easy-sync-journal-*` to avoid colliding with the reference plugin.

## How to verify

```bash
npm install && npm run build && npm run lint
```

Manual: configure R2/custom → Sync now → edit both sides → resolve conflict via sidebar modal → create 6 backups and confirm only 5 retained → restore overwrites same paths only. Confirm no status-bar UI is registered.
