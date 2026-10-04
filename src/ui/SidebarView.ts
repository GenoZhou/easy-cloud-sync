/**
 * Easy Sync sidebar — compact ops surface (no status bar).
 *
 * Status + counts on one line; Sync/Backup are buttons only; each conflict
 * row is path + Show diff (mtime/size live on the diff page).
 */

import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type EasySyncPlugin from '../main';
import { BackupInfo, ConflictRecord, LastSyncSummary } from '../types';
import { isConnectionConfigured } from '../storage/S3Config';
import { restoreBackupWithConfirm } from '../backup/BackupRestore';
import { t } from '../i18n';

export const EASY_SYNC_VIEW_TYPE = 'easy-sync-sidebar';

export class EasySyncSidebarView extends ItemView {
	plugin: EasySyncPlugin;
	private conflicts: ConflictRecord[] = [];
	private backups: BackupInfo[] = [];
	private backupsLoading = false;

	constructor(leaf: WorkspaceLeaf, plugin: EasySyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return EASY_SYNC_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t().sidebar.title;
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
		if (!isConnectionConfigured(this.app, this.plugin.settings)) {
			this.conflicts = [];
			this.backups = [];
			this.backupsLoading = false;
			this.render();
			return;
		}

		this.conflicts = (await this.plugin.getSyncJournal()?.getAllConflicts()) ?? [];
		this.backupsLoading = true;
		this.render();

		try {
			this.backups = (await this.plugin.getRetentionManager()?.listBackups()) ?? [];
			this.backups = this.backups.slice(0, 5);
		} catch {
			this.backups = [];
		} finally {
			this.backupsLoading = false;
		}
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('easy-sync-sidebar');
		const s = t().sidebar;

		contentEl.createEl('h2', { text: s.title });

		if (!isConnectionConfigured(this.app, this.plugin.settings)) {
			const cta = contentEl.createDiv({ cls: 'easy-sync-setup-cta' });
			cta.createEl('p', {
				text: s.configurePrompt,
			});
			const openSettings = cta.createEl('button', {
				text: s.openSettings,
				cls: 'easy-sync-btn easy-sync-btn-primary',
			});
			openSettings.addEventListener('click', () => {
				const setting = (
					this.app as unknown as {
						setting: { open: () => void; openTabById: (id: string) => void };
					}
				).setting;
				setting.open();
				setting.openTabById('easy-sync-s3');
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
		const summary = this.plugin.getLastSyncSummary();
		const s = t().sidebar;

		const statusParts = [statusLabel(summary)];
		if (summary.completedAt) {
			statusParts.push(new Date(summary.completedAt).toLocaleString());
		}
		section.createEl('p', {
			cls: 'easy-sync-status-line',
			text: statusParts.join(' · '),
		});

		section.createEl('p', {
			cls: 'easy-sync-muted easy-sync-stat-line',
			text: s.statLine(
				summary.filesUploaded,
				summary.filesDownloaded,
				summary.filesDeleted,
				this.conflicts.length,
				summary.filesSkipped,
			),
		});

		if (summary.lastError) {
			section.createEl('p', {
				cls: 'easy-sync-error',
				text: summary.lastError,
			});
		}
	}

	private renderSyncActions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		const syncBtn = section.createEl('button', {
			text: t().sidebar.syncNow,
			cls: 'easy-sync-btn easy-sync-btn-primary',
		});
		syncBtn.addEventListener('click', () => {
			void this.plugin.triggerManualSync().then(() => this.refresh());
		});
	}

	private renderConflicts(container: HTMLElement): void {
		if (this.conflicts.length === 0) {
			return;
		}

		const section = container.createDiv({ cls: 'easy-sync-section' });
		const s = t().sidebar;

		section.createEl('p', {
			cls: 'easy-sync-muted',
			text:
				this.conflicts.length === 1
					? s.conflictOne
					: s.conflictsMany(this.conflicts.length),
		});

		const list = section.createEl('ul', { cls: 'easy-sync-conflict-list' });
		for (const conflict of this.conflicts) {
			const item = list.createEl('li', { cls: 'easy-sync-conflict-item' });

			const row = item.createDiv({ cls: 'easy-sync-conflict-row' });
			row.createDiv({
				cls: 'easy-sync-conflict-path',
				text: conflict.path,
			});
			const showDiff = row.createEl('button', {
				text: s.showDiff,
				cls: 'easy-sync-btn easy-sync-btn-ghost easy-sync-btn-inline',
			});
			showDiff.addEventListener('click', () => {
				void this.plugin.openConflictDiff(conflict.path);
			});
		}
	}

	private renderBackups(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		const s = t().sidebar;

		const backupBtn = section.createEl('button', {
			text: s.backupNow,
			cls: 'easy-sync-btn easy-sync-btn-primary',
		});
		backupBtn.addEventListener('click', () => {
			void this.plugin.triggerManualBackup().then(() => this.refresh());
		});

		if (this.backupsLoading) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: s.loadingBackups,
			});
			return;
		}

		if (this.backups.length === 0) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: s.noBackupsYet,
			});
			return;
		}

		const list = section.createEl('ul', { cls: 'easy-sync-backup-list' });
		for (const backup of this.backups) {
			const item = list.createEl('li', { cls: 'easy-sync-backup-item' });
			const row = item.createDiv({ cls: 'easy-sync-backup-row' });
			row.createDiv({
				cls: 'easy-sync-backup-meta',
				text: s.backupMeta(
					new Date(backup.timestamp).toLocaleString(),
					backup.fileCount,
				),
			});
			const restoreBtn = row.createEl('button', {
				text: s.restore,
				cls: 'easy-sync-btn easy-sync-btn-ghost easy-sync-btn-inline',
			});
			restoreBtn.addEventListener('click', () => {
				const downloader = this.plugin.getBackupDownloader();
				if (!downloader) {
					new Notice(s.backupNotReady);
					return;
				}
				void restoreBackupWithConfirm(this.app, downloader, backup.name);
			});
		}
	}
}

function statusLabel(summary: LastSyncSummary): string {
	const s = t().sidebar;
	switch (summary.status) {
		case 'syncing':
			return s.statusSyncing;
		case 'synced':
			return s.statusSynced;
		case 'conflicts':
			return s.statusConflicts;
		case 'error':
			return s.statusError;
		default:
			return s.statusIdle;
	}
}
