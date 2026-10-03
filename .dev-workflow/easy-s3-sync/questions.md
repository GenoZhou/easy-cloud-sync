# Questions — easy-s3-sync

### Q1: Plugin identity
Status: open

What should `manifest.json` `id` and `name` be for this repo (`GenoZhou/easy-sync`)? Changing `id` after release is forbidden, so this locks community-plugin identity.

Recommended: id `easy-sync`, name `Easy Sync`

### Q2: Implementation approach
Status: open

Port/adapt the reference architecture (sync journal, decision table, S3 provider, backup snapshot layout) into this repo with a simplified settings/UX surface, or greenfield rewrite that only borrows concepts?

Recommended: Port/adapt — keep proven sync engine pieces; strip unused providers/settings; redesign conflict + backup UX. Faster tracer bullet and lower sync-correctness risk.

### Q3: Encryption in v1
Status: open

Should v1 include client-side encryption (passphrase / NaCl path from reference), or ship plaintext sync/backup first and add encryption later?

Recommended: Defer encryption for v1 — reduces settings/complexity and conflict/backup surface; document that objects are stored as-is on the bucket.

### Q4: Platform target
Status: open

Target mobile as well (`isDesktopOnly: false`, requestUrl-based S3 like reference), or desktop-only for v1?

Recommended: `isDesktopOnly: false` with browser-safe AWS SDK + `requestUrl`, matching the reference — but accept larger bundle and mobile performance risk.

### Q5: Conflict UX paradigm
Status: open

What replaces local/remote naming and auto-duplication?

Options:
A) Conflict modal: show both versions (timestamps/fingerprints), actions Keep this / Keep that / Keep both (user-named or dated copies) / Skip
B) Status-bar conflict inbox → open note with side-by-side chooser
C) Always keep both under neutral names (e.g. `note (conflict 2026-10-03).md`) then let user merge manually

Recommended: A — explicit conflict modal/inbox; avoid LOCAL_/REMOTE_ prefixes; “Keep both” uses a dated suffix, not side labels.

### Q6: Sync cadence defaults
Status: open

Sync is always enabled (no enable toggle). What cadence?

Recommended: Auto-sync on an interval (default 5 minutes) + sync on startup + manual “Sync now” command; no user-facing “disable sync” — only disconnect by clearing/invalid credentials or uninstalling. Interval adjustable in settings (1–30 min) unless you want a fixed interval with zero knobs.
