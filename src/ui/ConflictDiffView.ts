/**
 * Dedicated workspace page: inline unified diff + resolve actions for one file.
 * Opened from the Easy Sync sidebar via Show diff.
 */

import { ItemView, Notice, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type EasySyncPlugin from '../main';
import {
	ConflictPreview,
	MAX_DIFF_PAGE_DISPLAY_LINES,
	formatConflictSideMeta,
	loadConflictPreview,
} from './conflictPreview';
import { ConflictResolution } from './ConflictResolver';
import { collapseContextRuns } from '../utils/textDiff';

export const EASY_SYNC_DIFF_VIEW_TYPE = 'easy-sync-conflict-diff';

export class ConflictDiffView extends ItemView {
	plugin: EasySyncPlugin;
	private path: string | null = null;
	private preview: ConflictPreview | null = null;
	private loading = false;
	private resolving = false;
	private loadToken = 0;

	constructor(leaf: WorkspaceLeaf, plugin: EasySyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return EASY_SYNC_DIFF_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.path ? `Diff · ${this.path}` : 'Conflict diff';
	}

	getIcon(): string {
		return 'git-compare';
	}

	getState(): Record<string, unknown> {
		return { path: this.path ?? undefined };
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		this.path = typeof state?.path === 'string' ? state.path : null;
		await super.setState(state, result);
		await this.reload();
	}

	/**
	 * Open (or reopen) a conflict path from Show diff.
	 * Reloads even when Obsidian skips setState because the leaf already has
	 * the same path.
	 */
	async openPath(path: string): Promise<void> {
		this.path = path;
		this.resolving = false;
		this.preview = null;
		const tokenBefore = this.loadToken;
		await this.leaf.setViewState({
			type: EASY_SYNC_DIFF_VIEW_TYPE,
			active: true,
			state: { path },
		});
		// setState may no-op when path is unchanged — force a fresh load then.
		if (this.loadToken === tokenBefore) {
			await this.reload();
		}
	}

	async onOpen(): Promise<void> {
		await this.reload();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private async reload(): Promise<void> {
		const path = this.path;
		if (!path) {
			this.preview = null;
			this.loading = false;
			this.render();
			return;
		}

		const s3 = this.plugin.getS3Provider();
		const pathCodec = this.plugin.getPathCodec();
		const payloadCodec = this.plugin.getPayloadCodec();
		const journal = this.plugin.getSyncJournal();
		if (!s3 || !pathCodec || !payloadCodec || !journal) {
			this.preview = null;
			this.loading = false;
			this.render();
			return;
		}

		const conflict = await journal.getConflict(path);
		if (!conflict) {
			this.preview = {
				kind: 'unavailable',
				path,
				deviceMeta: 'Unavailable',
				cloudMeta: 'Unavailable',
				deviceAvailable: this.app.vault.getAbstractFileByPath(path) instanceof TFile,
				diffLines: [],
				omittedDiffLines: 0,
				identical: false,
				message: 'This conflict is no longer unresolved.',
			};
			this.loading = false;
			this.render();
			return;
		}

		const token = ++this.loadToken;
		this.loading = true;
		this.preview = null;
		this.render();

		try {
			const preview = await loadConflictPreview(
				this.app,
				s3,
				pathCodec,
				payloadCodec,
				conflict,
				{ maxDisplayLines: MAX_DIFF_PAGE_DISPLAY_LINES },
			);
			if (token !== this.loadToken) return;
			this.preview = preview;
		} catch (error) {
			if (token !== this.loadToken) return;
			const message = error instanceof Error ? error.message : 'Failed to load diff';
			this.preview = {
				kind: 'unavailable',
				path,
				deviceMeta: formatConflictSideMeta(conflict, 'device'),
				cloudMeta: formatConflictSideMeta(conflict, 'cloud'),
				deviceAvailable: this.app.vault.getAbstractFileByPath(path) instanceof TFile,
				diffLines: [],
				omittedDiffLines: 0,
				identical: false,
				message,
			};
		} finally {
			if (token === this.loadToken) {
				this.loading = false;
				this.render();
			}
		}
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('easy-sync-diff-page');

		const path = this.path;
		if (!path) {
			contentEl.createEl('p', {
				cls: 'easy-sync-muted',
				text: 'Select a conflict in the Easy Sync sidebar, then choose Show diff.',
			});
			return;
		}

		// Tab title already shows "Conflict diff" — path + Open file share a row.
		if (this.loading) {
			contentEl.createEl('p', {
				cls: 'easy-sync-conflict-path',
				text: path,
			});
			contentEl.createEl('p', { cls: 'easy-sync-muted', text: 'Loading changes…' });
			return;
		}

		const preview = this.preview;
		if (!preview) {
			contentEl.createEl('p', {
				cls: 'easy-sync-conflict-path',
				text: path,
			});
			contentEl.createEl('p', { cls: 'easy-sync-muted', text: 'No diff available.' });
			return;
		}

		const header = contentEl.createDiv({ cls: 'easy-sync-conflict-row' });
		header.createDiv({
			cls: 'easy-sync-conflict-path',
			text: path,
		});
		const openBtn = header.createEl('button', {
			text: preview.deviceAvailable ? 'Open file' : 'Not on device',
			cls: 'easy-sync-btn easy-sync-btn-ghost easy-sync-btn-inline',
		});
		openBtn.disabled = !preview.deviceAvailable || this.resolving;
		openBtn.addEventListener('click', () => {
			void this.openFile(path);
		});

		const meta = contentEl.createDiv({ cls: 'easy-sync-diff-meta' });
		meta.createDiv({ text: `Device ${preview.deviceMeta}` });
		meta.createDiv({ text: `Cloud ${preview.cloudMeta}` });

		const legend = contentEl.createDiv({ cls: 'easy-sync-diff-legend' });
		legend.createSpan({ cls: 'easy-sync-diff-del', text: '− device' });
		legend.createSpan({ cls: 'easy-sync-diff-add', text: '+ cloud' });

		const diffHost = contentEl.createDiv({ cls: 'easy-sync-diff easy-sync-diff-page-body' });
		this.renderDiff(diffHost, preview);

		const actions = contentEl.createDiv({ cls: 'easy-sync-conflict-actions' });
		this.addResolveButton(actions, 'Keep on this device', 'keep-device', true);
		this.addResolveButton(actions, 'Keep in the cloud', 'keep-cloud');
		this.addResolveButton(actions, 'Skip for now', 'skip');
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
			void this.resolve(resolution);
		});
	}

	private async resolve(resolution: ConflictResolution): Promise<void> {
		const path = this.path;
		if (!path) return;

		if (resolution === 'skip') {
			new Notice('Conflict kept for later. Resolve when ready.');
			await this.closeToSidebar();
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
			await resolver.resolve(path, resolution);
			new Notice(`Conflict resolved: ${path}`);
		} catch (error) {
			this.noticeAndUnlock(error, 'Resolve failed');
			this.render();
			return;
		}

		// Navigation is separate from resolve — failures must not look like resolve errors.
		await this.closeToSidebar();
	}

	/** Refresh sidebar, reveal it, then close this diff leaf. */
	private async closeToSidebar(): Promise<void> {
		try {
			this.plugin.refreshConflictUi();
			await this.plugin.activateSidebar();
			this.leaf.detach();
		} catch (error) {
			this.noticeAndUnlock(error, 'Could not return to the sidebar');
			// Resolve may already have cleared the journal — reload instead of stale preview.
			await this.reload();
		}
	}

	/** Surface the error and clear the resolving lock; caller chooses render vs reload. */
	private noticeAndUnlock(error: unknown, fallback: string): void {
		const message = error instanceof Error ? error.message : fallback;
		new Notice(message);
		this.resolving = false;
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
		const items = collapseContextRuns(preview.diffLines);
		for (const item of items) {
			if (item.type === 'fold') {
				list.createDiv({
					cls: 'easy-sync-diff-fold',
					text:
						item.count === 1
							? '··· 1 identical line'
							: `··· ${item.count} identical lines`,
				});
				continue;
			}

			const line = item.line;
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

		if (preview.omittedDiffLines > 0) {
			host.createEl('p', {
				cls: 'easy-sync-muted',
				text: `${preview.omittedDiffLines} more changed lines not shown.`,
			});
		}

		if (preview.message) {
			host.createEl('p', { cls: 'easy-sync-muted', text: preview.message });
		}
	}

	private async openFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice('This file is not on this device');
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}
