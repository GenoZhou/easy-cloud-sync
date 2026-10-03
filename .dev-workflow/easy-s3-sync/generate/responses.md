# Generator responses — easy-s3-sync

## c1
Persisted LastSyncSummary in SyncJournal metadata key `lastSyncSummary` (JSON). Loaded on onload after journal init; saved on sync complete/error.

## c2
Removed LOCAL_/REMOTE_ hard-exclude from ChangeTracker and deleted `isConflictFile` / `getOriginalFromConflict` from paths.ts. No conflict artifacts created.

## c3
`decodeAfterDownload` fail-closed on non-plaintext formats; removed `isEncryptionEnabled`.

## c4
ChangeTracker uses `plugin.registerEvent` for vault listeners; `offref` on stopTracking.
