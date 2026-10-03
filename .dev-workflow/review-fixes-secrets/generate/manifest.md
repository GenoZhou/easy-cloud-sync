# Generator manifest — review-fixes-secrets

Status: ready

## Summary

Implemented SecretStorage for the S3 secret access key only, closed review findings 1–6, and added a `node:test` + `tsx` unit suite (`npm test`). `npm run build`, `npm run lint`, and `npm test` all pass.

## Files

- manifest.json
- versions.json
- package.json
- package-lock.json
- tsconfig.json
- eslint.config.mts
- README.md
- src/types.ts
- src/main.ts
- src/settings.ts
- src/storage/S3Config.ts
- src/storage/S3Provider.ts
- src/sync/SyncScheduler.ts
- src/ui/SidebarView.ts
- src/backup/SnapshotCreator.ts
- src/backup/RetentionManager.ts
- src/backup/BackupDownloader.ts
- src/backup/BackupRestore.ts
- tests/sync-decision-table.test.ts
- tests/sync-payload-codec.test.ts
- tests/retention.test.ts
- tests/paths.test.ts

## Deviations from plan

None material. Access key ID remains a normal settings field (password-masked); only the secret access key uses `SecretComponent` / SecretStorage. Legacy plaintext `secretAccessKey` is stripped on load/save with no migration.

## How to verify

```bash
npm test
npm run build
npm run lint
```

Manual: set Secret access key via SecretComponent → Test connection → change connection without reload → auto-sync starts; Escape on restore confirm cancels; partial backup still prunes to 5; Reset sync journal works; destructive-block copy matches UI.
