# Outcome — review-fixes-secrets

## What was built

Hardening pass on Easy Sync:

- **Secret access key** stored via Obsidian `SecretStorage` / `SecretComponent`; settings keep only `secretAccessKeySecretId`. Access key ID remains a normal setting. `minAppVersion` **1.11.4**. No plaintext secret in `data.json`; no migration.
- Review finding fixes: sync services restart after settings save; retain-5 on partial backups; restore confirm dismiss resolves false; backup download/restore surface failures; Advanced **Reset sync journal**; unit tests (`node:test`, 22 passing).

## Signed decision

Dual sign-off with zero open claims. Plan Q1–Q4 as confirmed by user.

## What changed across GAN rounds

Single generator round landed all plan items; evaluator raised no claims (pass).

## Residual risks

- Cached S3 client may not pick up a rotated secret value until settings refresh rebuilds the client.
- Partial newest backup still counts toward retain-5 (may prune older complete snapshots).
- SecretComponent UX requires Obsidian ≥ 1.11.4.

## Rejected alternatives

- Storing Access key ID in SecretStorage (user: secret key only).
- Legacy plaintext migration (unpublished).
- Jest / S3 integration tests in this topic.

## Verify

```bash
npm test
npm run build
npm run lint
```

Manual: SecretComponent for secret key → Test connection → save connection without reload → auto-sync; Escape on restore confirm; Reset sync journal; retain-5 after partial backup.

## Suggested next step

Merge into the Easy Sync implementation branch / open for vault smoke test on Obsidian ≥ 1.11.4, then continue release workflow once publish scripts exist.
