/**
 * Easy Sync sidebar — last sync, Sync now, conflict list, backups.
 * This is the only status surface (no status bar).
 *
 * Conflicts: list unresolved paths; Show diff opens a dedicated page where
 * the user reviews hunks and resolves that file.
 */

import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type EasySyncPlugin from '../main';
import { BackupInfo, ConflictRecord, LastSyncSummary } from '../types';
import { isConnectionConfigured } from '../storage/S3Config';
import { restoreBackupWithConfirm } from '../backup/BackupRestore';
import { formatConflictSideMeta } from './conflictPreview';

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
		if (isConnectionConfigured(this.app, this.plugin.settings)) {
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

		if (!isConnectionConfigured(this.app, this.plugin.settings)) {
			const cta = contentEl.createDiv({ cls: 'easy-sync-setup-cta' });
			cta.createEl('p', {
				text: 'Configure your S3 connection in settings to start syncing.',
			});
			const openSettings = cta.createEl('button', {
				text: 'Open settings',
				cls: 'easy-sync-btn easy-sync-btn-primary',
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
			cls: 'easy-sync-status-line',
			text: statusLabel(summary),
		});

		if (summary.completedAt) {
			body.createEl('p', {
				cls: 'easy-sync-muted',
				text: new Date(summary.completedAt).toLocaleString(),
			});
		}

		const stats = body.createDiv({ cls: 'easy-sync-stat-grid' });
		addStat(stats, 'Uploaded', summary.filesUploaded);
		addStat(stats, 'Downloaded', summary.filesDownloaded);
		addStat(stats, 'Deleted', summary.filesDeleted);
		addStat(stats, 'Conflicts', summary.conflictCount);
		addStat(stats, 'Skipped', summary.filesSkipped);

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
		const syncBtn = section.createEl('button', {
			text: 'Sync now',
			cls: 'easy-sync-btn easy-sync-btn-primary',
		});
		syncBtn.addEventListener('click', () => {
			void this.plugin.triggerManualSync().then(() => this.refresh());
		});
	}

	private renderConflicts(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		section.createEl('h3', { text: 'Conflicts' });

		if (this.conflicts.length === 0) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: 'No unresolved conflicts',
			});
			return;
		}

		section.createEl('p', {
			cls: 'easy-sync-muted',
			text: `${this.conflicts.length} unresolved · Open Show diff to review and resolve each file.`,
		});

		const list = section.createEl('ul', { cls: 'easy-sync-conflict-list' });
		for (const conflict of this.conflicts) {
			const item = list.createEl('li', { cls: 'easy-sync-conflict-item' });
			item.createDiv({
				cls: 'easy-sync-conflict-path',
				text: conflict.path,
			});

			const meta = item.createDiv({ cls: 'easy-sync-conflict-meta' });
			meta.createEl('p', {
				text: `On this device · ${formatConflictSideMeta(conflict, 'device')}`,
			});
			meta.createEl('p', {
				text: `In the cloud · ${formatConflictSideMeta(conflict, 'cloud')}`,
			});

			const showDiff = item.createEl('button', {
				text: 'Show diff',
				cls: 'easy-sync-btn easy-sync-btn-secondary',
			});
			showDiff.addEventListener('click', () => {
				void this.plugin.openConflictDiff(conflict.path);
			});
		}
	}

	private renderBackups(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		section.createEl('h3', { text: 'Backups' });

		const backupBtn = section.createEl('button', {
			text: 'Backup now',
			cls: 'easy-sync-btn easy-sync-btn-primary',
		});
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
			const row = item.createDiv({ cls: 'easy-sync-btn-row' });

			const downloadBtn = row.createEl('button', {
				text: 'Download',
				cls: 'easy-sync-btn easy-sync-btn-secondary',
			});
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

			const restoreBtn = row.createEl('button', {
				text: 'Restore',
				cls: 'easy-sync-btn easy-sync-btn-secondary',
			});
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

function addStat(parent: HTMLElement, label: string, value: number): void {
	const cell = parent.createDiv({ cls: 'easy-sync-stat' });
	cell.createSpan({ cls: 'easy-sync-stat-value', text: String(value) });
	cell.createSpan({ cls: 'easy-sync-stat-label', text: label });
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
