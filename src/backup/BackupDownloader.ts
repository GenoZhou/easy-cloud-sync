/**
 * Backup Downloader Module
 *
 * Adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 *
 * Easy Sync: plaintext downloads only.
 */

import { S3Provider } from '../storage/S3Provider';
import { EasySyncSettings, BackupManifest } from '../types';
import { addPrefix, normalizePrefix, removePrefix } from '../utils/paths';
import JSZip from 'jszip';

export interface BackupDownloadResult {
	files: Map<string, Uint8Array>;
	errors: string[];
	manifest: BackupManifest | null;
}

export class BackupDownloader {
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

	async getManifest(backupName: string): Promise<BackupManifest> {
		const key = addPrefix(`${backupName}/.backup-manifest.json`, this.normalizedBackupPrefix);
		const manifestJson = await this.s3Provider.downloadFileAsText(key);
		return JSON.parse(manifestJson) as BackupManifest;
	}

	async downloadBackup(backupName: string): Promise<BackupDownloadResult> {
		const files = new Map<string, Uint8Array>();
		const errors: string[] = [];
		let manifest: BackupManifest | null = null;
		const prefix = addPrefix(`${backupName}`, this.normalizedBackupPrefix);
		const prefixWithSlash = `${prefix}/`;
		const objects = await this.s3Provider.listObjects(prefix, true);

		for (const obj of objects) {
			const relativePath =
				removePrefix(obj.key, prefix) ?? removePrefix(obj.key, prefixWithSlash) ?? '';
			if (!relativePath) continue;

			try {
				if (relativePath === '.backup-manifest.json') {
					const text = new TextDecoder().decode(await this.s3Provider.downloadFile(obj.key));
					manifest = JSON.parse(text) as BackupManifest;
					continue;
				}
				const content = await this.s3Provider.downloadFile(obj.key);
				files.set(relativePath, content);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`${relativePath}: ${message}`);
			}
		}

		return { files, errors, manifest };
	}

	async createDownloadBlob(backupName: string): Promise<Blob> {
		const { files, errors, manifest } = await this.downloadBackup(backupName);
		const attempted = files.size + errors.length;
		if (errors.length > 0) {
			throw new Error(
				`Download incomplete: ${errors.length} of ${attempted} file(s) failed. ` +
					`First error: ${errors[0]}`,
			);
		}

		const zip = new JSZip();
		for (const [path, content] of files) {
			zip.file(path, content);
		}

		const resolvedManifest = manifest ?? (await this.getManifest(backupName));
		zip.file('.backup-manifest.json', JSON.stringify(resolvedManifest, null, 2));

		return await zip.generateAsync({ type: 'blob' });
	}

	async triggerDownload(backupName: string): Promise<void> {
		const blob = await this.createDownloadBlob(backupName);
		const url = URL.createObjectURL(blob);
		const link = activeDocument.createEl('a');
		link.href = url;
		link.download = `${backupName}.zip`;
		activeDocument.body.appendChild(link);
		link.click();
		activeDocument.body.removeChild(link);
		URL.revokeObjectURL(url);
	}
}
