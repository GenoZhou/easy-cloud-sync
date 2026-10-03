# Outcome — easy-s3-sync

## What was built

**Easy Sync** (`manifest.id`: `easy-sync`): Obsidian plugin that syncs a vault to AWS S3, Cloudflare R2, or S3-compatible storage, with manual snapshot backups (retain 5) and a conflict modal labeled **On this device** / **In the cloud**.

Ops surface is a **sidebar** (last sync summary, Sync now, conflicts, Backup now, last 5 backups). Settings hold connection, prefixes, excludes, and sync interval. No status bar.

## Signed decisions

- Port selectively from obsidian-s3-sync-and-backup (MIT); do not port out-of-plan features.
- No status bar; no encryption v1; no backup scheduler; no retention settings (hardcode 5).
- Providers: aws | r2 | custom.
- Sync always on when configured (startup + interval default 5m + Sync now).
- Conflict UX without local/remote naming; Keep both → dated suffix.
- Backup restore overwrites same paths only; zip download non-destructive.
- Dual sign-off after claims c1–c4 cleared (persist last-sync summary; drop LOCAL_/REMOTE_ excludes; reject non-plaintext payloads; registerEvent for vault listeners).

## What changed across GAN rounds

1. Generator: initial selective port (sync/backup/sidebar/conflict/settings).
2. Evaluator: raised c1–c4 (persistence, conflict-file residue, encryption fail-open, vault listeners).
3. Generator: fixed all four + removed dead status-bar time util / unused scheduler pause / debug toggle.
4. Evaluator: cleared c1–c4; dual sign-off.

## Residual risks

- AWS SDK bundle size on mobile.
- Full-vault plan cost on large vaults.
- `.obsidian/**` sync can leak other plugins’ secrets if excludes are weak.
- Some S3-compatible vendors need HeadObject fallback for conditional writes.
- No live Obsidian vault E2E in this environment — verify manually against a test bucket.

## Rejected alternatives

- Status bar sync/conflict UI (user: out of plan).
- Client-side encryption in v1.
- Scheduled backups / retention knobs.
- LOCAL_/REMOTE_ conflict artifacts and B2/RustFS first-class presets.
- Greenfield rewrite (chose selective port).

## Verify

```bash
npm install
npm run build
npm run lint
```

Manual: configure R2/custom → Sync now → resolve a conflict via sidebar modal → create 6 backups (only 5 remain) → restore overwrites same paths only. Confirm no status-bar item.

## Suggested next step

Install into a test vault (copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/easy-sync/`), point at a disposable R2/S3 bucket, and run the manual verify checklist above before any prerelease.
