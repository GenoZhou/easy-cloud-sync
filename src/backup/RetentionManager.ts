/**
 * Retention Manager Module
 *
 * Adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 *
 * Easy Sync: always retain the newest {@link BACKUP_RETAIN_COPIES} snapshots.
 */

import { S3Provider } from '../storage/S3Provider';
import { EasySyncSettings, BackupInfo, BackupManifest, BACKUP_RETAIN_COPIES } from '../types';
import { addPrefix, normalizePrefix } from '../utils/paths';

export class RetentionManager {
	private s3Provider: S3Provider;
	private settings: EasySyncSettings;
	private normalizedBackupPrefix: string;

	constructor(s3Provider: S3Provider, settings: EasySyncSettings) {
		this.s3Provider = s3Provider;
		this.settings = settings;
		this.normalizedBackupPrefix = normalizePrefix(settings.backupPrefix);
	}

	updateSettings(settings: EasySyncSettings): void {
		this.settings = settings;
		this.normalizedBackupPrefix = normalizePrefix(settings.backupPrefix);
	}

	/** Keep newest {@link BACKUP_RETAIN_COPIES}; delete older snapshots. */
	async applyRetentionPolicy(): Promise<number> {
		const backups = await this.listBackups();
		if (backups.length === 0) {
			return 0;
		}

		backups.sort(
			(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		);

		const toDelete =
			backups.length > BACKUP_RETAIN_COPIES
				? backups.slice(BACKUP_RETAIN_COPIES)
				: [];

		for (const backup of toDelete) {
			await this.deleteBackup(backup.name);
		}

		if (this.settings.debugLogging && toDelete.length > 0) {
			console.debug(`[Easy Sync] Retention: deleted ${toDelete.length} old backups`);
		}

		return toDelete.length;
	}

	async listBackups(): Promise<BackupInfo[]> {
		const prefix = this.normalizedBackupPrefix;
		const prefixWithSlash = prefix ? `${prefix}/` : '';
		const objects = await this.s3Provider.listObjects(prefixWithSlash, true);

		const backupFolders = new Set<string>();

		for (const obj of objects) {
			const relativePath = obj.key.substring(prefixWithSlash.length);
			const folderEnd = relativePath.indexOf('/');

			if (folderEnd > 0) {
				const folderName = relativePath.substring(0, folderEnd);
				if (folderName.startsWith('backup-')) {
					backupFolders.add(folderName);
				}
			}
		}

		const backups: BackupInfo[] = [];

		for (const folder of backupFolders) {
			const manifestKey = addPrefix(
				`${folder}/.backup-manifest.json`,
				this.normalizedBackupPrefix,
			);

			try {
				const manifestJson = await this.s3Provider.downloadFileAsText(manifestKey);
				const manifest = JSON.parse(manifestJson) as BackupManifest;

				backups.push({
					name: folder,
					timestamp: manifest.timestamp,
					fileCount: manifest.fileCount,
					totalSize: manifest.totalSize,
					encrypted: manifest.encrypted,
				});
			} catch {
				const timestamp = this.parseTimestampFromFolderName(folder);
				backups.push({
					name: folder,
					timestamp,
					fileCount: 0,
					totalSize: 0,
					encrypted: false,
				});
			}
		}

		backups.sort(
			(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		);
		return backups;
	}

	async deleteBackup(backupName: string): Promise<void> {
		const prefix = addPrefix(`${backupName}/`, this.normalizedBackupPrefix);
		await this.s3Provider.deletePrefix(prefix);
	}

	private parseTimestampFromFolderName(folderName: string): string {
		const match = folderName.match(/^backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
		if (match?.[1]) {
			return match[1].replace(/-(\d{2})-(\d{2})$/, ':$1:$2') + '.000Z';
		}
		return new Date().toISOString();
	}
}
