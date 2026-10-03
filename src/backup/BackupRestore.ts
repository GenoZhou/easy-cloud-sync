/**
 * Restore a backup snapshot into the vault.
 *
 * Overwrites files that exist in the snapshot at the same vault paths.
 * Vault files not present in the snapshot are left untouched.
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { BackupDownloader } from './BackupDownloader';
import { getVaultFileKind, toArrayBuffer } from '../utils/vaultFiles';

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

class RestoreConfirmModal extends Modal {
	private resolvePromise: ((value: boolean) => void) | null = null;
	private settled = false;

	constructor(
		app: App,
		private backupName: string,
	) {
		super(app);
	}

	openAndWait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}

	private settle(value: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolvePromise?.(value);
		this.resolvePromise = null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Restore backup' });
		contentEl.createEl('p', {
			text:
				`Restore “${this.backupName}”? Files present in this snapshot will overwrite ` +
				'the same paths in your vault. Other vault files are left untouched.',
		});
		const row = contentEl.createDiv({ cls: 'easy-sync-modal-actions' });
		const cancel = row.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => {
			this.settle(false);
			this.close();
		});
		const confirmBtn = row.createEl('button', {
			text: 'Restore',
			cls: 'mod-cta',
		});
		confirmBtn.addEventListener('click', () => {
			this.settle(true);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		this.settle(false);
	}
}

export async function restoreBackupWithConfirm(
	app: App,
	downloader: BackupDownloader,
	backupName: string,
): Promise<void> {
	const modal = new RestoreConfirmModal(app, backupName);
	const ok = await modal.openAndWait();
	if (!ok) return;

	new Notice('Restoring backup…');
	const restorer = new BackupRestore(app, downloader);
	const result = await restorer.restore(backupName);
	if (result.errors.length > 0) {
		new Notice(
			`Restore finished with errors: ${result.restored} restored, ${result.errors.length} failed`,
		);
	} else {
		new Notice(`Restore completed: ${result.restored} files`);
	}
}
