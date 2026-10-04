/**
 * Boolean confirm dialog — shared by settings and backup restore.
 */

import { App, Modal } from 'obsidian';
import { t } from '../i18n';

export class ConfirmModal extends Modal {
	private resolve: ((value: boolean) => void) | null = null;

	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmLabel: string,
		private confirmCls: string = 'mod-warning',
	) {
		super(app);
	}

	openAndWait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	private settle(value: boolean): void {
		const resolve = this.resolve;
		if (!resolve) return;
		this.resolve = null;
		resolve(value);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.title });
		contentEl.createEl('p', { text: this.message });
		const row = contentEl.createDiv({ cls: 'easy-sync-modal-actions' });
		const cancel = row.createEl('button', { text: t().common.cancel });
		cancel.addEventListener('click', () => {
			this.settle(false);
			this.close();
		});
		const confirmBtn = row.createEl('button', {
			text: this.confirmLabel,
			cls: this.confirmCls,
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
