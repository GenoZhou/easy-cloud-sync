/**
 * Easy Sync sidebar — last sync, Sync now, conflicts, backups.
 * This is the only status surface (no status bar).
 */

import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type EasySyncPlugin from '../main';
import { BackupInfo, ConflictRecord, LastSyncSummary } from '../types';
import { isConnectionConfigured } from '../storage/S3Config';
import { ConflictModal } from './ConflictModal';
import { restoreBackupWithConfirm } from '../backup/BackupRestore';

export const EASY_SYNC_VIEW_TYPE = 'easy-sync-sidebar';

export class EasySyncSidebarView extends ItemView {
	plugin: EasySyncPlugin;
	private conflicts: ConflictRecord[] = [];
	private backups: BackupInfo[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: EasySyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return EASY_SYNC_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Easy Sync';
	}

	getIcon(): string {
		return 'refresh-cw';
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async refresh(): Promise<void> {
		if (isConnectionConfigured(this.plugin.settings)) {
			this.conflicts = (await this.plugin.getSyncJournal()?.getAllConflicts()) ?? [];
			try {
				this.backups = (await this.plugin.getRetentionManager()?.listBackups()) ?? [];
				this.backups = this.backups.slice(0, 5);
			} catch {
				this.backups = [];
			}
		} else {
			this.conflicts = [];
			this.backups = [];
		}
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('easy-sync-sidebar');

		contentEl.createEl('h2', { text: 'Easy Sync' });

		if (!isConnectionConfigured(this.plugin.settings)) {
			const cta = contentEl.createDiv({ cls: 'easy-sync-setup-cta' });
			cta.createEl('p', {
				text: 'Configure your S3 connection in settings to start syncing.',
			});
			const openSettings = cta.createEl('button', {
				text: 'Open settings',
				cls: 'mod-cta',
			});
			openSettings.addEventListener('click', () => {
				const setting = (
					this.app as unknown as {
						setting: { open: () => void; openTabById: (id: string) => void };
					}
				).setting;
				setting.open();
				setting.openTabById('easy-sync');
			});
			return;
		}

		this.renderLastSync(contentEl);
		this.renderSyncActions(contentEl);
		this.renderConflicts(contentEl);
		this.renderBackups(contentEl);
	}

	private renderLastSync(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		section.createEl('h3', { text: 'Last sync' });

		const summary = this.plugin.getLastSyncSummary();
		const body = section.createDiv({ cls: 'easy-sync-last-sync' });

		body.createEl('p', {
			text: `Status: ${statusLabel(summary)}`,
		});

		if (summary.completedAt) {
			body.createEl('p', {
				text: `Time: ${new Date(summary.completedAt).toLocaleString()}`,
			});
		}

		body.createEl('p', {
			text:
				`Uploaded ${summary.filesUploaded} · Downloaded ${summary.filesDownloaded} · ` +
				`Deleted ${summary.filesDeleted} · Conflicts ${summary.conflictCount} · ` +
				`Skipped ${summary.filesSkipped}`,
		});

		if (summary.lastError) {
			body.createEl('p', {
				cls: 'easy-sync-error',
				text: summary.lastError,
			});
		}
	}

	private renderSyncActions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		section.createEl('h3', { text: 'Sync' });
		const row = section.createDiv({ cls: 'easy-sync-actions' });
		const syncBtn = row.createEl('button', { text: 'Sync now', cls: 'mod-cta' });
		syncBtn.addEventListener('click', () => {
			void this.plugin.triggerManualSync().then(() => this.refresh());
		});
	}

	private renderConflicts(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		section.createEl('h3', {
			text: `Conflicts (${this.conflicts.length})`,
		});

		if (this.conflicts.length === 0) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: 'No unresolved conflicts',
			});
			return;
		}

		const list = section.createEl('ul', { cls: 'easy-sync-conflict-list' });
		for (const conflict of this.conflicts) {
			const item = list.createEl('li');
			const link = item.createEl('button', {
				text: conflict.path,
				cls: 'easy-sync-conflict-link',
			});
			link.addEventListener('click', () => {
				const resolver = this.plugin.getConflictResolver();
				if (!resolver) {
					new Notice('Sync system not ready');
					return;
				}
				new ConflictModal(this.app, resolver, conflict, () => {
					void this.refresh();
				}).open();
			});
		}
	}

	private renderBackups(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		section.createEl('h3', { text: 'Backups' });

		const actions = section.createDiv({ cls: 'easy-sync-actions' });
		const backupBtn = actions.createEl('button', { text: 'Backup now', cls: 'mod-cta' });
		backupBtn.addEventListener('click', () => {
			void this.plugin.triggerManualBackup().then(() => this.refresh());
		});

		if (this.backups.length === 0) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: 'No backups yet (keeps the last 5)',
			});
			return;
		}

		const list = section.createEl('ul', { cls: 'easy-sync-backup-list' });
		for (const backup of this.backups) {
			const item = list.createEl('li', { cls: 'easy-sync-backup-item' });
			item.createDiv({
				cls: 'easy-sync-backup-meta',
				text: `${new Date(backup.timestamp).toLocaleString()} · ${backup.fileCount} files`,
			});
			const row = item.createDiv({ cls: 'easy-sync-backup-actions' });

			const downloadBtn = row.createEl('button', { text: 'Download' });
			downloadBtn.addEventListener('click', () => {
				void this.plugin
					.getBackupDownloader()
					?.triggerDownload(backup.name)
					.then(() => new Notice('Download started'))
					.catch((error: unknown) => {
						const message = error instanceof Error ? error.message : 'Download failed';
						new Notice(message);
					});
			});

			const restoreBtn = row.createEl('button', { text: 'Restore' });
			restoreBtn.addEventListener('click', () => {
				const downloader = this.plugin.getBackupDownloader();
				if (!downloader) {
					new Notice('Backup system not ready');
					return;
				}
				void restoreBackupWithConfirm(this.app, downloader, backup.name);
			});
		}
	}
}

function statusLabel(summary: LastSyncSummary): string {
	switch (summary.status) {
		case 'syncing':
			return 'Syncing…';
		case 'synced':
			return 'Synced';
		case 'conflicts':
			return 'Conflicts';
		case 'error':
			return 'Error';
		default:
			return 'Idle';
	}
}
