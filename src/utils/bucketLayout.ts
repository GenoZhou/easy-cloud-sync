/**
 * Text preview of how sync / backup prefixes sit under the bucket.
 */

import { normalizePrefix } from './paths';

export type BucketLayoutNotes = {
	syncNote: string;
	backupNote: string;
};

/**
 * Build a monospace directory-tree sketch for Settings → Sync.
 * Nests when one prefix is under the other; merges when equal.
 */
export function formatBucketLayoutPreview(
	bucket: string,
	syncPrefix: string,
	backupPrefix: string,
	notes: BucketLayoutNotes,
): string {
	const bucketName = bucket.trim() || 'bucket';
	const sync = normalizePrefix(syncPrefix);
	const backup = normalizePrefix(backupPrefix);

	const syncLabel = sync.length > 0 ? `${sync}/` : '(root)/';
	const backupLabel = backup.length > 0 ? `${backup}/` : '(root)/';

	if (sync === backup) {
		return [
			`${bucketName}/`,
			`└── ${syncLabel}  ← ${notes.syncNote}; ${notes.backupNote}`,
		].join('\n');
	}

	if (sync.length > 0 && backup.startsWith(`${sync}/`)) {
		const rest = `${backup.slice(sync.length + 1)}/`;
		return [
			`${bucketName}/`,
			`└── ${syncLabel}  ← ${notes.syncNote}`,
			`    └── ${rest}  ← ${notes.backupNote}`,
		].join('\n');
	}

	if (backup.length > 0 && sync.startsWith(`${backup}/`)) {
		const rest = `${sync.slice(backup.length + 1)}/`;
		return [
			`${bucketName}/`,
			`└── ${backupLabel}  ← ${notes.backupNote}`,
			`    └── ${rest}  ← ${notes.syncNote}`,
		].join('\n');
	}

	return [
		`${bucketName}/`,
		`├── ${syncLabel}  ← ${notes.syncNote}`,
		`└── ${backupLabel}  ← ${notes.backupNote}`,
	].join('\n');
}
