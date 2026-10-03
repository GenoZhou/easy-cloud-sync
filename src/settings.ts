/**
 * Settings tab — connection, prefixes, excludes, interval.
 * No sync/backup enable toggles; no retention knobs.
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type EasySyncPlugin from './main';
import {
	EasySyncSettings,
	S3ProviderType,
	S3_PROVIDER_NAMES,
	SyncIntervalMinutes,
} from './types';
import { normalizePrefix } from './utils/paths';
import { S3Provider } from './storage/S3Provider';
import { isConnectionConfigured } from './storage/S3Config';

export type { EasySyncSettings };
export { DEFAULT_SETTINGS } from './types';

const SYNC_INTERVAL_NAMES: Record<SyncIntervalMinutes, string> = {
	1: '1 minute',
	2: '2 minutes',
	5: '5 minutes',
	10: '10 minutes',
	15: '15 minutes',
	30: '30 minutes',
};

export class EasySyncSettingTab extends PluginSettingTab {
	plugin: EasySyncPlugin;

	constructor(app: App, plugin: EasySyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('easy-sync-settings');

		this.renderDisclosure(containerEl);
		this.renderConnectionSection(containerEl);
		this.renderSyncSection(containerEl);
		this.renderAdvancedSection(containerEl);
	}

	private renderDisclosure(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Privacy').setHeading();
		const configDir = this.app.vault.configDir;
		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text:
				'Files are uploaded as-is (no client-side encryption). Anyone with your ' +
				'bucket credentials can read vault contents. Network requests go only to ' +
				'your configured S3-compatible endpoint. Syncing your config folder ' +
				`(${configDir}/) can expose other plugins’ secrets — review exclude patterns ` +
				'carefully. This plugin’s own data.json is never synced.',
		});
	}

	private renderConnectionSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Connection').setHeading();

		new Setting(containerEl)
			.setName('Provider')
			.setDesc('Select your S3-compatible storage provider')
			.addDropdown((dropdown) => {
				for (const [value, name] of Object.entries(S3_PROVIDER_NAMES)) {
					dropdown.addOption(value, name);
				}
				dropdown.setValue(this.plugin.settings.provider);
				dropdown.onChange(async (value) => {
					this.plugin.settings.provider = value as S3ProviderType;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (this.plugin.settings.provider !== 'aws') {
			new Setting(containerEl)
				.setName('Endpoint URL')
				.setDesc(
					this.plugin.settings.provider === 'r2'
						? 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com'
						: 'Full S3-compatible endpoint URL',
				)
				.addText((text) => {
					text.setPlaceholder('https://example.com');
					text.setValue(this.plugin.settings.endpoint);
					text.onChange(async (value) => {
						this.plugin.settings.endpoint = value.trim();
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName('Region')
			.setDesc(
				this.plugin.settings.provider === 'r2'
					? 'Use auto for Cloudflare R2 unless your account requires a region'
					: 'AWS region (e.g. us-east-1)',
			)
			.addText((text) => {
				text.setPlaceholder(this.plugin.settings.provider === 'r2' ? 'auto' : 'us-east-1');
				text.setValue(this.plugin.settings.region);
				text.onChange(async (value) => {
					this.plugin.settings.region = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Bucket')
			.setDesc('Name of your S3 bucket')
			.addText((text) => {
				text.setPlaceholder('Bucket name');
				text.setValue(this.plugin.settings.bucket);
				text.onChange(async (value) => {
					this.plugin.settings.bucket = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Access key ID')
			.setDesc('Your S3 access key ID')
			.addText((text) => {
				text.setPlaceholder('Access key');
				text.setValue(this.plugin.settings.accessKeyId);
				text.inputEl.type = 'password';
				text.onChange(async (value) => {
					this.plugin.settings.accessKeyId = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Secret access key')
			.setDesc('Your S3 secret access key')
			.addText((text) => {
				text.setPlaceholder('Secret key');
				text.setValue(this.plugin.settings.secretAccessKey);
				text.inputEl.type = 'password';
				text.onChange(async (value) => {
					this.plugin.settings.secretAccessKey = value;
					await this.plugin.saveSettings();
				});
			});

		if (this.plugin.settings.provider === 'custom') {
			new Setting(containerEl)
				.setName('Force path style')
				.setDesc('Use path-style URL format (required for some S3-compatible services)')
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.forcePathStyle);
					toggle.onChange(async (value) => {
						this.plugin.settings.forcePathStyle = value;
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName('Test connection')
			.setDesc(
				isConnectionConfigured(this.plugin.settings)
					? 'Verify credentials and bucket access'
					: 'Complete connection settings first',
			)
			.addButton((btn) => {
				btn.setButtonText('Test connection').onClick(async () => {
					btn.setDisabled(true);
					try {
						const provider = new S3Provider(this.plugin.settings);
						const message = await provider.testConnection();
						new Notice(message);
					} catch (error) {
						const message = error instanceof Error ? error.message : 'Connection failed';
						new Notice(message);
					} finally {
						btn.setDisabled(false);
					}
				});
			});
	}

	private renderSyncSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Sync').setHeading();

		new Setting(containerEl)
			.setName('Sync prefix')
			.setDesc('S3 key prefix for synced vault files')
			.addText((text) => {
				text.setValue(this.plugin.settings.syncPrefix);
				text.onChange(async (value) => {
					this.plugin.settings.syncPrefix = normalizePrefix(value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Backup prefix')
			.setDesc('S3 key prefix for snapshot backups')
			.addText((text) => {
				text.setValue(this.plugin.settings.backupPrefix);
				text.onChange(async (value) => {
					this.plugin.settings.backupPrefix = normalizePrefix(value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Sync interval')
			.setDesc('How often to sync automatically (1–30 minutes)')
			.addDropdown((dropdown) => {
				for (const [value, name] of Object.entries(SYNC_INTERVAL_NAMES)) {
					dropdown.addOption(value, name);
				}
				dropdown.setValue(String(this.plugin.settings.syncIntervalMinutes));
				dropdown.onChange(async (value) => {
					this.plugin.settings.syncIntervalMinutes = Number(value) as SyncIntervalMinutes;
					await this.plugin.saveSettings();
					this.plugin.onSettingsChanged();
				});
			});
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Advanced').setHeading();

		new Setting(containerEl)
			.setName('Exclude patterns')
			.setDesc('One glob per line. Defaults exclude workspace JSON and trash.')
			.addTextArea((area) => {
				area.setValue(this.plugin.settings.excludePatterns.join('\n'));
				area.inputEl.rows = 4;
				area.inputEl.addClass('easy-sync-exclude-patterns');
				area.onChange(async (value) => {
					this.plugin.settings.excludePatterns = value
						.split('\n')
						.map((line) => line.trim())
						.filter((line) => line.length > 0);
					await this.plugin.saveSettings();
					this.plugin.onSettingsChanged();
				});
			});

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Write verbose sync/backup logs to the developer console')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.debugLogging);
				toggle.onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
