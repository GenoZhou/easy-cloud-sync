# Questions — review-fixes-secrets

### Q1: SecretStorage scope
Status: open

Which credentials move to Obsidian `SecretStorage` / `SecretComponent`?

Recommended: Both Access key ID and Secret access key — two `SecretComponent`s; settings store `accessKeySecretId` and `secretAccessKeySecretId` (names only). Runtime resolves via `app.secretStorage.getSecret`. Bump `minAppVersion` to `1.11.4`. Remove plaintext key fields from persisted settings.

### Q2: Migration from data.json plaintext
Status: open

How to handle existing installs that already saved keys in `data.json`?

Recommended: On load, if legacy plaintext `accessKeyId` / `secretAccessKey` are present, write them into `secretStorage` under stable ids (`easy-sync-access-key`, `easy-sync-secret-key`), point settings at those ids, clear plaintext from settings, `saveData`. One-time migration; document in README.

### Q3: Finding-fix approaches (bundle)
Status: open

Confirm fix shapes for review findings 1–6:

1. Connection/`saveSettings` path: after save, if connection became configured (or always), call `onSettingsChanged()` / ensure scheduler start + sidebar refresh.
2. Retention: run retain-5 whenever a backup snapshot was created on S3 (including partial), not only `success===true`.
3. Restore modal: `onClose` resolves `false` if still pending.
4. Download: fail/notify when any object fails; do not present a silent partial zip as success; restore surfaces failed count.
5. Add Advanced **Reset sync journal** (confirm) matching the SyncEngine error copy.
6. Add unit tests for pure logic (decision table / payload codec / retention listing helpers / path excludes) + `npm test` script.

Recommended: Accept all six as stated.

### Q4: Test runner
Status: open

Which test stack for finding 6?

Recommended: Node built-in `node:test` + `tsx` (or `ts-node`) for unit tests only — keep deps light vs porting reference Jest. No S3 integration tests in this topic.
