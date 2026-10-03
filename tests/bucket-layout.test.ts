import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBucketLayoutPreview } from '../src/utils/bucketLayout';

describe('formatBucketLayoutPreview', () => {
	it('renders bucket with sync and backup prefixes', () => {
		const text = formatBucketLayoutPreview('notes', 'vault', 'backups', {
			syncNote: 'synced vault files',
			backupNote: 'snapshot backups',
		});
		assert.match(text, /^notes\//m);
		assert.match(text, /vault\/\s+← synced vault files/);
		assert.match(text, /backups\/\s+← snapshot backups/);
	});

	it('normalizes slashes in prefixes', () => {
		const text = formatBucketLayoutPreview('b', '/vault/', '/backups/', {
			syncNote: 's',
			backupNote: 'b',
		});
		assert.match(text, /├── vault\//);
		assert.match(text, /└── backups\//);
	});
});
