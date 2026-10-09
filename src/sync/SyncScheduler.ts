/**
 * Sync Scheduler Module
 *
 * Adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 *
 * Easy Sync: always schedules when started; incomplete-creds quiet skip is
 * handled by the plugin before calling triggerSync for auto/startup runs.
 */

import { Plugin } from 'obsidian';
import { SyncEngine } from './SyncEngine';
import { EasySyncSettings, SyncResult } from '../types';
import { isConnectionConfigured } from '../storage/S3Config';
import { allowsAutomaticSync, shouldSkipAutomaticTrigger, type SyncTrigger } from './autoSync';

export class SyncScheduler {
	private plugin: Plugin;
	private syncEngine: SyncEngine;
	private settings: EasySyncSettings;
	private intervalId: number | null = null;
	private isEnabled = false;
	/** Wall-clock ms for the next scheduled tick; null when manual-only or stopped. */
	private nextSyncAt: number | null = null;

	private onSyncStart?: () => void;
	private onSyncProgress?: (done: number, total: number) => void;
	private onSyncComplete?: (result: SyncResult) => void;
	private onSyncError?: (error: string) => void;
	/** When false, skip starting sync (e.g. backup in progress). */
	private canStartSync?: () => boolean;

	constructor(plugin: Plugin, syncEngine: SyncEngine, settings: EasySyncSettings) {
		this.plugin = plugin;
		this.syncEngine = syncEngine;
		this.settings = settings;
	}

	setCallbacks(callbacks: {
		onSyncStart?: () => void;
		onSyncProgress?: (done: number, total: number) => void;
		onSyncComplete?: (result: SyncResult) => void;
		onSyncError?: (error: string) => void;
		canStartSync?: () => boolean;
	}): void {
		this.onSyncStart = callbacks.onSyncStart;
		this.onSyncProgress = callbacks.onSyncProgress;
		this.onSyncComplete = callbacks.onSyncComplete;
		this.onSyncError = callbacks.onSyncError;
		this.canStartSync = callbacks.canStartSync;
	}

	updateSettings(settings: EasySyncSettings): void {
		this.settings = settings;
		if (this.isEnabled) {
			this.stop();
			this.start();
		}
	}

	start(): void {
		if (this.isEnabled) return;

		this.isEnabled = true;

		const minutes = this.settings.syncIntervalMinutes;
		if (!allowsAutomaticSync(minutes)) {
			if (this.settings.debugLogging) {
				console.debug('[Easy Sync] Scheduler started: manual only (no interval)');
			}
			return;
		}

		const intervalMs = minutes * 60 * 1000;
		this.nextSyncAt = Date.now() + intervalMs;

		this.intervalId = this.plugin.registerInterval(
			window.setInterval(() => {
				this.nextSyncAt = Date.now() + intervalMs;
				void this.triggerSync('scheduled');
			}, intervalMs),
		);

		if (this.settings.debugLogging) {
			console.debug(`[Easy Sync] Scheduler started: every ${minutes} minutes`);
		}
	}

	stop(): void {
		if (!this.isEnabled) return;

		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}

		this.nextSyncAt = null;
		this.isEnabled = false;

		if (this.settings.debugLogging) {
			console.debug('[Easy Sync] Scheduler stopped');
		}
	}

	/** Next automatic sync time, or `null` when interval is manual-only / stopped. */
	getNextSyncAt(): number | null {
		return this.nextSyncAt;
	}

	async triggerSync(trigger: SyncTrigger): Promise<SyncResult | null> {
		if (this.syncEngine.isInProgress()) {
			if (this.settings.debugLogging) {
				console.debug('[Easy Sync] Skipping - sync already in progress');
			}
			return null;
		}

		if (this.canStartSync && !this.canStartSync()) {
			if (this.settings.debugLogging) {
				console.debug('[Easy Sync] Skipping - another operation is in progress');
			}
			return null;
		}

		// Incomplete credentials: quiet skip for auto/startup (manual Notice is in main).
		if (
			(trigger === 'scheduled' || trigger === 'startup') &&
			!isConnectionConfigured(this.plugin.app, this.settings)
		) {
			return null;
		}

		if (shouldSkipAutomaticTrigger(trigger, this.settings.syncIntervalMinutes)) {
			return null;
		}

		if (this.settings.debugLogging) {
			console.debug(`[Easy Sync] Triggering sync: ${trigger}`);
		}

		this.onSyncStart?.();

		try {
			const result = await this.syncEngine.sync(this.onSyncProgress);
			this.onSyncComplete?.(result);
			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.onSyncError?.(errorMessage);
			console.error('[Easy Sync] Sync failed:', error);
			return null;
		}
	}
}
