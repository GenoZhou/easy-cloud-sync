/**
 * Restore a backup snapshot into the vault.
 *
 * Overwrites files that exist in the snapshot at the same vault paths.
 * Vault files not present in the snapshot are left untouched.
 */

import { App, Notice, TFile } from 'obsidian';
import { BackupDownloader } from './BackupDownloader';
import { getVaultFileKind, toArrayBuffer } from '../utils/vaultFiles';
import { ConfirmModal } from '../ui/ConfirmModal';
import { t } from '../i18n';

export class BackupRestore {
	constructor(
		private app: App,
		private downloader: BackupDownloader,
	) {}

	async restore(backupName: string): Promise<{ restored: number; errors: string[] }> {
		const download = await this.downloader.downloadBackup(backupName);
		let restored = 0;
		const errors = [...download.errors];

		for (const [path, content] of download.files) {
			try {
				await this.writeFile(path, content);
				restored++;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`${path}: ${message}`);
			}
		}

		return { restored, errors };
	}

	private async writeFile(path: string, content: Uint8Array): Promise<void> {
		const kind = getVaultFileKind(path);
		const existing = this.app.vault.getAbstractFileByPath(path);

		if (existing instanceof TFile) {
			if (kind === 'text') {
				await this.app.vault.modify(existing, new TextDecoder().decode(content));
			} else {
				await this.app.vault.modifyBinary(existing, toArrayBuffer(content));
			}
			return;
		}

		await this.ensureParentFolders(path);
		if (kind === 'text') {
			await this.app.vault.create(path, new TextDecoder().decode(content));
		} else {
			await this.app.vault.createBinary(path, toArrayBuffer(content));
		}
	}

	private async ensureParentFolders(path: string): Promise<void> {
		const parts = path.split('/');
		parts.pop();
		if (parts.length === 0) return;

		let currentPath = '';
		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(currentPath)) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}
}

export async function restoreBackupWithConfirm(
	app: App,
	downloader: BackupDownloader,
	backupName: string,
): Promise<void> {
	const b = t().backup;
	const ok = await new ConfirmModal(
		app,
		b.restoreTitle,
		b.restoreBody(backupName),
		b.restoreConfirm,
		'mod-cta',
	).openAndWait();
	if (!ok) return;

	new Notice(b.restoring);
	const restorer = new BackupRestore(app, downloader);
	const result = await restorer.restore(backupName);
	if (result.errors.length > 0) {
		new Notice(b.restoreErrors(result.restored, result.errors.length));
	} else {
		new Notice(b.restoreDone(result.restored));
	}
}
