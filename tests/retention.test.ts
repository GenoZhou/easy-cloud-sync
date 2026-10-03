import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backupsExceedingRetention } from '../src/backup/RetentionManager';
import type { BackupInfo } from '../src/types';
import { BACKUP_RETAIN_COPIES } from '../src/types';

function backup(name: string, timestamp: string): BackupInfo {
	return {
		name,
		timestamp,
		fileCount: 1,
		totalSize: 10,
		encrypted: false,
	};
}

describe('backupsExceedingRetention', () => {
	it('keeps the newest retain copies and returns older ones to delete', () => {
		const backups = [
			backup('backup-old', '2024-01-01T00:00:00.000Z'),
			backup('backup-mid', '2024-01-03T00:00:00.000Z'),
			backup('backup-new', '2024-01-05T00:00:00.000Z'),
			backup('backup-newer', '2024-01-06T00:00:00.000Z'),
			backup('backup-newest', '2024-01-07T00:00:00.000Z'),
			backup('backup-extra', '2024-01-02T00:00:00.000Z'),
		];

		const toDelete = backupsExceedingRetention(backups, 5);
		assert.equal(toDelete.length, 1);
		assert.equal(toDelete[0]?.name, 'backup-old');
	});

	it('returns nothing when at or under the retain limit', () => {
		const backups = [
			backup('a', '2024-01-05T00:00:00.000Z'),
			backup('b', '2024-01-04T00:00:00.000Z'),
		];
		assert.deepEqual(backupsExceedingRetention(backups, BACKUP_RETAIN_COPIES), []);
		assert.deepEqual(backupsExceedingRetention(backups, 2), []);
	});

	it('defaults to BACKUP_RETAIN_COPIES', () => {
		const backups = Array.from({ length: 7 }, (_, i) =>
			backup(`backup-${i}`, `2024-01-0${i + 1}T00:00:00.000Z`),
		);
		const toDelete = backupsExceedingRetention(backups);
		assert.equal(toDelete.length, 2);
		assert.equal(BACKUP_RETAIN_COPIES, 5);
	});
});
