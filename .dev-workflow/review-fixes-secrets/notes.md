# Notes — review-fixes-secrets

## Prior outcome

Topic `easy-s3-sync` done. Code review findings (Bugbot + parent verify):

1. High: `saveSettings` after connection setup never starts scheduler (`onSettingsChanged` only from interval/excludes).
2. Medium: retention only on full backup success → retain-5 violated on partial.
3. Medium: `RestoreConfirmModal` Escape/overlay does not resolve `openAndWait`.
4. Medium: `BackupDownloader` swallows per-file download errors → silent partial zip/restore.
5. Medium: destructive sync error cites missing “Reset sync journal” Advanced control.
6. Medium: no automated tests.

User ask: fix all findings; store credentials via Obsidian secret API.

## SecretStorage facts (obsidian.d.ts / docs)

- `app.secretStorage` since **1.11.4**: `setSecret` / `getSecret` / `listSecrets`.
- Settings UI: `SecretComponent` — settings persist the **secret name/id**, not the value.
- Runtime: `app.secretStorage.getSecret(settings.<nameField>)`.
- Secrets vault-local. Must bump `minAppVersion` to ≥ `1.11.4`.
- Guide: https://docs.obsidian.md/plugins/guides/secret-storage

## Current credential storage

- `EasySyncSettings.accessKeyId` + `secretAccessKey` in `data.json` via `saveData`.
- Password-type inputs in `settings.ts`; `S3Config` reads from settings object.

## Round 1 partial answers (user)

- Q1: SecretStorage only for Secret access key; Access key ID remains plain settings.
- Q2: No migration (unpublished).
- Q3–Q4: accept recommendations.

## Round 1 complete

Frontier empty — draft plan for confirmation.
