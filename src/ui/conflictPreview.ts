/**
 * Load device + cloud sides of a conflict for the dedicated diff page.
 *
 * Full texts are diffed; callers choose how many changed lines to show.
 */

import { App, TFile } from 'obsidian';
import { ConflictRecord } from '../types';
import { S3Provider } from '../storage/S3Provider';
import { SyncPathCodec } from '../sync/SyncPathCodec';
import { SyncPayloadCodec } from '../sync/SyncPayloadCodec';
import { getVaultFileKind, readVaultFile } from '../utils/vaultFiles';
import {
	DiffLine,
	buildUnifiedHunks,
	flattenHunksForDisplay,
} from '../utils/textDiff';

/** Skip full-body download/diff when either side exceeds this (bytes). */
export const MAX_INLINE_PREVIEW_BYTES = 512 * 1024;

/** Default display cap (legacy / compact surfaces). */
export const MAX_DIFF_DISPLAY_LINES = 48;

/** Dedicated conflict-diff page can show more hunk lines. */
export const MAX_DIFF_PAGE_DISPLAY_LINES = 2000;

export interface LoadConflictPreviewOptions {
	/** Max unified-diff output lines to keep after a full-file compare. */
	maxDisplayLines?: number;
}

export type ConflictPreviewKind = 'text' | 'binary' | 'unavailable';

export interface ConflictPreview {
	kind: ConflictPreviewKind;
	path: string;
	deviceMeta: string;
	cloudMeta: string;
	deviceAvailable: boolean;
	/** First changed hunk lines only (device = del / cloud = add). */
	diffLines: DiffLine[];
	/** Changed/context lines not shown after the display cap. */
	omittedDiffLines: number;
	identical: boolean;
	message?: string;
}

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

export async function loadConflictPreview(
	app: App,
	s3: S3Provider,
	pathCodec: SyncPathCodec,
	payloadCodec: SyncPayloadCodec,
	conflict: ConflictRecord,
	options: LoadConflictPreviewOptions = {},
): Promise<ConflictPreview> {
	const maxDisplayLines = options.maxDisplayLines ?? MAX_DIFF_DISPLAY_LINES;
	const path = conflict.path;
	const deviceMeta = formatMeta(conflict.deviceMtime, conflict.deviceSize);
	const cloudMeta = formatMeta(conflict.cloudMtime, conflict.cloudSize);
	const kind = getVaultFileKind(path);
	const file = app.vault.getAbstractFileByPath(path);
	const deviceAvailable = file instanceof TFile;

	if (kind !== 'text') {
		return {
			kind: 'binary',
			path,
			deviceMeta,
			cloudMeta,
			deviceAvailable,
			diffLines: [],
			omittedDiffLines: 0,
			identical: false,
			message: deviceAvailable
				? 'Binary or non-text file — open the note to inspect the device copy.'
				: 'Binary or non-text file — not present on this device.',
		};
	}

	const knownSize = Math.max(conflict.deviceSize ?? 0, conflict.cloudSize ?? 0);
	if (knownSize > MAX_INLINE_PREVIEW_BYTES) {
		return {
			kind: 'text',
			path,
			deviceMeta,
			cloudMeta,
			deviceAvailable,
			diffLines: [],
			omittedDiffLines: 0,
			identical: false,
			message: deviceAvailable
				? 'File too large for inline diff. Open the file to review.'
				: 'File too large for inline diff, and it is not on this device.',
		};
	}

	let deviceText: string | null = null;
	if (deviceAvailable) {
		const content = await readVaultFile(app.vault, file);
		deviceText = typeof content === 'string' ? content : new TextDecoder().decode(content);
	}

	let cloudText: string | null = null;
	try {
		const remoteKey = pathCodec.localToRemote(path);
		const downloaded = await s3.downloadFileWithMetadata(remoteKey);
		if (downloaded) {
			if (downloaded.content.byteLength > MAX_INLINE_PREVIEW_BYTES) {
				return {
					kind: 'text',
					path,
					deviceMeta,
					cloudMeta,
					deviceAvailable,
					diffLines: [],
					omittedDiffLines: 0,
					identical: false,
					message: 'Cloud object too large for inline diff. Open the file if present locally.',
				};
			}
			const plaintext = payloadCodec.decodeAfterDownload(
				downloaded.content,
				downloaded.payloadFormat,
			);
			cloudText = new TextDecoder().decode(plaintext);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load cloud version';
		return {
			kind: 'unavailable',
			path,
			deviceMeta,
			cloudMeta,
			deviceAvailable,
			diffLines: [],
			omittedDiffLines: 0,
			identical: false,
			message,
		};
	}

	if (deviceText === null && cloudText === null) {
		return {
			kind: 'unavailable',
			path,
			deviceMeta,
			cloudMeta,
			deviceAvailable: false,
			diffLines: [],
			omittedDiffLines: 0,
			identical: false,
			message: 'Neither device nor cloud content is available.',
		};
	}

	// Full-file diff; only the first changed hunk lines are kept for display.
	const diff = buildUnifiedHunks(deviceText ?? '', cloudText ?? '');
	const flat = flattenHunksForDisplay(diff.hunks, maxDisplayLines);

	let message: string | undefined;
	if (diff.identical) {
		message = 'Contents match (metadata still conflicted). Choose a side to clear.';
	} else if (!deviceAvailable) {
		message = 'Not on this device — showing the cloud copy as additions.';
	}

	return {
		kind: 'text',
		path,
		deviceMeta,
		cloudMeta,
		deviceAvailable,
		diffLines: flat.lines,
		omittedDiffLines: flat.omitted,
		identical: diff.identical,
		message,
	};
}
