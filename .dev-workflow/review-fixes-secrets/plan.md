# Plan — review-fixes-secrets

Status: ready

## Goal

Close all code-review findings for Easy Sync, and store **only the S3 Secret access key** via Obsidian `SecretStorage` / `SecretComponent` (Access key ID remains a normal setting). No plaintext secret in `data.json`. No legacy migration (unpublished).

## Constraints

- `minAppVersion` ≥ `1.11.4` (SecretStorage / SecretComponent).
- Settings persist `secretAccessKeySecretId` (secret name); resolve with `app.secretStorage.getSecret` at S3 client build time.
- Access key ID stays in settings as plaintext field.
- No migration path from old `secretAccessKey` field — remove it from the settings model.
- Keep prior product decisions (no status bar, no encryption, retain-5, sidebar ops).
- Unit tests only (`node:test` + light TS runner); no S3 integration tests in this topic.

## Approach

| Area | Change |
|------|--------|
| Credentials | Replace secret key password input with `SecretComponent`; thread resolved secret into `S3Config`/`S3Provider` (do not put secret value on `EasySyncSettings` persisted blob). |
| Finding 1 | Ensure connection saves restart sync services (`onSettingsChanged` or equivalent after relevant saves). |
| Finding 2 | Apply retain-5 when a snapshot was created, including partial success. |
| Finding 3 | `RestoreConfirmModal.onClose` resolves pending promise as `false`. |
| Finding 4 | Surface download failures; refuse silent “successful” partial zip; restore reports failures. |
| Finding 5 | Advanced settings: **Reset sync journal** with confirm; aligns with SyncEngine copy. |
| Finding 6 | Unit tests for decision table / payload codec / retention helpers / path excludes; `npm test`. |

## Steps

1. Bump `minAppVersion` / `versions.json`; update settings types (drop `secretAccessKey`, add `secretAccessKeySecretId`).
2. Wire `SecretComponent` + resolve secret in S3 config path; update README disclosure.
3. Fix scheduler restart on connection save; sidebar refresh.
4. Fix backup retention + download/restore error handling + restore modal dismiss.
5. Add Reset sync journal UI + journal clear API.
6. Add `node:test` suite + npm script; ensure `build`/`lint`/`test` pass.

## Risks

- SecretComponent UX depends on Obsidian ≥ 1.11.4 — enforce via `minAppVersion`.
- Resolving secrets must happen whenever S3 client is (re)built; stale client after secret rename.
- Partial-backup retention may prune older good backups while keeping a partial newest — acceptable per finding fix; document in Notice text if useful.

## Open questions

None — see answered `questions.md` Q1–Q4.

## Verify

```bash
npm test
npm run build
npm run lint
```

Manual: set Secret access key via SecretComponent → Test connection → change connection without reload → auto-sync starts; Escape on restore confirm cancels; partial backup still prunes to 5; Reset sync journal works; destructive-block copy matches UI.
