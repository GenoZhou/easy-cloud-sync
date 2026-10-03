# Notes — easy-s3-sync

## Reference repo digest (sathinduga/obsidian-s3-sync-and-backup)

- Cloned: `/tmp/obsidian-s3-sync-and-backup` (v4.2.5, id `simple-storage-sync-and-backup`), MIT.
- Architecture: `S3Provider` + sync (`SyncEngine`/`SyncPlanner`/`SyncExecutor`/`SyncJournal`/`ChangeTracker`/`SyncScheduler`) + backup (`SnapshotCreator`/`BackupScheduler`/`RetentionManager`/`BackupDownloader`) + crypto + settings tab.
- Sync: three-way reconcile (local + S3 list/head + IndexedDB journal); no remote sync manifest; fingerprints SHA-256/HMAC; conditional writes; conflict modes `both|local-only|remote-only` with `LOCAL_*`/`REMOTE_*` artifacts; no merge UI.
- Backup: scheduled + manual; `{backupPrefix}/backup-{ISO}/` + `.backup-manifest.json`; retention `days|copies`.
- Settings: `provider` aws|r2|b2|rustfs|custom; sync/backup enable toggles; intervals; encryption; exclude patterns.
- Deps: `@aws-sdk/client-s3`, smithy, hash-wasm, tweetnacl, idb, jszip; transport via Obsidian `requestUrl`.
- Platform: `isDesktopOnly: false`; creds in `data.json` excluded from sync.

## Local scaffold digest (GenoZhou/easy-sync)

- Sample plugin only: `src/main.ts`, `src/settings.ts`; no S3/sync code.
- Build: npm + esbuild → `main.js`; lint via eslint-plugin-obsidianmd.
- Manifest still `sample-plugin` / Sample Plugin; `isDesktopOnly: false`.
- AGENTS.md: disclose network; no hidden telemetry; minimize vault I/O; register* cleanup; keep main.ts thin.

## User intent (from request)

- Reimplement based on reference; support AWS S3, Cloudflare R2, S3-compatible.
- Config simplify: sync always on.
- Backup: manual only; UI shows last 5; auto retention beyond 5; no retention knobs.
- Conflict UX/UI instead of local/remote distinction.

## Round 1 decisions (user)

- Accept all recommendations Q1–Q6.
- Additional requirement: sidebar for latest sync details + sync options.

## Round 2 decisions (user)

- Accept all recommendations Q7–Q10 (sidebar ops surface; conflict entry points; sync scope; backup actions).

