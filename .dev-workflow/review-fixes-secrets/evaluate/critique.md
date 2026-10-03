# Evaluator critique — review-fixes-secrets

Status: pass

## Verdict

Implementation matches the plan. Secret access key is SecretStorage-only; Access key ID stays a normal setting; `minAppVersion`/`versions.json` are `1.11.4`; plaintext `secretAccessKey` is stripped on load/save with no migration. Findings 1–6 are fixed in code. Unit tests cover decision table, payload codec, retention helpers, and path excludes; `npm test` / `build` / `lint` pass. Open claim count: 0.

## Plan checklist

| Requirement | Result |
|-------------|--------|
| Secret key via `SecretComponent` / `secretAccessKeySecretId` + `getSecret` | pass — `settings.ts`, `S3Config.resolveSecretAccessKey`, `S3Provider.getClient` |
| Access key ID plaintext setting | pass — `EasySyncSettings.accessKeyId` |
| `minAppVersion` ≥ 1.11.4 | pass — `manifest.json` / `versions.json` |
| No plaintext secret persisted | pass — type dropped; load/save delete leftover field |
| No migration required | pass — strip-only in `loadSettings`/`saveSettings` |
| Finding 1 — connection save restarts sync | pass — `saveSettings` → `onSettingsChanged` → `restartSyncServices` + sidebar refresh |
| Finding 2 — retain-5 on partial snapshot | pass — `snapshotCreated` gates `applyRetentionPolicy` |
| Finding 3 — restore modal Escape/`onClose` → false | pass — `RestoreConfirmModal.settle(false)` in `onClose` |
| Finding 4 — download/restore failure surfacing | pass — zip throws on per-file errors; restore Notice reports failed count; sidebar catches download errors |
| Finding 5 — Reset sync journal + SyncEngine copy | pass — Advanced confirm UI; `resetSyncJournal` → `SyncJournal.clear`; error copy matches |
| Finding 6 — unit tests + `npm test` | pass — four suites, 22 tests |

## Claim disposition

No prior claims. None raised this round.

## Residual notes (non-blocking)

- `S3Provider` caches an `S3Client` with static credentials; a same-id secret value rotation that does not trigger `saveSettings` would stay stale until the next settings update (plan risk; rename/id change is covered).
- `ConfirmModal` settle/`onClose` pattern is duplicated with `RestoreConfirmModal` — optional DRY later.
