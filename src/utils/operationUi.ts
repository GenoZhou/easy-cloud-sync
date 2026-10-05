/**
 * Shared helpers for sync/backup operation UI.
 */

import type { OperationProgress } from '../types';

export function formatOperationActionLabel(
	idle: string,
	indeterminate: string,
	withCounts: (done: number, total: number) => string,
	progress: OperationProgress | null,
): string {
	if (!progress) return idle;
	if (progress.total <= 0) return indeterminate;
	return withCounts(progress.done, progress.total);
}

/**
 * True while sync/backup/restore should block other vault mutations and grey
 * sidebar controls. Includes progress flags set in onSyncStart / backup start
 * before the engine `isInProgress` bit flips.
 */
export function isOperationBusy(state: {
	syncInProgress: boolean;
	backupRunning: boolean;
	restoreRunning: boolean;
	syncProgress: OperationProgress | null;
	backupProgress: OperationProgress | null;
}): boolean {
	return (
		state.syncInProgress ||
		state.backupRunning ||
		state.restoreRunning ||
		state.syncProgress !== null ||
		state.backupProgress !== null
	);
}

export function shouldRefreshBackupList(options: {
	previousBackupPrefix: string | null;
	nextBackupPrefix: string;
	wasConfigured: boolean;
	isConfigured: boolean;
}): boolean {
	if (!options.isConfigured) return false;
	if (!options.wasConfigured) return true;
	return options.previousBackupPrefix !== options.nextBackupPrefix;
}

export interface DeleteAllBackupsResult {
	deleted: number;
	failed: number;
}
