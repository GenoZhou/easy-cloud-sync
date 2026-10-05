/**
 * Easy Sync — Type Definitions
 *
 * Portions adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 */

// =============================================================================
// S3 Provider Types
// =============================================================================

export type S3ProviderType = 'aws' | 'r2' | 'custom';

export const S3_PROVIDER_NAMES: Record<S3ProviderType, string> = {
	aws: 'AWS S3',
	r2: 'Cloudflare R2',
	custom: 'Other S3-compatible',
};

// =============================================================================
// Settings Types
// =============================================================================

/** 0 = manual only (no startup / interval sync). */
export type SyncIntervalMinutes = 0 | 1 | 2 | 5 | 10 | 15 | 30;

/** Fixed backup retention: keep newest 5 snapshots. */
export const BACKUP_RETAIN_COPIES = 5;

export interface EasySyncSettings {
	provider: S3ProviderType;
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	/** Obsidian SecretStorage id for the secret access key (value never persisted). */
	secretAccessKeySecretId: string;
	forcePathStyle: boolean;

	syncPrefix: string;
	backupPrefix: string;
	excludePatterns: string[];
	syncIntervalMinutes: SyncIntervalMinutes;
	debugLogging: boolean;
}

export const DEFAULT_SETTINGS: EasySyncSettings = {
	provider: 'aws',
	endpoint: '',
	region: 'us-east-1',
	bucket: '',
	accessKeyId: '',
	secretAccessKeySecretId: '',
	forcePathStyle: false,

	syncPrefix: 'vault',
	backupPrefix: 'backups',
	excludePatterns: ['**/workspace*', '.trash/**'],
	syncIntervalMinutes: 5,
	debugLogging: false,
};

// =============================================================================
// Sync Types
// =============================================================================

export type VaultFileKind = 'text' | 'binary';

export type SyncAction =
	| 'skip'
	| 'adopt'
	| 'upload'
	| 'download'
	| 'delete-local'
	| 'delete-remote'
	| 'conflict'
	| 'forget';

export type ConflictMode = 'both' | 'local-only' | 'remote-only';

export interface SyncStateRecord {
	path: string;
	remoteKey: string;
	contentFingerprint: string;
	localMtime: number;
	localSize: number;
	remoteClientMtime: number | null;
	remoteObjectSize: number;
	remoteEtag?: string;
	remoteLastModified: number | null;
	lastWriterDeviceId?: string;
	lastSyncedAt: number;
}

/**
 * Unresolved conflict tracked in IndexedDB.
 * Versions stay in place (device file + cloud object) until the user resolves
 * via the conflict diff page — no LOCAL_/REMOTE_ artifact files.
 */
export interface ConflictRecord {
	path: string;
	mode: ConflictMode;
	baselineFingerprint?: string;
	/** Device-side mtime at detection (epoch ms), when present. */
	deviceMtime?: number;
	deviceSize?: number;
	/** Cloud-side client mtime / size at detection, when present. */
	cloudMtime?: number;
	cloudSize?: number;
	detectedAt: number;
}

export interface SyncPlanItem {
	path: string;
	action: SyncAction;
	conflictMode?: ConflictMode;
	reason: string;
	expectedRemoteEtag?: string;
	expectRemoteAbsent?: boolean;
}

export interface SyncResult {
	success: boolean;
	startedAt: number;
	completedAt: number;
	filesUploaded: number;
	filesDownloaded: number;
	filesDeleted: number;
	filesAdopted: number;
	filesForgotten: number;
	filesSkipped: number;
	conflicts: string[];
	errors: SyncError[];
}

export interface SyncError {
	path: string;
	action: SyncAction;
	message: string;
	recoverable: boolean;
}

export type LocalClassification = 'L0' | 'L+' | 'L=' | 'LΔ';
export type RemoteClassification = 'R0' | 'R+' | 'R=' | 'RΔ';

/** One-shot Advanced reset: prefer device or cloud instead of conflict. */
export type ResetAuthority = 'local' | 'cloud';

export interface DecisionInput {
	path: string;
	local: LocalClassification;
	remote: RemoteClassification;
	hasUnresolvedConflict: boolean;
	/** True while conflict awaits user resolution (sidebar/modal). */
	hasConflictArtifacts: boolean;
	localExists: boolean;
	remoteExists: boolean;
	hasBaseline: boolean;
	localFingerprint?: string;
	remoteFingerprint?: string;
	/** When set, resolve differences toward this side (no conflicts). */
	authority?: ResetAuthority;
}

/** Easy Sync writes plaintext only; xsalsa tag may appear on objects from other tools. */
export type PayloadFormat = 'plaintext-v1' | 'xsalsa20poly1305-v1';

export interface S3HeadResult {
	etag: string;
	size: number;
	lastModified: number;
	syncVersion?: number;
	fingerprint?: string;
	clientMtime?: number;
	deviceId?: string;
	payloadFormat?: PayloadFormat;
}

export interface S3DownloadResult {
	content: Uint8Array;
	etag: string;
	size: number;
	lastModified: number;
	syncVersion?: number;
	fingerprint?: string;
	clientMtime?: number;
	deviceId?: string;
	payloadFormat?: PayloadFormat;
}

export interface SyncUploadMetadata {
	fingerprint: string;
	clientMtime: number;
	deviceId: string;
	payloadFormat: PayloadFormat;
}

// =============================================================================
// Backup Types
// =============================================================================

export interface BackupManifest {
	version: number;
	timestamp: string;
	deviceId: string;
	deviceName: string;
	fileCount: number;
	totalSize: number;
	encrypted: boolean;
	checksums: Record<string, string>;
}

export interface BackupInfo {
	name: string;
	timestamp: string;
	fileCount: number;
	totalSize: number;
	encrypted: boolean;
}

export interface BackupResult {
	success: boolean;
	/** True after the snapshot manifest was written to S3 (includes partial backups). */
	snapshotCreated: boolean;
	backupName: string;
	startedAt: number;
	completedAt: number;
	filesBackedUp: number;
	totalSize: number;
	errors: string[];
}

/** In-flight sync or backup progress for sidebar button labels. */
export interface OperationProgress {
	done: number;
	total: number;
}

// =============================================================================
// Last sync summary (sidebar)
// =============================================================================

export type SyncRunStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'conflicts';

export interface LastSyncSummary {
	status: SyncRunStatus;
	startedAt: number | null;
	completedAt: number | null;
	filesUploaded: number;
	filesDownloaded: number;
	filesDeleted: number;
	filesSkipped: number;
	conflictCount: number;
	lastError: string | null;
}

export const EMPTY_SYNC_SUMMARY: LastSyncSummary = {
	status: 'idle',
	startedAt: null,
	completedAt: null,
	filesUploaded: 0,
	filesDownloaded: 0,
	filesDeleted: 0,
	filesSkipped: 0,
	conflictCount: 0,
	lastError: null,
};

// =============================================================================
// S3 Types
// =============================================================================

export interface S3ObjectInfo {
	key: string;
	size: number;
	lastModified: Date;
	etag?: string;
}
