/**
 * Settings tab — connection, prefixes, excludes, interval, authority reset.
 * No sync/backup enable toggles; no retention knobs.
 */

import { App, Notice, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type EasySyncPlugin from './main';
import {
	EasySyncSettings,
	ResetAuthority,
	S3ProviderType,
	S3_PROVIDER_NAMES,
	SyncIntervalMinutes,
} from './types';
import { normalizePrefix } from './utils/paths';
import { S3Provider } from './storage/S3Provider';
import { isConnectionConfigured } from './storage/S3Config';
import { ConfirmModal } from './ui/ConfirmModal';
import { t } from './i18n';

export type { EasySyncSettings };
export { DEFAULT_SETTINGS } from './types';

const SYNC_INTERVALS: SyncIntervalMinutes[] = [1, 2, 5, 10, 15, 30];

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
		const s = t().settings;
		new Setting(containerEl).setName(s.privacyHeading).setHeading();
		const configDir = this.app.vault.configDir;
		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: s.privacyBody(configDir),
		});
	}

	private renderConnectionSection(containerEl: HTMLElement): void {
		const s = t().settings;
		new Setting(containerEl).setName(s.connectionHeading).setHeading();

		new Setting(containerEl)
			.setName(s.provider)
			.setDesc(s.providerDesc)
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
				.setName(s.endpoint)
				.setDesc(
					this.plugin.settings.provider === 'r2' ? s.endpointR2 : s.endpointCustom,
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
			.setName(s.region)
			.setDesc(this.plugin.settings.provider === 'r2' ? s.regionR2 : s.regionAws)
			.addText((text) => {
				text.setPlaceholder(this.plugin.settings.provider === 'r2' ? 'auto' : 'us-east-1');
				text.setValue(this.plugin.settings.region);
				text.onChange(async (value) => {
					this.plugin.settings.region = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(s.bucket)
			.setDesc(s.bucketDesc)
			.addText((text) => {
				text.setPlaceholder(s.bucketPlaceholder);
				text.setValue(this.plugin.settings.bucket);
				text.onChange(async (value) => {
					this.plugin.settings.bucket = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(s.accessKeyId)
			.setDesc(s.accessKeyIdDesc)
			.addText((text) => {
				text.setPlaceholder(s.accessKeyPlaceholder);
				text.setValue(this.plugin.settings.accessKeyId);
				text.inputEl.type = 'password';
				text.onChange(async (value) => {
					this.plugin.settings.accessKeyId = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(s.secretAccessKey)
			.setDesc(s.secretAccessKeyDesc)
			.addComponent((container) => {
				return new SecretComponent(this.app, container)
					.setValue(this.plugin.settings.secretAccessKeySecretId)
					.onChange(async (value) => {
						this.plugin.settings.secretAccessKeySecretId = value;
						await this.plugin.saveSettings();
					});
			});

		if (this.plugin.settings.provider === 'custom') {
			new Setting(containerEl)
				.setName(s.forcePathStyle)
				.setDesc(s.forcePathStyleDesc)
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.forcePathStyle);
					toggle.onChange(async (value) => {
						this.plugin.settings.forcePathStyle = value;
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName(s.testConnection)
			.setDesc(
				isConnectionConfigured(this.app, this.plugin.settings)
					? s.testConnectionReady
					: s.testConnectionIncomplete,
			)
			.addButton((btn) => {
				btn.setButtonText(s.testConnection).onClick(async () => {
					btn.setDisabled(true);
					try {
						const provider = new S3Provider(this.plugin.settings, this.app);
						const message = await provider.testConnection();
						new Notice(message);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : s.connectionFailed;
						new Notice(message);
					} finally {
						btn.setDisabled(false);
					}
				});
			});
	}

	private renderSyncSection(containerEl: HTMLElement): void {
		const s = t().settings;
		new Setting(containerEl).setName(s.syncHeading).setHeading();

		new Setting(containerEl)
			.setName(s.syncPrefix)
			.setDesc(s.syncPrefixDesc)
			.addText((text) => {
				text.setValue(this.plugin.settings.syncPrefix);
				text.onChange(async (value) => {
					this.plugin.settings.syncPrefix = normalizePrefix(value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(s.backupPrefix)
			.setDesc(s.backupPrefixDesc)
			.addText((text) => {
				text.setValue(this.plugin.settings.backupPrefix);
				text.onChange(async (value) => {
					this.plugin.settings.backupPrefix = normalizePrefix(value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(s.syncInterval)
			.setDesc(s.syncIntervalDesc)
			.addDropdown((dropdown) => {
				for (const minutes of SYNC_INTERVALS) {
					dropdown.addOption(String(minutes), s.intervalMinutes(minutes));
				}
				dropdown.setValue(String(this.plugin.settings.syncIntervalMinutes));
				dropdown.onChange(async (value) => {
					this.plugin.settings.syncIntervalMinutes = Number(value) as SyncIntervalMinutes;
					await this.plugin.saveSettings();
				});
			});
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		const s = t().settings;
		new Setting(containerEl).setName(s.advancedHeading).setHeading();

		new Setting(containerEl)
			.setName(s.excludePatterns)
			.setDesc(s.excludePatternsDesc)
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
				});
			});

		new Setting(containerEl)
			.setName(s.resetLocalName)
			.setDesc(s.resetLocalDesc)
			.addButton((btn) => {
				btn.setButtonText(s.resetLocalButton)
					.setWarning()
					.onClick(() => {
						void this.confirmAuthorityReset('cloud');
					});
			});

		new Setting(containerEl)
			.setName(s.resetCloudName)
			.setDesc(s.resetCloudDesc)
			.addButton((btn) => {
				btn.setButtonText(s.resetCloudButton)
					.setWarning()
					.onClick(() => {
						void this.confirmAuthorityReset('local');
					});
			});
	}

	private async confirmAuthorityReset(authority: ResetAuthority): Promise<void> {
		const s = t().settings;
		const isCloudAuthority = authority === 'cloud';
		const confirmed = await new ConfirmModal(
			this.app,
			isCloudAuthority ? s.resetLocalConfirmTitle : s.resetCloudConfirmTitle,
			isCloudAuthority ? s.resetLocalConfirmBody : s.resetCloudConfirmBody,
			isCloudAuthority ? s.resetLocalButton : s.resetCloudButton,
		).openAndWait();

		if (!confirmed) return;

		try {
			await this.plugin.runAuthorityReset(authority);
		} catch (error) {
			const message = error instanceof Error ? error.message : t().notices.resetFailed;
			new Notice(message);
		}
	}
}
