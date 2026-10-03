# Evaluator critique — easy-s3-sync

Status: needs-work

## Verdict

Core tracer bullets land: S3/R2/custom transport, journal sync, sidebar ops (no status bar), device/cloud conflict modal, manual backup retain-5, restore overwrite-same-paths. Build/lint pass. Several plan gaps and reference-plugin leftovers remain in code — not ship-clean yet.

## Plan alignment (what works)

- Identity: `easy-sync`, `isDesktopOnly: false`, providers `aws|r2|custom` only.
- No status bar registration; ops live in `EasySyncSidebarView`.
- No sync/backup enable toggles; no retention/schedule backup settings; `BACKUP_RETAIN_COPIES = 5`.
- Conflict UX labels/actions match plan; Keep both → `name (conflict YYYY-MM-DD).ext`; executor records journal conflicts without creating `LOCAL_`/`REMOTE_` files.
- Settings disclosure + README state no client encryption; hard-exclude own plugin dir via `isPluginOwnPath`.
- Commands: `easy-sync-now`, `easy-sync-open-sidebar`, `easy-sync-backup-now`.

## Missing / shallow vs plan

1. **Last-run summary not persisted** — Plan step 3: “persist last-run summary.” `main.ts` keeps `lastSyncSummary` in memory only. Reload → sidebar shows Idle / zeros. Journal stores `lastSuccessfulSyncAt` but not the counts/status the sidebar requires.

2. **`LOCAL_`/`REMOTE_` hard-exclusion still active** — Plan forbids porting those conflict artifacts. `ChangeTracker.shouldExclude` still calls `isConflictFile`; `paths.ts` still exports `isConflictFile` / `getOriginalFromConflict` with comments claiming the sync engine *creates* those files. Legitimate notes named `LOCAL_*` / `REMOTE_*` are silently ignored by dirty tracking. Stale `hasConflictArtifacts` / planner docs still describe disk artifacts while the real gate is journal conflicts.

3. **Encrypted payload path fails open** — `SyncPayloadCodec.decodeAfterDownload` ignores `payloadFormat` and returns bytes as-is. Types still advertise `xsalsa20poly1305-v1` / `isEncryptionEnabled`. Sharing a bucket with encrypted objects from the reference plugin can write ciphertext into the vault as “plaintext.” Plan: no encryption — reject non-plaintext formats.

## Port residue / design leaks

- Dead `src/utils/time.ts` (header: “for status bar display”), unused by sidebar.
- `SyncPathCodec` metadata dir still `.obsidian-s3-sync`; comments mention `.vault.enc` encryption marker.
- `SyncScheduler.pause`/`resume` unused; `debugLogging` settings toggle not in plan settings surface (minor bloat).
- Internal `local`/`remote` action names are fine; user-facing copy is correct. Docs/comments still say “local/remote” and “encryption/decrypt” in executor/planner — cognitive leak from the reference.
- `ChangeTracker` uses `vault.on`/`vault.off` instead of `plugin.registerEvent` (plan/Obsidian cleanup guidance).

## Quality refs

- **Deep modules:** `SyncPayloadCodec` is a shallow pass-through that still exposes encryption knobs (`isEncryptionEnabled`, unused format arg) without owning fail-closed behavior.
- **One representation:** last-sync truth split between ephemeral `LastSyncSummary` and journal `lastSuccessfulSyncAt`.
- **Broken windows:** stale LOCAL_/REMOTE_ helpers and status-bar time utils normalize out-of-plan surface.

## Deviations noted (acceptable)

- Sidebar command display name “Open sidebar” (stable ID as planned); README table wording slightly drifts (“Open Easy Sync sidebar”).
- ESLint overrides for command IDs / brand casing (manifest deviation).

## Claims

Raised against code; none to clear (ledger was empty). Generator must fix code + address each claim.
