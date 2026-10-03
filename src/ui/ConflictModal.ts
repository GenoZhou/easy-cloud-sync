/**
 * Conflict resolution modal — On this device / In the cloud.
 */

import { App, Modal, Setting } from 'obsidian';
import { ConflictRecord } from '../types';
import { ConflictResolution, ConflictResolver } from './ConflictResolver';

function formatMeta(mtime?: number, size?: number): string {
	const parts: string[] = [];
	if (mtime !== undefined) {
		parts.push(new Date(mtime).toLocaleString());
	}
	if (size !== undefined) {
		parts.push(`${size} bytes`);
	}
	return parts.length > 0 ? parts.join(' · ') : 'Unavailable';
}

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

		const versions = contentEl.createDiv({ cls: 'easy-sync-conflict-versions' });

		const device = versions.createDiv({ cls: 'easy-sync-conflict-version' });
		device.createEl('h3', { text: 'On this device' });
		device.createEl('p', {
			text: formatMeta(this.conflict.deviceMtime, this.conflict.deviceSize),
		});

		const cloud = versions.createDiv({ cls: 'easy-sync-conflict-version' });
		cloud.createEl('h3', { text: 'In the cloud' });
		cloud.createEl('p', {
			text: formatMeta(this.conflict.cloudMtime, this.conflict.cloudSize),
		});

		const actions = contentEl.createDiv({ cls: 'easy-sync-modal-actions' });

		const run = async (resolution: ConflictResolution) => {
			await this.resolver.resolve(this.conflict.path, resolution);
			this.close();
			this.onResolved();
		};

		new Setting(actions)
			.addButton((btn) =>
				btn.setButtonText('Keep on this device').setCta().onClick(() => void run('keep-device')),
			)
			.addButton((btn) =>
				btn.setButtonText('Keep in the cloud').onClick(() => void run('keep-cloud')),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Keep both')
					.setTooltip('Keeps the device file; saves the cloud copy as name (conflict YYYY-MM-DD).ext')
					.onClick(() => void run('keep-both')),
			)
			.addButton((btn) =>
				btn.setButtonText('Skip').onClick(() => void run('skip')),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
