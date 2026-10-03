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

	return [
		`${bucketName}/`,
		`├── ${syncLabel}  ← ${notes.syncNote}`,
		`└── ${backupLabel}  ← ${notes.backupNote}`,
	].join('\n');
}
