/**
 * Dedicated workspace page: inline unified diff for one conflicted file.
 * Opened from the Easy Sync sidebar via Show diff (not the primary decision surface).
 */

import { ItemView, Notice, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type EasySyncPlugin from '../main';
import { ConflictRecord } from '../types';
import {
	ConflictPreview,
	MAX_DIFF_PAGE_DISPLAY_LINES,
	loadConflictPreview,
} from './conflictPreview';

export const EASY_SYNC_DIFF_VIEW_TYPE = 'easy-sync-conflict-diff';

export class ConflictDiffView extends ItemView {
	plugin: EasySyncPlugin;
	private path: string | null = null;
	private preview: ConflictPreview | null = null;
	private loading = false;
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
				deviceMeta: formatConflictMeta(conflict, 'device'),
				cloudMeta: formatConflictMeta(conflict, 'cloud'),
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

		contentEl.createEl('h2', { text: 'Conflict diff' });
		contentEl.createEl('p', {
			cls: 'easy-sync-conflict-path',
			text: path,
		});

		if (this.loading) {
			contentEl.createEl('p', { cls: 'easy-sync-muted', text: 'Loading changes…' });
			return;
		}

		const preview = this.preview;
		if (!preview) {
			contentEl.createEl('p', { cls: 'easy-sync-muted', text: 'No diff available.' });
			return;
		}

		const meta = contentEl.createDiv({ cls: 'easy-sync-conflict-meta' });
		meta.createEl('p', { text: `On this device · ${preview.deviceMeta}` });
		meta.createEl('p', { text: `In the cloud · ${preview.cloudMeta}` });

		const legend = contentEl.createDiv({ cls: 'easy-sync-diff-legend' });
		legend.createSpan({ cls: 'easy-sync-diff-del', text: '− device' });
		legend.createSpan({ cls: 'easy-sync-diff-add', text: '+ cloud' });

		const toolbar = contentEl.createDiv({ cls: 'easy-sync-btn-row' });
		const openBtn = toolbar.createEl('button', {
			text: preview.deviceAvailable ? 'Open file' : 'Not on device',
			cls: 'easy-sync-btn easy-sync-btn-secondary',
		});
		openBtn.disabled = !preview.deviceAvailable;
		openBtn.addEventListener('click', () => {
			void this.openFile(path);
		});

		const diffHost = contentEl.createDiv({ cls: 'easy-sync-diff easy-sync-diff-page-body' });
		this.renderDiff(diffHost, preview);
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

function formatConflictMeta(conflict: ConflictRecord, side: 'device' | 'cloud'): string {
	const mtime = side === 'device' ? conflict.deviceMtime : conflict.cloudMtime;
	const size = side === 'device' ? conflict.deviceSize : conflict.cloudSize;
	const parts: string[] = [];
	if (mtime !== undefined) parts.push(new Date(mtime).toLocaleString());
	if (size !== undefined) parts.push(`${size} bytes`);
	return parts.length > 0 ? parts.join(' · ') : 'Unavailable';
}
