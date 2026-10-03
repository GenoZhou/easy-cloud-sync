/**
 * Load device + cloud sides of a conflict for a mobile-friendly hunk preview.
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

export type ConflictPreviewKind = 'text' | 'binary' | 'unavailable';

export interface ConflictPreview {
	kind: ConflictPreviewKind;
	path: string;
	deviceMeta: string;
	cloudMeta: string;
	/** Unified changed lines (device = del / cloud = add). */
	diffLines: DiffLine[];
	omittedDiffLines: number;
	truncatedInput: boolean;
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
): Promise<ConflictPreview> {
	const path = conflict.path;
	const deviceMeta = formatMeta(conflict.deviceMtime, conflict.deviceSize);
	const cloudMeta = formatMeta(conflict.cloudMtime, conflict.cloudSize);
	const kind = getVaultFileKind(path);

	if (kind !== 'text') {
		return {
			kind: 'binary',
			path,
			deviceMeta,
			cloudMeta,
			diffLines: [],
			omittedDiffLines: 0,
			truncatedInput: false,
			identical: false,
			message: 'Binary or non-text file — open the note to inspect the device copy.',
		};
	}

	let deviceText: string | null = null;
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		const content = await readVaultFile(app.vault, file);
		deviceText = typeof content === 'string' ? content : new TextDecoder().decode(content);
	}

	let cloudText: string | null = null;
	try {
		const remoteKey = pathCodec.localToRemote(path);
		const downloaded = await s3.downloadFileWithMetadata(remoteKey);
		if (downloaded) {
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
			diffLines: [],
			omittedDiffLines: 0,
			truncatedInput: false,
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
			diffLines: [],
			omittedDiffLines: 0,
			truncatedInput: false,
			identical: false,
			message: 'Neither device nor cloud content is available.',
		};
	}

	const diff = buildUnifiedHunks(deviceText ?? '', cloudText ?? '');
	const flat = flattenHunksForDisplay(diff.hunks, 48);

	return {
		kind: 'text',
		path,
		deviceMeta,
		cloudMeta,
		diffLines: flat.lines,
		omittedDiffLines: flat.omitted,
		truncatedInput: diff.truncated,
		identical: diff.identical,
		message: diff.identical
			? 'Contents match (metadata still conflicted). Choose a side to clear.'
			: undefined,
	};
}
