/**
 * Easy Sync — Obsidian community plugin
 *
 * Sync a vault to AWS S3, Cloudflare R2, or any S3-compatible endpoint,
 * with manual snapshot backups (retain 5) and conflict resolution UX.
 *
 * Sync engine / S3 transport adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 */

import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, EasySyncSettingTab } from './settings';
import {
	EasySyncSettings,
	EMPTY_SYNC_SUMMARY,
	LastSyncSummary,
	ResetAuthority,
	SyncResult,
} from './types';
import { S3Provider } from './storage/S3Provider';
import { isConnectionConfigured } from './storage/S3Config';
import { SyncJournal } from './sync/SyncJournal';
import { ChangeTracker } from './sync/ChangeTracker';
import { SyncPathCodec } from './sync/SyncPathCodec';
import { SyncPayloadCodec } from './sync/SyncPayloadCodec';
import { SyncEngine } from './sync/SyncEngine';
import { SyncScheduler } from './sync/SyncScheduler';
import { computeDestinationFingerprint } from './sync/DestinationFingerprint';
import {
	DESTINATION_FINGERPRINT_KEY,
	RESET_AUTHORITY_KEY,
} from './sync/journalKeys';
import { allowsAutomaticSync } from './sync/autoSync';
import { SnapshotCreator } from './backup/SnapshotCreator';
import { BackupDownloader } from './backup/BackupDownloader';
import { RetentionManager } from './backup/RetentionManager';
import { getOrCreateDeviceId } from './utils/deviceId';
import { ConflictResolver } from './ui/ConflictResolver';
import { ConflictDiffView, EASY_SYNC_DIFF_VIEW_TYPE } from './ui/ConflictDiffView';
import { EasySyncSidebarView, EASY_SYNC_VIEW_TYPE } from './ui/SidebarView';
import { t } from './i18n';

/** Journal metadata key for durable last-sync sidebar summary (JSON string). */
const LAST_SYNC_SUMMARY_KEY = 'lastSyncSummary';

export default class EasySyncPlugin extends Plugin {
	settings!: EasySyncSettings;

	private s3Provider: S3Provider | null = null;
	private syncJournal: SyncJournal | null = null;
	private changeTracker: ChangeTracker | null = null;
	private pathCodec: SyncPathCodec | null = null;
	private payloadCodec: SyncPayloadCodec | null = null;
	private syncEngine: SyncEngine | null = null;
	private syncScheduler: SyncScheduler | null = null;
	private snapshotCreator: SnapshotCreator | null = null;
	private backupDownloader: BackupDownloader | null = null;
	private retentionManager: RetentionManager | null = null;
	private conflictResolver: ConflictResolver | null = null;
	private deviceId = '';
	private isBackupRunning = false;
	private lastSyncSummary: LastSyncSummary = { ...EMPTY_SYNC_SUMMARY };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.deviceId = getOrCreateDeviceId(this.app);

		this.s3Provider = new S3Provider(this.settings, this.app);

		const vaultName = this.app.vault.getName();
		this.syncJournal = new SyncJournal(vaultName);
		await this.syncJournal.initialize();
		await this.loadLastSyncSummary();

		this.pathCodec = new SyncPathCodec(this.settings.syncPrefix);
		this.payloadCodec = new SyncPayloadCodec();
		this.changeTracker = new ChangeTracker(this);

		this.syncEngine = new SyncEngine(
			this.app,
			this.s3Provider,
			this.syncJournal,
			this.pathCodec,
			this.payloadCodec,
			this.changeTracker,
			this.settings,
			this.deviceId,
		);

		this.syncScheduler = new SyncScheduler(this, this.syncEngine, this.settings);
		this.syncScheduler.setCallbacks({
			onSyncStart: () => {
				this.lastSyncSummary = {
					...this.lastSyncSummary,
					status: 'syncing',
					lastError: null,
				};
				this.refreshSidebar();
			},
			onSyncComplete: (result) => {
				this.lastSyncSummary = summaryFromResult(result);
				void this.persistLastSyncSummary();
				this.refreshSidebar();
				const nonRecoverable = result.errors.find((error) => !error.recoverable);
				if (nonRecoverable) {
					new Notice(`Sync blocked: ${nonRecoverable.message}`, 15000);
				}
			},
			onSyncError: (error) => {
				this.lastSyncSummary = {
					...this.lastSyncSummary,
					status: 'error',
					lastError: error,
				};
				void this.persistLastSyncSummary();
				this.refreshSidebar();
			},
		});

		this.snapshotCreator = new SnapshotCreator(this.app, this.s3Provider, this.settings);
		this.backupDownloader = new BackupDownloader(this.s3Provider, this.settings);
		this.retentionManager = new RetentionManager(this.s3Provider, this.settings);
		this.conflictResolver = new ConflictResolver(
			this.app,
			this.s3Provider,
			this.syncJournal,
			this.pathCodec,
			this.payloadCodec,
			this.deviceId,
		);

		this.registerView(EASY_SYNC_VIEW_TYPE, (leaf) => new EasySyncSidebarView(leaf, this));
		this.registerView(EASY_SYNC_DIFF_VIEW_TYPE, (leaf) => new ConflictDiffView(leaf, this));

		this.addRibbonIcon('refresh-cw', t().commands.ribbonOpen, () => {
			void this.activateSidebar();
		});

		this.addSettingTab(new EasySyncSettingTab(this.app, this));
		this.registerCommands();
		this.startSyncServices();

		this.app.workspace.onLayoutReady(() => {
			if (
				isConnectionConfigured(this.app, this.settings) &&
				allowsAutomaticSync(this.settings.syncIntervalMinutes)
			) {
				void this.syncScheduler?.triggerSync('startup');
			}
		});
	}

	onunload(): void {
		this.stopSyncServices();
		this.syncJournal?.close();
		this.syncJournal = null;
		this.s3Provider?.destroy();
		this.s3Provider = null;
	}

	async loadSettings(): Promise<void> {
		const loaded = ((await this.loadData()) ?? {}) as Partial<EasySyncSettings> & {
			secretAccessKey?: string;
			conflictFolder?: string;
		};
		// Unpublished: drop legacy plaintext secret and unused Keep-both folder.
		delete loaded.secretAccessKey;
		delete loaded.conflictFolder;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);

		this.s3Provider?.updateSettings(this.settings);
		this.syncEngine?.updateSettings(this.settings);
		this.pathCodec?.updatePrefix(this.settings.syncPrefix);
		this.syncScheduler?.updateSettings(this.settings);
		this.snapshotCreator?.updateSettings(this.settings);
		this.backupDownloader?.updateSettings(this.settings);
		this.retentionManager?.updateSettings(this.settings);
		this.changeTracker?.updateExcludePatterns(this.settings.excludePatterns);

		// Start/stop scheduler from connection state; avoid tearing down ChangeTracker on every keystroke.
		if (isConnectionConfigured(this.app, this.settings)) {
			this.syncScheduler?.start();
		} else {
			this.syncScheduler?.stop();
		}
		this.refreshSidebar();
	}

	/**
	 * Advanced reset: clear journal, prefer one side, then sync.
	 * - local → overwrite cloud from this device
	 * - cloud → overwrite this device from the cloud
	 */
	async runAuthorityReset(authority: ResetAuthority): Promise<void> {
		if (!this.syncJournal) {
			throw new Error(t().notices.journalUnavailable);
		}
		if (!isConnectionConfigured(this.app, this.settings)) {
			throw new Error(t().notices.configureBeforeSync);
		}
		if (this.isSyncInProgress()) {
			throw new Error(t().notices.syncInProgress);
		}

		await this.syncJournal.clear();
		await this.syncJournal.setMetadata(
			DESTINATION_FINGERPRINT_KEY,
			computeDestinationFingerprint(this.settings),
		);
		await this.syncJournal.setMetadata(RESET_AUTHORITY_KEY, authority);
		this.lastSyncSummary = { ...EMPTY_SYNC_SUMMARY };
		this.refreshSidebar();

		new Notice(
			authority === 'cloud'
				? t().notices.resetLocalStarted
				: t().notices.resetCloudStarted,
		);
		await this.triggerManualSync({ skipStartNotice: true });
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'easy-sync-now',
			name: t().commands.syncNow,
			callback: () => {
				void this.triggerManualSync();
			},
		});

		this.addCommand({
			id: 'easy-sync-open-sidebar',
			name: t().commands.openSidebar,
			callback: () => {
				void this.activateSidebar();
			},
		});

		this.addCommand({
			id: 'easy-sync-backup-now',
			name: t().commands.backupNow,
			callback: () => {
				void this.triggerManualBackup();
			},
		});
	}

	private startSyncServices(): void {
		this.changeTracker?.startTracking(this.settings.excludePatterns);
		if (isConnectionConfigured(this.app, this.settings)) {
			this.syncScheduler?.start();
		}
	}

	private stopSyncServices(): void {
		this.changeTracker?.stopTracking();
		this.syncScheduler?.stop();
	}

	async triggerManualSync(options?: { skipStartNotice?: boolean }): Promise<void> {
		if (!isConnectionConfigured(this.app, this.settings)) {
			new Notice(t().notices.configureBeforeSync);
			return;
		}

		if (this.isSyncInProgress()) {
			new Notice(t().notices.syncInProgress);
			return;
		}

		if (!options?.skipStartNotice) {
			new Notice(t().notices.startingSync);
		}
		const result = await this.syncScheduler?.triggerSync('manual');

		if (!result) {
			new Notice(t().notices.syncDidNotRun);
			return;
		}

		const firstError = result.errors[0];
		if (firstError) {
			new Notice(t().notices.syncErrors(firstError.message));
			return;
		}

		if (result.conflicts.length > 0) {
			new Notice(t().notices.syncConflicts(result.conflicts.length));
			return;
		}

		new Notice(
			t().notices.syncDone(
				result.filesUploaded,
				result.filesDownloaded,
				result.filesDeleted,
			),
		);
	}

	async triggerManualBackup(): Promise<void> {
		if (!isConnectionConfigured(this.app, this.settings)) {
			new Notice(t().notices.configureBeforeBackup);
			return;
		}

		if (this.isBackupRunning) {
			new Notice(t().notices.backupInProgress);
			return;
		}

		if (!this.snapshotCreator || !this.retentionManager) {
			new Notice(t().notices.backupNotReady);
			return;
		}

		new Notice(t().notices.startingBackup);
		this.isBackupRunning = true;

		try {
			const vaultName = this.app.vault.getName();
			const result = await this.snapshotCreator.createSnapshot(this.deviceId, vaultName);

			// Retain-5 whenever a snapshot exists on S3, including partial success.
			if (result.snapshotCreated) {
				await this.retentionManager.applyRetentionPolicy();
			}

			if (result.success) {
				new Notice(t().notices.backupDone(result.filesBackedUp));
			} else {
				const errorMsg = result.errors[0] ?? t().notices.unknownError;
				new Notice(t().notices.backupErrors(errorMsg));
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : t().notices.unknownError;
			new Notice(t().notices.backupFailed(errorMessage));
		} finally {
			this.isBackupRunning = false;
			this.refreshSidebar();
		}
	}

	async activateSidebar(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(EASY_SYNC_VIEW_TYPE)[0];
		if (!leaf) {
			const right = workspace.getRightLeaf(false);
			leaf = right ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: EASY_SYNC_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (view instanceof EasySyncSidebarView) {
			await view.refresh();
		}
	}

	/** Open the dedicated conflict-diff page for one vault path. */
	async openConflictDiff(path: string): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(EASY_SYNC_DIFF_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			// Create the view without loading a path — openPath owns path + preview fetch.
			await leaf.setViewState({
				type: EASY_SYNC_DIFF_VIEW_TYPE,
				active: true,
			});
		}
		await workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (view instanceof ConflictDiffView) {
			await view.openPath(path);
			return;
		}
		await leaf.setViewState({
			type: EASY_SYNC_DIFF_VIEW_TYPE,
			active: true,
			state: { path },
		});
	}

	/** Refresh sidebar after conflict resolve or sync status changes. */
	refreshConflictUi(): void {
		this.refreshSidebar();
	}

	private refreshSidebar(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(EASY_SYNC_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof EasySyncSidebarView) {
				void view.refresh();
			}
		}
	}

	getLastSyncSummary(): LastSyncSummary {
		return this.lastSyncSummary;
	}

	/** Restore last-run summary from the journal so the sidebar survives reload. */
	private async loadLastSyncSummary(): Promise<void> {
		if (!this.syncJournal) return;
		const raw = await this.syncJournal.getMetadata(LAST_SYNC_SUMMARY_KEY);
		if (typeof raw !== 'string' || raw.length === 0) return;

		try {
			const parsed = JSON.parse(raw) as Partial<LastSyncSummary>;
			const status = parsed.status === 'syncing' ? 'idle' : (parsed.status ?? 'idle');
			this.lastSyncSummary = {
				...EMPTY_SYNC_SUMMARY,
				...parsed,
				status,
			};
		} catch {
			// Ignore corrupt persisted summary; next sync will rewrite it.
		}
	}

	private async persistLastSyncSummary(): Promise<void> {
		if (!this.syncJournal) return;
		if (this.lastSyncSummary.status === 'syncing') return;
		await this.syncJournal.setMetadata(
			LAST_SYNC_SUMMARY_KEY,
			JSON.stringify(this.lastSyncSummary),
		);
	}

	getSyncJournal(): SyncJournal | null {
		return this.syncJournal;
	}

	getRetentionManager(): RetentionManager | null {
		return this.retentionManager;
	}

	getBackupDownloader(): BackupDownloader | null {
		return this.backupDownloader;
	}

	getConflictResolver(): ConflictResolver | null {
		return this.conflictResolver;
	}

	getS3Provider(): S3Provider | null {
		return this.s3Provider;
	}

	/** Whether a sync cycle is currently executing (for settings / UI guards). */
	isSyncInProgress(): boolean {
		return this.syncEngine?.isInProgress() ?? false;
	}

	getPathCodec(): SyncPathCodec | null {
		return this.pathCodec;
	}

	getPayloadCodec(): SyncPayloadCodec | null {
		return this.payloadCodec;
	}
}

function summaryFromResult(result: SyncResult): LastSyncSummary {
	const status: LastSyncSummary['status'] =
		result.errors.length > 0
			? 'error'
			: result.conflicts.length > 0
				? 'conflicts'
				: 'synced';

	return {
		status,
		startedAt: result.startedAt,
		completedAt: result.completedAt,
		filesUploaded: result.filesUploaded,
		filesDownloaded: result.filesDownloaded,
		filesDeleted: result.filesDeleted,
		filesSkipped: result.filesSkipped,
		conflictCount: result.conflicts.length,
		lastError: result.errors[0]?.message ?? null,
	};
}
