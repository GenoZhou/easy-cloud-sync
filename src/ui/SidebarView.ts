/**
 * Easy Sync sidebar — last sync, Sync now, conflict card, backups.
 * This is the only status surface (no status bar).
 */

import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type EasySyncPlugin from '../main';
import { BackupInfo, ConflictRecord, LastSyncSummary } from '../types';
import { isConnectionConfigured } from '../storage/S3Config';
import { restoreBackupWithConfirm } from '../backup/BackupRestore';
import { ConflictPreview, loadConflictPreview } from './conflictPreview';
import { ConflictResolution } from './ConflictResolver';

export const EASY_SYNC_VIEW_TYPE = 'easy-sync-sidebar';

export class EasySyncSidebarView extends ItemView {
	plugin: EasySyncPlugin;
	private conflicts: ConflictRecord[] = [];
	private backups: BackupInfo[] = [];
	/** Index into {@link conflicts} for the one-at-a-time conflict card. */
	private conflictIndex = 0;
	private preview: ConflictPreview | null = null;
	private previewLoading = false;
	private previewPath: string | null = null;
	private resolving = false;
	/** Session cache so Prev/Next does not re-download cloud bodies. */
	private previewCache = new Map<string, ConflictPreview>();

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
			if (this.conflictIndex >= this.conflicts.length) {
				this.conflictIndex = Math.max(0, this.conflicts.length - 1);
			}
			const livePaths = new Set(this.conflicts.map((c) => c.path));
			for (const path of this.previewCache.keys()) {
				if (!livePaths.has(path)) {
					this.previewCache.delete(path);
				}
			}
			try {
				this.backups = (await this.plugin.getRetentionManager()?.listBackups()) ?? [];
				this.backups = this.backups.slice(0, 5);
			} catch {
				this.backups = [];
			}
		} else {
			this.conflicts = [];
			this.backups = [];
			this.conflictIndex = 0;
			this.preview = null;
			this.previewPath = null;
			this.previewCache.clear();
		}
		this.render();
		void this.ensureConflictPreview();
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
		this.renderConflictCard(contentEl);
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

	private renderConflictCard(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'easy-sync-section' });
		section.createEl('h3', { text: 'Conflicts' });

		if (this.conflicts.length === 0) {
			section.createEl('p', {
				cls: 'easy-sync-muted',
				text: 'No unresolved conflicts',
			});
			return;
		}

		const conflict = this.conflicts[this.conflictIndex]!;
		const card = section.createDiv({ cls: 'easy-sync-conflict-card' });

		const header = card.createDiv({ cls: 'easy-sync-conflict-card-header' });
		header.createSpan({
			cls: 'easy-sync-conflict-pager-label',
			text: `${this.conflictIndex + 1} of ${this.conflicts.length}`,
		});
		const pager = header.createDiv({ cls: 'easy-sync-conflict-pager' });
		const prev = pager.createEl('button', {
			text: 'Prev',
			cls: 'easy-sync-btn easy-sync-btn-ghost',
		});
		prev.disabled = this.conflictIndex <= 0;
		prev.addEventListener('click', () => {
			this.showConflictAt(this.conflictIndex - 1);
		});
		const next = pager.createEl('button', {
			text: 'Next',
			cls: 'easy-sync-btn easy-sync-btn-ghost',
		});
		next.disabled = this.conflictIndex >= this.conflicts.length - 1;
		next.addEventListener('click', () => {
			this.showConflictAt(this.conflictIndex + 1);
		});

		card.createEl('p', {
			cls: 'easy-sync-conflict-path',
			text: conflict.path,
		});

		const meta = card.createDiv({ cls: 'easy-sync-conflict-meta' });
		meta.createEl('p', {
			text: `On this device · ${this.preview?.deviceMeta ?? formatConflictMeta(conflict, 'device')}`,
		});
		meta.createEl('p', {
			text: `In the cloud · ${this.preview?.cloudMeta ?? formatConflictMeta(conflict, 'cloud')}`,
		});

		const legend = card.createDiv({ cls: 'easy-sync-diff-legend' });
		legend.createSpan({ cls: 'easy-sync-diff-del', text: '− device' });
		legend.createSpan({ cls: 'easy-sync-diff-add', text: '+ cloud' });

		const diffHost = card.createDiv({ cls: 'easy-sync-diff' });
		if (this.previewLoading && this.previewPath === conflict.path) {
			diffHost.createEl('p', { cls: 'easy-sync-muted', text: 'Loading changes…' });
		} else if (this.preview && this.preview.path === conflict.path) {
			this.renderDiff(diffHost, this.preview);
		} else {
			diffHost.createEl('p', { cls: 'easy-sync-muted', text: 'Loading changes…' });
		}

		const nav = card.createDiv({ cls: 'easy-sync-btn-row' });
		const deviceAvailable =
			this.preview?.path === conflict.path
				? this.preview.deviceAvailable
				: this.app.vault.getAbstractFileByPath(conflict.path) instanceof TFile;
		const openBtn = nav.createEl('button', {
			text: deviceAvailable ? 'Open file' : 'Not on device',
			cls: 'easy-sync-btn easy-sync-btn-secondary',
		});
		openBtn.disabled = !deviceAvailable;
		openBtn.addEventListener('click', () => {
			void this.openConflictFile(conflict.path);
		});

		const actions = card.createDiv({ cls: 'easy-sync-conflict-actions' });
		this.addResolveButton(actions, 'Keep on this device', 'keep-device', true);
		this.addResolveButton(actions, 'Keep in the cloud', 'keep-cloud');
		this.addResolveButton(actions, 'Keep both', 'keep-both');
		this.addResolveButton(actions, 'Skip', 'skip');
	}

	private renderDiff(host: HTMLElement, preview: ConflictPreview): void {
		if (preview.message && preview.diffLines.length === 0) {
			host.createEl('p', { cls: 'easy-sync-muted', text: preview.message });
			return;
		}

		if (preview.identical) {
			host.createEl('p', {
				cls: 'easy-sync-muted',
				text: preview.message ?? 'No text changes.',
			});
			return;
		}

		const list = host.createDiv({ cls: 'easy-sync-diff-lines' });
		for (const line of preview.diffLines) {
			const row = list.createDiv({
				cls: `easy-sync-diff-line easy-sync-diff-${line.kind}`,
			});
			const prefix =
				line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ';
			row.createSpan({ cls: 'easy-sync-diff-prefix', text: prefix });
			row.createSpan({
				cls: 'easy-sync-diff-text',
				text: line.text.length > 0 ? line.text : ' ',
			});
		}

		if (preview.omittedDiffLines > 0 || preview.truncatedInput) {
			const note = host.createEl('p', { cls: 'easy-sync-muted' });
			const parts: string[] = [];
			if (preview.truncatedInput) {
				parts.push('Large file — only the first part was compared.');
			}
			if (preview.omittedDiffLines > 0) {
				parts.push(`${preview.omittedDiffLines} more changed lines not shown.`);
			}
			parts.push('Open the file to review the rest.');
			note.setText(parts.join(' '));
		}

		if (preview.message) {
			host.createEl('p', { cls: 'easy-sync-muted', text: preview.message });
		}
	}

	private addResolveButton(
		parent: HTMLElement,
		label: string,
		resolution: ConflictResolution,
		primary = false,
	): void {
		const btn = parent.createEl('button', {
			text: label,
			cls: primary
				? 'easy-sync-btn easy-sync-btn-primary'
				: 'easy-sync-btn easy-sync-btn-secondary',
		});
		btn.disabled = this.resolving;
		btn.addEventListener('click', () => {
			void this.resolveCurrent(resolution);
		});
	}

	private showConflictAt(index: number): void {
		if (index < 0 || index >= this.conflicts.length) return;
		this.conflictIndex = index;
		const path = this.conflicts[index]!.path;
		const cached = this.previewCache.get(path);
		this.preview = cached ?? null;
		this.previewPath = cached ? path : null;
		this.previewLoading = !cached;
		this.render();
		if (!cached) {
			void this.ensureConflictPreview();
		}
	}

	private async resolveCurrent(resolution: ConflictResolution): Promise<void> {
		const conflict = this.conflicts[this.conflictIndex];
		if (!conflict) return;

		if (resolution === 'skip') {
			if (this.conflicts.length <= 1) {
				new Notice('Conflict kept for later. Resolve when ready.');
				return;
			}
			const nextIndex = (this.conflictIndex + 1) % this.conflicts.length;
			new Notice('Skipped — still unresolved. Showing next conflict.');
			this.showConflictAt(nextIndex);
			return;
		}

		const resolver = this.plugin.getConflictResolver();
		if (!resolver) {
			new Notice('Sync system not ready');
			return;
		}

		this.resolving = true;
		this.render();
		try {
			await resolver.resolve(conflict.path, resolution);
			this.previewCache.delete(conflict.path);
			new Notice(`Conflict resolved: ${conflict.path}`);
			await this.refresh();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Resolve failed';
			new Notice(message);
			this.resolving = false;
			this.render();
		} finally {
			this.resolving = false;
		}
	}

	private async openConflictFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice('This file is not on this device');
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async ensureConflictPreview(): Promise<void> {
		const conflict = this.conflicts[this.conflictIndex];
		if (!conflict) {
			this.preview = null;
			this.previewPath = null;
			this.previewLoading = false;
			return;
		}

		const path = conflict.path;
		const cached = this.previewCache.get(path);
		if (cached) {
			if (this.preview === cached && this.previewPath === path && !this.previewLoading) {
				return;
			}
			this.preview = cached;
			this.previewPath = path;
			this.previewLoading = false;
			this.render();
			return;
		}

		// Already loading this path — avoid a second render flash.
		if (this.previewLoading && this.previewPath === path && !this.preview) {
			return;
		}

		const s3 = this.plugin.getS3Provider();
		const pathCodec = this.plugin.getPathCodec();
		const payloadCodec = this.plugin.getPayloadCodec();
		if (!s3 || !pathCodec || !payloadCodec) {
			return;
		}

		this.previewLoading = true;
		this.previewPath = path;
		this.preview = null;
		this.render();

		try {
			const preview = await loadConflictPreview(
				this.app,
				s3,
				pathCodec,
				payloadCodec,
				conflict,
			);
			if (this.previewPath !== path) return;
			this.previewCache.set(path, preview);
			this.preview = preview;
		} catch (error) {
			if (this.previewPath !== path) return;
			const message = error instanceof Error ? error.message : 'Failed to load diff';
			const failed: ConflictPreview = {
				kind: 'unavailable',
				path,
				deviceMeta: formatConflictMeta(conflict, 'device'),
				cloudMeta: formatConflictMeta(conflict, 'cloud'),
				deviceAvailable: this.app.vault.getAbstractFileByPath(path) instanceof TFile,
				diffLines: [],
				omittedDiffLines: 0,
				truncatedInput: false,
				identical: false,
				message,
			};
			this.previewCache.set(path, failed);
			this.preview = failed;
		} finally {
			this.previewLoading = false;
			if (this.previewPath === path) {
				this.render();
			}
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

function formatConflictMeta(conflict: ConflictRecord, side: 'device' | 'cloud'): string {
	const mtime = side === 'device' ? conflict.deviceMtime : conflict.cloudMtime;
	const size = side === 'device' ? conflict.deviceSize : conflict.cloudSize;
	const parts: string[] = [];
	if (mtime !== undefined) parts.push(new Date(mtime).toLocaleString());
	if (size !== undefined) parts.push(`${size} bytes`);
	return parts.length > 0 ? parts.join(' · ') : 'Unavailable';
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
