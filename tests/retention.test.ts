import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backupsExceedingRetention } from '../src/backup/RetentionManager';
import type { BackupInfo } from '../src/types';
import {
	DEFAULT_BACKUP_RETAIN_COPIES,
	LEGACY_BACKUP_RETAIN_COPIES,
	clampBackupRetainCopies,
	resolveBackupRetainCopies,
} from '../src/types';

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
		assert.deepEqual(backupsExceedingRetention(backups, 5), []);
		assert.deepEqual(backupsExceedingRetention(backups, 2), []);
	});

	it('defaults to DEFAULT_BACKUP_RETAIN_COPIES', () => {
		const backups = Array.from({ length: 3 }, (_, i) =>
			backup(`backup-${i}`, `2024-01-0${i + 1}T00:00:00.000Z`),
		);
		const toDelete = backupsExceedingRetention(backups);
		assert.equal(toDelete.length, 2);
		assert.equal(DEFAULT_BACKUP_RETAIN_COPIES, 1);
		assert.equal(toDelete[0]?.name, 'backup-1');
		assert.equal(toDelete[1]?.name, 'backup-0');
	});

	it('clamps backup retain copies into range', () => {
		assert.equal(clampBackupRetainCopies(undefined), 1);
		assert.equal(clampBackupRetainCopies(0), 1);
		assert.equal(clampBackupRetainCopies(1.9), 1);
		assert.equal(clampBackupRetainCopies(12), 12);
		assert.equal(clampBackupRetainCopies(1000), 100);
	});
});

describe('resolveBackupRetainCopies', () => {
	it('uses the default for a new install', () => {
		assert.equal(resolveBackupRetainCopies(null), DEFAULT_BACKUP_RETAIN_COPIES);
		assert.equal(resolveBackupRetainCopies(undefined), 1);
	});

	it('keeps the previous fixed count when saved data has no backup count', () => {
		assert.equal(resolveBackupRetainCopies({ bucket: 'notes' }), LEGACY_BACKUP_RETAIN_COPIES);
		assert.equal(resolveBackupRetainCopies({}), 5);
	});

	it('clamps a saved backup count', () => {
		assert.equal(resolveBackupRetainCopies({ backupRetainCopies: 8 }), 8);
		assert.equal(resolveBackupRetainCopies({ backupRetainCopies: 0 }), 1);
	});
});
