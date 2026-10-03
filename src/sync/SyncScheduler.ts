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

export class SyncScheduler {
	private plugin: Plugin;
	private syncEngine: SyncEngine;
	private settings: EasySyncSettings;
	private intervalId: number | null = null;
	private isEnabled = false;

	private onSyncStart?: () => void;
	private onSyncComplete?: (result: SyncResult) => void;
	private onSyncError?: (error: string) => void;

	constructor(plugin: Plugin, syncEngine: SyncEngine, settings: EasySyncSettings) {
		this.plugin = plugin;
		this.syncEngine = syncEngine;
		this.settings = settings;
	}

	setCallbacks(callbacks: {
		onSyncStart?: () => void;
		onSyncComplete?: (result: SyncResult) => void;
		onSyncError?: (error: string) => void;
	}): void {
		this.onSyncStart = callbacks.onSyncStart;
		this.onSyncComplete = callbacks.onSyncComplete;
		this.onSyncError = callbacks.onSyncError;
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

		const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;

		this.intervalId = this.plugin.registerInterval(
			window.setInterval(() => {
				void this.triggerSync('scheduled');
			}, intervalMs),
		);

		if (this.settings.debugLogging) {
			console.debug(
				`[Easy Sync] Scheduler started: every ${this.settings.syncIntervalMinutes} minutes`,
			);
		}
	}

	stop(): void {
		if (!this.isEnabled) return;

		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}

		this.isEnabled = false;

		if (this.settings.debugLogging) {
			console.debug('[Easy Sync] Scheduler stopped');
		}
	}

	async triggerSync(
		trigger: 'manual' | 'scheduled' | 'startup',
	): Promise<SyncResult | null> {
		if (this.syncEngine.isInProgress()) {
			if (this.settings.debugLogging) {
				console.debug('[Easy Sync] Skipping - sync already in progress');
			}
			return null;
		}

		// Incomplete credentials: quiet skip for auto/startup (manual Notice is in main).
		if (
			(trigger === 'scheduled' || trigger === 'startup') &&
			!isConnectionConfigured(this.settings)
		) {
			return null;
		}

		if (this.settings.debugLogging) {
			console.debug(`[Easy Sync] Triggering sync: ${trigger}`);
		}

		this.onSyncStart?.();

		try {
			const result = await this.syncEngine.sync();
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
