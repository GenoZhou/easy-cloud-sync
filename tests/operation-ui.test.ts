import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	formatOperationActionLabel,
	isOperationBusy,
	shouldRefreshBackupList,
} from '../src/utils/operationUi';

const idleBusy = {
	syncInProgress: false,
	backupRunning: false,
	restoreRunning: false,
	syncProgress: null,
	backupProgress: null,
};

describe('formatOperationActionLabel', () => {
	const withCounts = (done: number, total: number) => `${done}/${total}`;

	it('returns idle when progress is null', () => {
		assert.equal(
			formatOperationActionLabel('Sync now', 'Syncing…', withCounts, null),
			'Sync now',
		);
	});

	it('returns indeterminate when total is unknown', () => {
		assert.equal(
			formatOperationActionLabel('Sync now', 'Syncing…', withCounts, {
				done: 0,
				total: 0,
			}),
			'Syncing…',
		);
	});

	it('returns done/total when total is known', () => {
		assert.equal(
			formatOperationActionLabel('Sync now', 'Syncing…', withCounts, {
				done: 3,
				total: 10,
			}),
			'3/10',
		);
	});
});

describe('isOperationBusy', () => {
	it('is idle when nothing is running', () => {
		assert.equal(isOperationBusy(idleBusy), false);
	});

	it('is busy when syncProgress is set before the engine flag (onSyncStart gap)', () => {
		assert.equal(
			isOperationBusy({
				...idleBusy,
				syncProgress: { done: 0, total: 0 },
			}),
			true,
		);
	});

	it('is busy for backup progress and restore even without sync', () => {
		assert.equal(
			isOperationBusy({
				...idleBusy,
				backupProgress: { done: 1, total: 3 },
			}),
			true,
		);
		assert.equal(
			isOperationBusy({
				...idleBusy,
				restoreRunning: true,
			}),
			true,
		);
	});
});

describe('shouldRefreshBackupList', () => {
	it('does not refresh when connection is not configured', () => {
		assert.equal(
			shouldRefreshBackupList({
				previousBackupPrefix: 'backups',
				nextBackupPrefix: 'other',
				wasConfigured: true,
				isConfigured: false,
			}),
			false,
		);
	});

	it('refreshes when connection becomes valid', () => {
		assert.equal(
			shouldRefreshBackupList({
				previousBackupPrefix: 'backups',
				nextBackupPrefix: 'backups',
				wasConfigured: false,
				isConfigured: true,
			}),
			true,
		);
	});

	it('refreshes when backup prefix changes while configured', () => {
		assert.equal(
			shouldRefreshBackupList({
				previousBackupPrefix: 'backups',
				nextBackupPrefix: 'vault-backups',
				wasConfigured: true,
				isConfigured: true,
			}),
			true,
		);
	});

	it('does not refresh when prefix is unchanged and already configured', () => {
		assert.equal(
			shouldRefreshBackupList({
				previousBackupPrefix: 'backups',
				nextBackupPrefix: 'backups',
				wasConfigured: true,
				isConfigured: true,
			}),
			false,
		);
	});
});
