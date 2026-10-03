# Plan — easy-s3-sync

Status: draft

## Goal

Ship **Easy Sync** (`manifest.id`: `easy-sync`): an Obsidian community plugin that syncs a vault to AWS S3, Cloudflare R2, or any S3-compatible endpoint, with manual snapshot backups (fixed retain 5) and a conflict UX that never uses local/remote naming.

Inspired by / ported from [sathinduga/obsidian-s3-sync-and-backup](https://github.com/sathinduga/obsidian-s3-sync-and-backup) (MIT) — keep the proven sync engine shape; simplify product surface.

## Constraints

- Sync is always enabled when connection is configured (no sync-enable toggle). Incomplete credentials → quiet no-op + sidebar CTA.
- Backup is **manual only**; UI lists last **5** snapshots; creating a 6th deletes the oldest; **no** retention/schedule settings.
- Conflict UI labels: **On this device** / **In the cloud**; actions Keep on this device / Keep in the cloud / Keep both / Skip. No `LOCAL_`/`REMOTE_` prefixes; Keep both → `name (conflict YYYY-MM-DD).ext`.
- No client-side encryption in v1; objects stored as-is. Disclose in README + settings.
- `isDesktopOnly: false`; S3 via browser-safe AWS SDK + Obsidian `requestUrl` (no Node HTTP).
- Providers first-class: `aws` | `r2` | `custom` (S3-compatible). Drop B2/RustFS presets (custom covers them).
- Hard-exclude plugin secrets (`data.json` / own plugin dir); default editable excludes `**/workspace*`, `.trash/**`; `.obsidian/**` in scope with credential-leak docs.
- Attribution: preserve MIT copyright notices for ported code; LICENSE remains compatible.
- Obsidian policies: no telemetry; network only to configured endpoint; register* cleanup; light onload.

## Approach

Port/adapt reference modules into a deep, small public surface:

| Layer | Responsibility |
|-------|----------------|
| `storage/` | S3 client (aws/r2/custom), list/head/get/put/delete, conditional writes |
| `sync/` | Journal (IndexedDB), planner/decision table, executor, scheduler, change tracker |
| `backup/` | Snapshot create, list, download zip, restore-overwrite-same-paths, retain=5 |
| `ui/` | Settings tab (connection), ItemView sidebar (ops), conflict modal, status bar |
| `settings.ts` | Narrow settings model — no syncEnabled/backupEnabled/retention knobs |
| `main.ts` | Lifecycle only: load settings, wire modules, register view/commands |

**Sidebar (primary ops):** last sync summary (time, status, uploaded/downloaded/deleted/conflicts/skipped, error); Sync now; conflicts list → modal; Backup now; last 5 backups (Download / Restore).

**Settings:** provider, endpoint (non-aws), region, bucket, keys, forcePathStyle (custom), syncPrefix, backupPrefix, excludePatterns, syncIntervalMinutes (1–30, default 5).

**Cadence:** sync on startup + interval + command `easy-sync-now`; open sidebar command; backup command.

## Steps (tracer-bullet order)

1. **Identity & scaffold** — Rename sample → Easy Sync; settings types/defaults; settings tab connection fields; README disclosure.
2. **S3 transport tracer** — Port `ObsidianHttpHandler` + thin S3 wrapper; “Test connection” from settings.
3. **Sync MVP** — Port journal + planner + executor (no encryption path); Sync now end-to-end; persist last-run summary.
4. **Scheduler** — Startup + interval; incomplete-creds quiet skip.
5. **Conflict UX** — Journal conflicts → sidebar list + modal (device/cloud labels); resolution writes winner / dated Keep both.
6. **Sidebar + status bar** — ItemView with sync details/options; status bar opens sidebar / shows conflicts.
7. **Backup** — Manual snapshot under backupPrefix; list/retain 5; Download zip; Restore with confirm (overwrite same paths only).
8. **Hardening** — Excludes, destination fingerprint, lint/build, styles, command IDs stable.

## Risks

- AWS SDK bundle size on mobile.
- Full-vault plan cost on large vaults (same as reference).
- `.obsidian` sync can leak other plugins’ secrets if excludes wrong — mitigate with docs + hard-exclude own `data.json`.
- Port drift from upstream — pin behavior via decision-table comments + manual verify checklist, not a git submodule.
- Conditional-write quirks on some S3-compatible vendors — keep HeadObject fallback pattern from reference.

## Open questions

None — see answered `questions.md` Q1–Q13.

## Verify (after implementation)

- `npm install && npm run build && npm run lint`
- Manual: configure R2/custom → Sync now → edit both sides → resolve conflict via modal → create 6 backups and confirm only 5 retained → restore overwrites same paths only.
