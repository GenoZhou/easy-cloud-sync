# Generator manifest — easy-s3-sync

Status: ready

## Summary

Easy Sync (`easy-sync`) with S3/R2/custom sync, journal planner/executor/scheduler (plaintext fail-closed), conflict sidebar+modal, ItemView ops sidebar (no status bar), manual backups retain-5. Claims c1–c4 fixed: durable last-sync summary in journal metadata; LOCAL_/REMOTE_ hard-excludes removed; encrypted payloads rejected; ChangeTracker uses plugin.registerEvent.

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
- src/utils/deviceId.ts
- src/crypto/Hasher.ts
- src/shims/setimmediate.cjs

## Deviations from plan

- Sidebar command display name “Open sidebar” (ID `easy-sync-open-sidebar`).
- ESLint overrides for plan-required command IDs / brand casing.
- Last-sync summary persisted in journal metadata (`lastSyncSummary` JSON string), not settings knobs.
- Removed unused `src/utils/time.ts` (status-bar leftover) and debug-logging settings toggle.

## How to verify

```bash
npm install && npm run build && npm run lint
```

Reload plugin after a sync — sidebar shows last run. Notes named LOCAL_*/REMOTE_* are tracked. Encrypted remote objects error instead of writing ciphertext. Unload cleans vault listeners via registerEvent.
