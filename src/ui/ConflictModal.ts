/**
 * Conflict resolution modal — kept as a thin fallback.
 * Primary UX is the sidebar conflict card (one file at a time + hunk diff).
 */

import { App, Modal } from 'obsidian';
import { ConflictRecord } from '../types';
import { ConflictResolution, ConflictResolver } from './ConflictResolver';

export class ConflictModal extends Modal {
	private resolver: ConflictResolver;
	private conflict: ConflictRecord;
	private onResolved: () => void;

	constructor(
		app: App,
		resolver: ConflictResolver,
		conflict: ConflictRecord,
		onResolved: () => void,
	) {
		super(app);
		this.resolver = resolver;
		this.conflict = conflict;
		this.onResolved = onResolved;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('easy-sync-conflict-modal');

		contentEl.createEl('h2', { text: 'Resolve conflict' });
		contentEl.createEl('p', {
			cls: 'easy-sync-conflict-path',
			text: this.conflict.path,
		});
		contentEl.createEl('p', {
			cls: 'easy-sync-muted',
			text: 'Use the Easy Sync sidebar conflict card to review changes and resolve.',
		});

		const actions = contentEl.createDiv({ cls: 'easy-sync-conflict-actions' });
		const run = async (resolution: ConflictResolution) => {
			await this.resolver.resolve(this.conflict.path, resolution);
			this.close();
			this.onResolved();
		};

		const add = (label: string, resolution: ConflictResolution, primary = false) => {
			const btn = actions.createEl('button', {
				text: label,
				cls: primary
					? 'easy-sync-btn easy-sync-btn-primary'
					: 'easy-sync-btn easy-sync-btn-secondary',
			});
			btn.addEventListener('click', () => void run(resolution));
		};

		add('Keep on this device', 'keep-device', true);
		add('Keep in the cloud', 'keep-cloud');
		add('Keep both', 'keep-both');
		add('Skip', 'skip');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
