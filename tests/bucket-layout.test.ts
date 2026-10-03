import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBucketLayoutPreview } from '../src/utils/bucketLayout';

const notes = {
	syncNote: 'synced vault files',
	backupNote: 'snapshot backups',
};

describe('formatBucketLayoutPreview', () => {
	it('renders sibling prefixes under the bucket', () => {
		const text = formatBucketLayoutPreview('notes', 'vault', 'backups', notes);
		assert.match(text, /^notes\//m);
		assert.match(text, /├── vault\/\s+← synced vault files/);
		assert.match(text, /└── backups\/\s+← snapshot backups/);
	});

	it('nests backup under sync when prefixed', () => {
		const text = formatBucketLayoutPreview('b', 'vault', 'vault/backups', notes);
		assert.match(text, /└── vault\/\s+← synced vault files/);
		assert.match(text, /└── backups\/\s+← snapshot backups/);
		assert.doesNotMatch(text, /├──/);
	});

	it('merges when sync and backup prefixes are equal', () => {
		const text = formatBucketLayoutPreview('b', 'data', 'data', notes);
		assert.match(text, /└── data\/\s+← synced vault files; snapshot backups/);
		assert.equal(text.split('\n').length, 2);
	});

	it('normalizes slashes in prefixes', () => {
		const text = formatBucketLayoutPreview('b', '/vault/', '/backups/', notes);
		assert.match(text, /├── vault\//);
		assert.match(text, /└── backups\//);
	});
});
