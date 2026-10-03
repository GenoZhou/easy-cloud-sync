/**
 * Snapshot Creator Module
 *
 * Adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 *
 * Easy Sync: plaintext snapshots only (no client encryption).
 */

import { App, TFile } from 'obsidian';
import { S3Provider } from '../storage/S3Provider';
import { hashContent } from '../crypto/Hasher';
import { BackupManifest, BackupResult, EasySyncSettings } from '../types';
import { addPrefix, matchesAnyGlob, normalizePrefix, isPluginOwnPath } from '../utils/paths';
import { readVaultFile } from '../utils/vaultFiles';

export class SnapshotCreator {
	private app: App;
	private s3Provider: S3Provider;
	private settings: EasySyncSettings;
	private normalizedBackupPrefix: string;

	constructor(app: App, s3Provider: S3Provider, settings: EasySyncSettings) {
		this.app = app;
		this.s3Provider = s3Provider;
		this.settings = settings;
		this.normalizedBackupPrefix = normalizePrefix(settings.backupPrefix);
	}

	updateSettings(settings: EasySyncSettings): void {
		this.settings = settings;
		this.normalizedBackupPrefix = normalizePrefix(settings.backupPrefix);
	}

	async createSnapshot(deviceId: string, deviceName: string): Promise<BackupResult> {
		const startedAt = Date.now();
		const backupName = this.generateBackupName();

		const result: BackupResult = {
			success: false,
			snapshotCreated: false,
			backupName,
			startedAt,
			completedAt: 0,
			filesBackedUp: 0,
			totalSize: 0,
			errors: [],
		};

		try {
			const files = this.app.vault.getFiles();
			const checksums: Record<string, string> = {};

			for (const file of files) {
				if (this.shouldExclude(file.path)) continue;

				try {
					await this.backupFile(file, backupName, checksums);
					result.filesBackedUp++;
					result.totalSize += file.stat.size;
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					result.errors.push(`${file.path}: ${errorMessage}`);
				}
			}

			const manifest: BackupManifest = {
				version: 1,
				timestamp: new Date().toISOString(),
				deviceId,
				deviceName,
				fileCount: result.filesBackedUp,
				totalSize: result.totalSize,
				encrypted: false,
				checksums,
			};

			await this.uploadManifest(backupName, manifest);
			result.snapshotCreated = true;
			result.success = result.errors.length === 0;

			if (this.settings.debugLogging) {
				console.debug(
					`[Easy Sync] Snapshot created: ${backupName}, ${result.filesBackedUp} files`,
				);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			result.errors.push(`Backup failed: ${errorMessage}`);
		}

		result.completedAt = Date.now();
		return result;
	}

	private generateBackupName(): string {
		const now = new Date();
		const isoString = now.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
		return `backup-${isoString}`;
	}

	private async backupFile(
		file: TFile,
		backupName: string,
		checksums: Record<string, string>,
	): Promise<void> {
		const content = await readVaultFile(this.app.vault, file);
		const contentBytes =
			typeof content === 'string' ? new TextEncoder().encode(content) : content;

		const checksum = await hashContent(contentBytes);
		checksums[file.path] = `sha256:${checksum}`;

		const uploadContent: Uint8Array | string =
			typeof content === 'string' ? content : contentBytes;
		const key = addPrefix(`${backupName}/${file.path}`, this.normalizedBackupPrefix);
		await this.s3Provider.uploadFile(key, uploadContent);
	}

	private async uploadManifest(backupName: string, manifest: BackupManifest): Promise<void> {
		const key = addPrefix(`${backupName}/.backup-manifest.json`, this.normalizedBackupPrefix);
		const content = JSON.stringify(manifest, null, 2);
		await this.s3Provider.uploadFile(key, content, { contentType: 'application/json' });
	}

	private shouldExclude(path: string): boolean {
		return (
			matchesAnyGlob(path, this.settings.excludePatterns) ||
			isPluginOwnPath(path, this.app.vault.configDir)
		);
	}
}
