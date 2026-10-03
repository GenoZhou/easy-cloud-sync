# Questions — easy-s3-sync

### Q1: Plugin identity
Status: answered

What should `manifest.json` `id` and `name` be for this repo (`GenoZhou/easy-sync`)? Changing `id` after release is forbidden, so this locks community-plugin identity.

Recommended: id `easy-sync`, name `Easy Sync`

Answer: Accept recommendation — id `easy-sync`, name `Easy Sync`.

### Q2: Implementation approach
Status: answered

Port/adapt the reference architecture (sync journal, decision table, S3 provider, backup snapshot layout) into this repo with a simplified settings/UX surface, or greenfield rewrite that only borrows concepts?

Recommended: Port/adapt — keep proven sync engine pieces; strip unused providers/settings; redesign conflict + backup UX.

Answer: Accept recommendation — port/adapt reference architecture; simplify settings/UX.

### Q3: Encryption in v1
Status: answered

Should v1 include client-side encryption (passphrase / NaCl path from reference), or ship plaintext sync/backup first and add encryption later?

Recommended: Defer encryption for v1 — reduces settings/complexity and conflict/backup surface; document that objects are stored as-is on the bucket.

Answer: Accept recommendation — no client-side encryption in v1.

### Q4: Platform target
Status: answered

Target mobile as well (`isDesktopOnly: false`, requestUrl-based S3 like reference), or desktop-only for v1?

Recommended: `isDesktopOnly: false` with browser-safe AWS SDK + `requestUrl`, matching the reference — but accept larger bundle and mobile performance risk.

Answer: Accept recommendation — mobile-capable (`isDesktopOnly: false`).

### Q5: Conflict UX paradigm
Status: answered

What replaces local/remote naming and auto-duplication?

Options:
A) Conflict modal: show both versions (timestamps/fingerprints), actions Keep this / Keep that / Keep both (user-named or dated copies) / Skip
B) Status-bar conflict inbox → open note with side-by-side chooser
C) Always keep both under neutral names (e.g. `note (conflict 2026-10-03).md`) then let user merge manually

Recommended: A — explicit conflict modal/inbox; avoid LOCAL_/REMOTE_ prefixes; “Keep both” uses a dated suffix, not side labels.

Answer: Accept recommendation — option A (conflict modal/inbox; neutral dated Keep both).

### Q6: Sync cadence defaults
Status: answered

Sync is always enabled (no enable toggle). What cadence?

Recommended: Auto-sync on an interval (default 5 minutes) + sync on startup + manual “Sync now” command; no user-facing “disable sync” — only disconnect by clearing/invalid credentials or uninstalling. Interval adjustable in settings (1–30 min) unless you want a fixed interval with zero knobs.

Answer: Accept recommendation — startup sync + default 5 min interval (adjustable 1–30) + Sync now command; no disable-sync toggle.

### Q7: Sidebar role (new requirement)
Status: open

User added: a sidebar that shows latest sync details and sync options.

What belongs in the sidebar vs Settings?

Recommended:
- Sidebar (primary ops surface): last sync summary (time, result, counts uploaded/downloaded/deleted/conflicts/skipped, short error if any); Sync now; Open conflicts; Backup now; list of last 5 backups (restore/download/delete if needed); interval quick control optional or link to settings.
- Settings: connection (provider aws|r2|custom, endpoint, region, bucket, keys, forcePathStyle for custom), sync prefix, backup prefix, exclude patterns, sync interval.

### Q8: Conflict entry points
Status: open

Given conflict modal (Q5) + sidebar (Q7), how do users discover unresolved conflicts?

Recommended: Sidebar shows conflict count + list of conflicted paths; clicking a row opens the conflict modal. Status bar also shows conflict badge and opens the same sidebar/modal. No LOCAL_/REMOTE_ files unless user chooses Keep both (dated copy).

### Q9: Sync scope defaults
Status: open

What is synced by default, and which excludes are hard-coded vs configurable?

Recommended: Sync whole vault except hard-exclude plugin `data.json` / own plugin dir secrets; default exclude patterns `**/workspace*`, `.trash/**` (editable in Settings). `.obsidian/**` included except those hard excludes — document credential-leak risk if users add other plugins' data files carelessly. No encryption means bucket contents are readable with keys.

### Q10: Backup actions in UI
Status: open

Manual-only backups with fixed retention of 5. Exact actions?

Recommended: Sidebar section “Backups” lists up to 5 newest snapshots (timestamp + size if cheap); actions: Create backup, Download (zip), Restore into vault (with confirm). Creating a 6th deletes oldest automatically (copies=5, no days retention, no settings). No scheduled backup.
