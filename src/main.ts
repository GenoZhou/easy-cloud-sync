/**
 * Easy Cloud Sync — Obsidian community plugin
 *
 * Sync a vault to AWS S3, Cloudflare R2, or any S3-compatible endpoint,
 * with manual snapshot backups (retain count is a setting, default 1) and conflict resolution UX.
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
	OperationProgress,
	ResetAuthority,
	resolveBackupRetainCopies,
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
import { BackupRestore } from './backup/BackupRestore';
import { getOrCreateDeviceId } from './utils/deviceId';
import { ConflictResolver } from './ui/ConflictResolver';
import { ConflictDiffView, EASY_SYNC_DIFF_VIEW_TYPE } from './ui/ConflictDiffView';
import { EasySyncSidebarView, EASY_SYNC_VIEW_TYPE } from './ui/SidebarView';
import { ConfirmModal } from './ui/ConfirmModal';
import { normalizePrefix } from './utils/paths';
import { isOperationBusy, shouldRefreshBackupList } from './utils/operationUi';
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
	private isRestoreRunning = false;
	private syncProgress: OperationProgress | null = null;
	private backupProgress: OperationProgress | null = null;
	private lastSyncSummary: LastSyncSummary = { ...EMPTY_SYNC_SUMMARY };
	/** Last backup prefix / connection state applied to the sidebar cache. */
	private sidebarBackupPrefix: string | null = null;
	private sidebarConnectionConfigured = false;
	private progressUiFrame: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.deviceId = getOrCreateDeviceId(this.app);
		this.sidebarBackupPrefix = normalizePrefix(this.settings.backupPrefix);
		this.sidebarConnectionConfigured = isConnectionConfigured(this.app, this.settings);

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
			canStartSync: () => !this.isBackupInProgress() && !this.isRestoreInProgress(),
			onSyncStart: () => {
				this.syncProgress = { done: 0, total: 0 };
				this.lastSyncSummary = {
					...this.lastSyncSummary,
					status: 'syncing',
					lastError: null,
				};
				this.refreshSidebarUi();
			},
			onSyncProgress: (done, total) => {
				this.syncProgress = { done, total };
				this.scheduleProgressUi();
			},
			onSyncComplete: (result) => {
				this.clearProgressUiSchedule();
				this.syncProgress = null;
				this.lastSyncSummary = summaryFromResult(result);
				void this.persistLastSyncSummary();
				this.refreshSidebar();
				const nonRecoverable = result.errors.find((error) => !error.recoverable);
				if (nonRecoverable) {
					new Notice(`Sync blocked: ${nonRecoverable.message}`, 15000);
				}
			},
			onSyncError: (error) => {
				this.clearProgressUiSchedule();
				this.syncProgress = null;
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
		const saved: unknown = await this.loadData();
		const loaded = (saved ?? {}) as Partial<EasySyncSettings> & {
			secretAccessKey?: string;
			conflictFolder?: string;
		};
		// Unpublished: drop legacy plaintext secret and unused Keep-both folder.
		delete loaded.secretAccessKey;
		delete loaded.conflictFolder;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		this.settings.backupRetainCopies = resolveBackupRetainCopies(saved);
		this.settings.backupBeforeSync = this.settings.backupBeforeSync === true;
	}

	async saveSettings(): Promise<void> {
		const previousBackupPrefix = this.sidebarBackupPrefix;
		const wasConfigured = this.sidebarConnectionConfigured;

		await this.saveData(this.settings);

		this.s3Provider?.updateSettings(this.settings);
		this.syncEngine?.updateSettings(this.settings);
		this.pathCodec?.updatePrefix(this.settings.syncPrefix);
		this.syncScheduler?.updateSettings(this.settings);
		this.snapshotCreator?.updateSettings(this.settings);
		this.backupDownloader?.updateSettings(this.settings);
		this.retentionManager?.updateSettings(this.settings);
		this.changeTracker?.updateExcludePatterns(this.settings.excludePatterns);

		const isConfigured = isConnectionConfigured(this.app, this.settings);
		const nextBackupPrefix = normalizePrefix(this.settings.backupPrefix);
		this.sidebarBackupPrefix = nextBackupPrefix;
		this.sidebarConnectionConfigured = isConfigured;

		// Start/stop scheduler from connection state; avoid tearing down ChangeTracker on every keystroke.
		if (isConfigured) {
			this.syncScheduler?.start();
		} else {
			this.syncScheduler?.stop();
		}
		this.refreshSidebar();
		if (
			shouldRefreshBackupList({
				previousBackupPrefix,
				nextBackupPrefix,
				wasConfigured,
				isConfigured,
			})
		) {
			this.refreshSidebarBackups();
		}
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
		if (this.isVaultMutationBusy()) {
			throw new Error(this.busyNoticeMessage());
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
		await this.triggerManualSync({ skipBackup: true });
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

	async triggerManualSync(options?: { skipBackup?: boolean }): Promise<void> {
		if (!isConnectionConfigured(this.app, this.settings)) {
			new Notice(t().notices.configureBeforeSync);
			return;
		}

		if (this.isVaultMutationBusy()) {
			new Notice(this.busyNoticeMessage());
			return;
		}

		if (!options?.skipBackup && this.settings.backupBeforeSync) {
			const backedUp = await this.executeBackup({ beforeSync: true });
			if (!backedUp) return;
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
		}
		// Success / progress: sidebar status + counts; no toast.
	}

	async triggerManualBackup(): Promise<void> {
		if (!isConnectionConfigured(this.app, this.settings)) {
			new Notice(t().notices.configureBeforeBackup);
			return;
		}

		if (this.isVaultMutationBusy()) {
			new Notice(this.busyNoticeMessage());
			return;
		}

		await this.executeBackup();
	}

	/**
	 * Create a snapshot. Older copies are pruned only after a complete snapshot.
	 * A prune failure does not fail the snapshot. Returns false when the snapshot
	 * is missing or incomplete.
	 */
	private async executeBackup(options?: { beforeSync?: boolean }): Promise<boolean> {
		const notifyFailure = (message: string, manualNotice: string) => {
			new Notice(
				options?.beforeSync ? t().notices.backupFailedSyncSkipped(message) : manualNotice,
			);
		};

		if (!this.snapshotCreator || !this.retentionManager) {
			notifyFailure(t().notices.backupNotReady, t().notices.backupNotReady);
			return false;
		}

		this.isBackupRunning = true;
		this.backupProgress = { done: 0, total: 0 };
		this.refreshSidebarUi();

		try {
			const vaultName = this.app.vault.getName();
			const result = await this.snapshotCreator.createSnapshot(
				this.deviceId,
				vaultName,
				(done, total) => {
					this.backupProgress = { done, total };
					this.scheduleProgressUi();
				},
			);

			if (!result.success) {
				const errorMsg = result.errors[0] ?? t().notices.unknownError;
				notifyFailure(errorMsg, t().notices.backupErrors(errorMsg));
				return false;
			}

			try {
				await this.retentionManager.applyRetentionPolicy();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : t().notices.unknownError;
				new Notice(t().notices.retentionFailed(errorMessage));
			}
			return true;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : t().notices.unknownError;
			notifyFailure(errorMessage, t().notices.backupFailed(errorMessage));
			return false;
		} finally {
			this.clearProgressUiSchedule();
			this.isBackupRunning = false;
			this.backupProgress = null;
			this.refreshSidebarBackups();
		}
	}

	async deleteAllBackups(): Promise<{ deleted: number; failed: number }> {
		if (!this.retentionManager) {
			throw new Error(t().notices.backupNotReady);
		}
		if (this.isVaultMutationBusy()) {
			throw new Error(this.busyNoticeMessage());
		}
		const result = await this.retentionManager.deleteAllBackups();
		this.refreshSidebarBackups();
		return { deleted: result.deleted, failed: result.failed };
	}

	async triggerRestoreBackup(backupName: string): Promise<void> {
		if (!isConnectionConfigured(this.app, this.settings)) {
			new Notice(t().notices.configureBeforeBackup);
			return;
		}
		if (this.isVaultMutationBusy()) {
			new Notice(this.busyNoticeMessage());
			return;
		}

		const downloader = this.backupDownloader;
		if (!downloader) {
			new Notice(t().notices.backupNotReady);
			return;
		}

		const b = t().backup;
		const ok = await new ConfirmModal(
			this.app,
			b.restoreTitle,
			b.restoreBody(backupName),
			b.restoreConfirm,
			'mod-cta',
		).openAndWait();
		if (!ok) return;

		this.isRestoreRunning = true;
		this.refreshSidebarUi();

		try {
			const result = await new BackupRestore(this.app, downloader).restore(backupName);
			if (result.errors.length > 0) {
				new Notice(b.restoreErrors(result.restored, result.errors.length));
			} else {
				new Notice(b.restoreDone(result.restored));
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : t().notices.unknownError;
			new Notice(b.restoreFailed(message));
		} finally {
			this.isRestoreRunning = false;
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

	private forEachSidebarView(fn: (view: EasySyncSidebarView) => void): void {
		for (const leaf of this.app.workspace.getLeavesOfType(EASY_SYNC_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof EasySyncSidebarView) {
				fn(view);
			}
		}
	}

	/** Sync status + conflicts only (does not re-fetch the backup list). */
	private refreshSidebar(): void {
		this.forEachSidebarView((view) => {
			void view.refreshSyncState();
		});
	}

	/** Reload backup list from S3 (after backup / delete / explicit refresh). */
	private refreshSidebarBackups(): void {
		this.forEachSidebarView((view) => {
			void view.refreshBackups();
		});
	}

	/** Update sidebar action controls in place (no remote fetch / no full rebuild). */
	private refreshSidebarUi(): void {
		this.forEachSidebarView((view) => {
			view.updateOperationUi();
		});
	}

	/** Coalesce per-item progress updates to one paint per animation frame. */
	private scheduleProgressUi(): void {
		if (this.progressUiFrame !== null) return;
		this.progressUiFrame = window.requestAnimationFrame(() => {
			this.progressUiFrame = null;
			this.refreshSidebarUi();
		});
	}

	private clearProgressUiSchedule(): void {
		if (this.progressUiFrame === null) return;
		window.cancelAnimationFrame(this.progressUiFrame);
		this.progressUiFrame = null;
	}

	getLastSyncSummary(): LastSyncSummary {
		return this.lastSyncSummary;
	}

	/** Next scheduled sync (ms), or null when manual-only. */
	getNextSyncAt(): number | null {
		return this.syncScheduler?.getNextSyncAt() ?? null;
	}

	getSyncProgress(): OperationProgress | null {
		return this.syncProgress;
	}

	getBackupProgress(): OperationProgress | null {
		return this.backupProgress;
	}

	isBackupInProgress(): boolean {
		return this.isBackupRunning;
	}

	isRestoreInProgress(): boolean {
		return this.isRestoreRunning;
	}

	/** Sync, backup, or restore is in flight (includes pre-engine progress flags). */
	isVaultMutationBusy(): boolean {
		return isOperationBusy({
			syncInProgress: this.isSyncInProgress(),
			backupRunning: this.isBackupRunning,
			restoreRunning: this.isRestoreRunning,
			syncProgress: this.syncProgress,
			backupProgress: this.backupProgress,
		});
	}

	private busyNoticeMessage(): string {
		if (this.isSyncInProgress() || this.syncProgress !== null) {
			return t().notices.syncInProgress;
		}
		if (this.isBackupRunning || this.backupProgress !== null) {
			return t().notices.backupInProgress;
		}
		return t().notices.restoreInProgress;
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
