/**
 * Easy Sync sidebar — compact ops surface (no status bar).
 *
 * Sync status + Sync now; conflicts; Backups heading + list + Backup now / Refresh.
 * Backup list is loaded on open and via explicit refresh — not on every sync.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type EasySyncPlugin from '../main';
import { BackupInfo, ConflictRecord, LastSyncSummary } from '../types';
import { isConnectionConfigured } from '../storage/S3Config';
import { formatOperationActionLabel } from '../utils/operationUi';
import { t } from '../i18n';

export const EASY_SYNC_VIEW_TYPE = 'easy-sync-sidebar';

export class EasySyncSidebarView extends ItemView {
	plugin: EasySyncPlugin;
	private conflicts: ConflictRecord[] = [];
	private backups: BackupInfo[] = [];
	private backupsLoading = false;
	private backupsLoaded = false;
	private backupsError: string | null = null;

	private statusLineEl: HTMLElement | null = null;
	private nextSyncEl: HTMLElement | null = null;
	private syncBtn: HTMLButtonElement | null = null;
	private backupBtn: HTMLButtonElement | null = null;
	private refreshBackupsBtn: HTMLButtonElement | null = null;
	private restoreButtons: HTMLButtonElement[] = [];

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
		this.clearControlRefs();
	}

	/**
	 * Update in-flight controls without rebuilding the sidebar DOM
	 * (progress labels, disabled state, status line).
	 */
	updateOperationUi(): void {
		if (!this.syncBtn || !this.backupBtn) {
			return;
		}

		const s = t().sidebar;
		const summary = this.plugin.getLastSyncSummary();
		const syncProgress = this.plugin.getSyncProgress();
		const backupProgress = this.plugin.getBackupProgress();
		const busy = this.plugin.isVaultMutationBusy();

		if (this.statusLineEl) {
			this.statusLineEl.setText(statusLineText(summary));
		}

		if (this.nextSyncEl) {
			this.nextSyncEl.setText(nextSyncLabel(this.plugin.getNextSyncAt()));
		}

		this.syncBtn.setText(
			formatOperationActionLabel(
				s.syncNow,
				s.statusSyncing,
				s.syncingProgress,
				syncProgress,
			),
		);
		this.backupBtn.setText(
			formatOperationActionLabel(
				s.backupNow,
				s.statusBackingUp,
				s.backingUpProgress,
				backupProgress,
			),
		);
		this.syncBtn.disabled = busy;
		this.backupBtn.disabled = busy;
		if (this.refreshBackupsBtn) {
			this.refreshBackupsBtn.disabled = busy || this.backupsLoading;
		}
		for (const btn of this.restoreButtons) {
			btn.disabled = busy;
		}
	}

	/** Initial / full load: sync state + backup list. */
	async refresh(): Promise<void> {
		await this.reloadConflicts();
		await this.reloadBackups();
		this.render();
	}

	/** Sync status + conflicts only; keep cached backup list. */
	async refreshSyncState(): Promise<void> {
		await this.reloadConflicts();
		this.render();
	}

	/** Explicitly reload the backup list from S3. */
	async refreshBackups(): Promise<void> {
		await this.reloadBackups();
		this.render();
	}

	private async reloadConflicts(): Promise<void> {
		if (!isConnectionConfigured(this.app, this.plugin.settings)) {
			this.conflicts = [];
			return;
		}
		this.conflicts = (await this.plugin.getSyncJournal()?.getAllConflicts()) ?? [];
	}

	private async reloadBackups(): Promise<void> {
		if (!isConnectionConfigured(this.app, this.plugin.settings)) {
			this.backups = [];
			this.backupsLoading = false;
			this.backupsLoaded = false;
			this.backupsError = null;
			return;
		}

		this.backupsLoading = true;
		this.backupsError = null;
		this.render();

		try {
			this.backups = (await this.plugin.getRetentionManager()?.listBackups()) ?? [];
			this.backupsLoaded = true;
			this.backupsError = null;
		} catch (error) {
			this.backups = [];
			this.backupsLoaded = true;
			this.backupsError =
				error instanceof Error ? error.message : t().sidebar.loadBackupsFailed;
		} finally {
			this.backupsLoading = false;
		}
	}

	private clearControlRefs(): void {
		this.statusLineEl = null;
		this.nextSyncEl = null;
		this.syncBtn = null;
		this.backupBtn = null;
		this.refreshBackupsBtn = null;
		this.restoreButtons = [];
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.clearControlRefs();
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
				setting.openTabById(this.plugin.manifest.id);
			});
			return;
		}

		this.renderSyncSection(contentEl);
		this.renderConflicts(contentEl);
		this.renderBackupSection(contentEl);
		this.updateOperationUi();
	}

	private renderSyncSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		const summary = this.plugin.getLastSyncSummary();
		const s = t().sidebar;

		this.statusLineEl = section.createEl('p', {
			cls: 'easy-sync-status-line',
			text: statusLineText(summary),
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

		this.nextSyncEl = section.createEl('p', {
			cls: 'easy-sync-muted easy-sync-next-sync',
			text: nextSyncLabel(this.plugin.getNextSyncAt()),
		});

		if (summary.lastError) {
			section.createEl('p', {
				cls: 'easy-sync-error',
				text: summary.lastError,
			});
		}

		this.syncBtn = section.createEl('button', {
			text: s.syncNow,
			cls: 'easy-sync-btn easy-sync-btn-ghost easy-sync-btn-block',
		});
		this.syncBtn.addEventListener('click', () => {
			// Sync complete/error callbacks refresh sync UI; avoid a second list fetch here.
			void this.plugin.triggerManualSync();
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

	private renderBackupSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		const s = t().sidebar;
		const retainCopies = this.plugin.settings.backupRetainCopies;

		section.createEl('h3', {
			cls: 'easy-sync-section-heading',
			text: s.backupsHeading,
		});

		if (this.backupsLoading || !this.backupsLoaded) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: s.loadingBackups,
			});
		} else if (this.backupsError !== null) {
			section.createEl('p', {
				cls: 'easy-sync-error',
				text: this.backupsError || s.loadBackupsFailed,
			});
		} else if (this.backups.length === 0) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: s.noBackupsYet(retainCopies),
			});
		} else {
			const list = section.createEl('ul', { cls: 'easy-sync-backup-list' });
			for (const backup of this.backups.slice(0, retainCopies)) {
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
				this.restoreButtons.push(restoreBtn);
				restoreBtn.addEventListener('click', () => {
					void this.plugin.triggerRestoreBackup(backup.name);
				});
			}
		}

		const actions = section.createDiv({ cls: 'easy-sync-backup-actions' });
		this.backupBtn = actions.createEl('button', {
			text: s.backupNow,
			cls: 'easy-sync-btn easy-sync-btn-ghost easy-sync-btn-block',
		});
		this.backupBtn.addEventListener('click', () => {
			// Plugin finally refreshes the backup list; avoid a duplicate fetch here.
			void this.plugin.triggerManualBackup();
		});

		this.refreshBackupsBtn = actions.createEl('button', {
			text: s.refreshBackups,
			cls: 'easy-sync-btn easy-sync-btn-ghost easy-sync-btn-block',
		});
		this.refreshBackupsBtn.addEventListener('click', () => {
			void this.refreshBackups();
		});
	}
}

function nextSyncLabel(nextSyncAt: number | null): string {
	const s = t().sidebar;
	if (nextSyncAt === null) {
		return s.nextSyncManual;
	}
	return s.nextSyncAt(new Date(nextSyncAt).toLocaleString());
}

function statusLineText(summary: LastSyncSummary): string {
	const s = t().sidebar;
	let label: string;
	switch (summary.status) {
		case 'syncing':
			label = s.statusSyncing;
			break;
		case 'synced':
			label = s.statusSynced;
			break;
		case 'conflicts':
			label = s.statusConflicts;
			break;
		case 'error':
			label = s.statusError;
			break;
		default:
			label = s.statusIdle;
	}
	if (summary.completedAt && summary.status !== 'syncing') {
		return `${label} · ${new Date(summary.completedAt).toLocaleString()}`;
	}
	return label;
}
