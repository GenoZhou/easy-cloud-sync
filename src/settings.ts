/**
 * Settings tab — connection, prefixes, excludes, interval, authority reset.
 * No sync/backup enable toggles; no retention knobs.
 *
 * Declarative settings API (Obsidian 1.13+): `getSettingDefinitions()`.
 */

import {
	App,
	Notice,
	PluginSettingTab,
	SecretComponent,
	SettingDefinitionItem,
} from 'obsidian';
import type EasySyncPlugin from './main';
import {
	EasySyncSettings,
	ResetAuthority,
	S3ProviderType,
	S3_PROVIDER_NAMES,
	SyncIntervalMinutes,
} from './types';
import { normalizePrefix } from './utils/paths';
import { formatBucketLayoutPreview } from './utils/bucketLayout';
import { S3Provider } from './storage/S3Provider';
import { isConnectionConfigured } from './storage/S3Config';
import { ConfirmModal } from './ui/ConfirmModal';
import { t } from './i18n';

export type { EasySyncSettings };
export { DEFAULT_SETTINGS } from './types';

const SYNC_INTERVALS: SyncIntervalMinutes[] = [0, 1, 2, 5, 10, 15, 30];

type SettingsKey = keyof EasySyncSettings;

export class EasySyncSettingTab extends PluginSettingTab {
	plugin: EasySyncPlugin;

	constructor(app: App, plugin: EasySyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const s = t().settings;
		const configDir = this.app.vault.configDir;
		const provider = this.plugin.settings.provider;

		const intervalOptions: Record<string, string> = {};
		for (const minutes of SYNC_INTERVALS) {
			intervalOptions[String(minutes)] =
				minutes === 0 ? s.intervalOff : s.intervalMinutes(minutes);
		}

		return [
			{
				type: 'group',
				heading: s.privacyHeading,
				items: [
					{
						name: s.privacyHeading,
						desc: s.privacyBody(configDir),
						aliases: ['privacy', 'encryption', 'secret storage'],
					},
				],
			},
			{
				type: 'group',
				heading: s.connectionHeading,
				cls: 'easy-sync-settings',
				items: [
					{
						name: s.provider,
						desc: s.providerDesc,
						control: {
							type: 'dropdown',
							key: 'provider',
							options: { ...S3_PROVIDER_NAMES },
						},
					},
					{
						name: s.endpoint,
						desc: provider === 'r2' ? s.endpointR2 : s.endpointCustom,
						visible: () => this.plugin.settings.provider !== 'aws',
						control: {
							type: 'text',
							key: 'endpoint',
							placeholder: 'https://example.com',
						},
					},
					{
						name: s.region,
						desc: provider === 'r2' ? s.regionR2 : s.regionAws,
						control: {
							type: 'text',
							key: 'region',
							placeholder: provider === 'r2' ? 'auto' : 'us-east-1',
						},
					},
					{
						name: s.bucket,
						desc: s.bucketDesc,
						control: {
							type: 'text',
							key: 'bucket',
							placeholder: s.bucketPlaceholder,
						},
					},
					{
						name: s.accessKeyId,
						desc: s.accessKeyIdDesc,
						render: (setting) => {
							setting.addText((text) => {
								text.setPlaceholder(s.accessKeyPlaceholder);
								text.setValue(this.plugin.settings.accessKeyId);
								text.inputEl.type = 'password';
								text.onChange(async (value) => {
									this.plugin.settings.accessKeyId = value;
									await this.plugin.saveSettings();
								});
							});
						},
					},
					{
						name: s.secretAccessKey,
						desc: s.secretAccessKeyDesc,
						render: (setting) => {
							setting.addComponent((container) => {
								return new SecretComponent(this.app, container)
									.setValue(this.plugin.settings.secretAccessKeySecretId)
									.onChange(async (value) => {
										this.plugin.settings.secretAccessKeySecretId = value;
										await this.plugin.saveSettings();
									});
							});
						},
					},
					{
						name: s.forcePathStyle,
						desc: s.forcePathStyleDesc,
						visible: () => this.plugin.settings.provider === 'custom',
						control: {
							type: 'toggle',
							key: 'forcePathStyle',
						},
					},
					{
						name: s.testConnection,
						desc: isConnectionConfigured(this.app, this.plugin.settings)
							? s.testConnectionReady
							: s.testConnectionIncomplete,
						render: (setting) => {
							setting.addButton((btn) => {
								btn.setButtonText(s.testConnection).onClick(async () => {
									btn.setDisabled(true);
									try {
										await this.runTestConnection();
									} finally {
										btn.setDisabled(false);
									}
								});
							});
						},
					},
				],
			},
			{
				type: 'group',
				heading: s.syncHeading,
				items: [
					{
						name: s.syncPrefix,
						desc: s.syncPrefixDesc,
						control: {
							type: 'text',
							key: 'syncPrefix',
						},
					},
					{
						name: s.backupPrefix,
						desc: s.backupPrefixDesc,
						control: {
							type: 'text',
							key: 'backupPrefix',
						},
					},
					{
						name: s.bucketLayoutHeading,
						desc: s.bucketLayoutDesc,
						searchable: false,
						render: (setting) => {
							setting.settingEl.addClass('easy-sync-bucket-layout');
							setting.controlEl.createEl('pre', {
								cls: 'easy-sync-bucket-tree',
								text: this.bucketLayoutText(),
							});
						},
					},
					{
						name: s.syncInterval,
						desc: s.syncIntervalDesc,
						control: {
							type: 'dropdown',
							key: 'syncIntervalMinutes',
							options: intervalOptions,
						},
					},
				],
			},
			{
				type: 'group',
				heading: s.advancedHeading,
				items: [
					{
						name: s.excludePatterns,
						desc: s.excludePatternsDesc,
						render: (setting) => {
							setting.addTextArea((area) => {
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
						},
					},
					{
						name: s.resetLocalName,
						desc: s.resetLocalDesc,
						render: (setting) => {
							setting.addButton((btn) => {
								btn.setButtonText(s.resetLocalButton)
									.setDestructive()
									.onClick(() => {
										void this.confirmAuthorityReset('cloud');
									});
							});
						},
					},
					{
						name: s.resetCloudName,
						desc: s.resetCloudDesc,
						render: (setting) => {
							setting.addButton((btn) => {
								btn.setButtonText(s.resetCloudButton)
									.setDestructive()
									.onClick(() => {
										void this.confirmAuthorityReset('local');
									});
							});
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === 'excludePatterns') {
			return this.plugin.settings.excludePatterns.join('\n');
		}
		if (key === 'syncIntervalMinutes') {
			return String(this.plugin.settings.syncIntervalMinutes);
		}
		return this.plugin.settings[key as SettingsKey];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;

		if (key === 'excludePatterns') {
			settings.excludePatterns = String(value)
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
		} else if (key === 'syncIntervalMinutes') {
			settings.syncIntervalMinutes = Number(value) as SyncIntervalMinutes;
		} else if (key === 'syncPrefix' || key === 'backupPrefix') {
			settings[key] = normalizePrefix(String(value));
		} else if (
			key === 'endpoint' ||
			key === 'region' ||
			key === 'bucket' ||
			key === 'accessKeyId'
		) {
			settings[key] = typeof value === 'string' ? value.trim() : '';
		} else if (key === 'provider') {
			settings.provider = value as S3ProviderType;
		} else if (key === 'forcePathStyle') {
			settings.forcePathStyle = Boolean(value);
		} else if (key in settings) {
			(settings as unknown as Record<string, unknown>)[key] = value;
		}

		await this.plugin.saveSettings();

		if (
			key === 'provider' ||
			key === 'bucket' ||
			key === 'syncPrefix' ||
			key === 'backupPrefix'
		) {
			this.update();
			return;
		}

		this.updateBucketLayoutPreview();
	}

	private updateBucketLayoutPreview(): void {
		const tree = this.containerEl.querySelector('.easy-sync-bucket-tree');
		if (tree instanceof HTMLElement) {
			tree.setText(this.bucketLayoutText());
		}
	}

	private bucketLayoutText(): string {
		const s = t().settings;
		return formatBucketLayoutPreview(
			this.plugin.settings.bucket,
			this.plugin.settings.syncPrefix,
			this.plugin.settings.backupPrefix,
			{
				syncNote: s.bucketLayoutSyncNote,
				backupNote: s.bucketLayoutBackupNote,
			},
		);
	}

	private async runTestConnection(): Promise<void> {
		const s = t().settings;
		try {
			const provider = new S3Provider(this.plugin.settings, this.app);
			const message = await provider.testConnection();
			// Fresh HeadBucket succeeded with offset 0. Rebuild the shared
			// client when idle; during sync only clear a poisoned offset.
			const shared = this.plugin.getS3Provider();
			if (this.plugin.isSyncInProgress()) {
				shared?.resetSystemClockOffset();
			} else {
				shared?.destroy();
			}
			new Notice(message);
		} catch (error) {
			const message = error instanceof Error ? error.message : s.connectionFailed;
			new Notice(message);
		}
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
