/**
 * Conflict resolution — Keep on this device / Keep in the cloud / Skip.
 *
 * Versions stay in place (device file + cloud object) until the user picks a side.
 * No LOCAL_/REMOTE_ prefixes; no Keep-both sibling copies.
 */

import { App, TFile } from 'obsidian';
import { ConflictRecord, SyncStateRecord } from '../types';
import { S3Provider } from '../storage/S3Provider';
import { SyncJournal } from '../sync/SyncJournal';
import { SyncPathCodec } from '../sync/SyncPathCodec';
import { SyncPayloadCodec } from '../sync/SyncPayloadCodec';
import { getVaultFileKind, readVaultFile, toArrayBuffer } from '../utils/vaultFiles';
import { encodeMetadata } from '../sync/SyncObjectMetadata';

export type ConflictResolution = 'keep-device' | 'keep-cloud' | 'skip';

export class ConflictResolver {
	constructor(
		private app: App,
		private s3Provider: S3Provider,
		private journal: SyncJournal,
		private pathCodec: SyncPathCodec,
		private payloadCodec: SyncPayloadCodec,
		private deviceId: string,
	) {}

	async resolve(path: string, resolution: ConflictResolution): Promise<void> {
		if (resolution === 'skip') {
			return;
		}

		const conflict = await this.journal.getConflict(path);
		if (!conflict) {
			return;
		}

		switch (resolution) {
			case 'keep-device':
				await this.keepDevice(path, conflict);
				break;
			case 'keep-cloud':
				await this.keepCloud(path);
				break;
		}
	}

	/** Primary path keeps device content; upload to cloud. */
	private async keepDevice(path: string, _conflict: ConflictRecord): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			// Device file gone — delete remote if present, clear conflict
			const remoteKey = this.pathCodec.localToRemote(path);
			const head = await this.s3Provider.headObject(remoteKey);
			if (head) {
				await this.s3Provider.deleteFile(remoteKey);
			}
			await this.journal.deleteStateRecord(path);
			await this.journal.deleteConflict(path);
			return;
		}

		await this.uploadLocal(file);
		await this.journal.deleteConflict(path);
	}

	/** Primary path gets cloud content. */
	private async keepCloud(path: string): Promise<void> {
		const remoteKey = this.pathCodec.localToRemote(path);
		const downloaded = await this.s3Provider.downloadFileWithMetadata(remoteKey);
		if (!downloaded) {
			// Cloud gone — keep device version if present
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.uploadLocal(file);
			} else {
				await this.journal.deleteStateRecord(path);
			}
			await this.journal.deleteConflict(path);
			return;
		}

		const plaintext = this.payloadCodec.decodeAfterDownload(
			downloaded.content,
			downloaded.payloadFormat,
		);
		const kind = getVaultFileKind(path);
		await this.writeLocalFile(
			path,
			kind === 'text' ? new TextDecoder().decode(plaintext) : plaintext,
		);

		const localFile = this.app.vault.getAbstractFileByPath(path);
		if (!(localFile instanceof TFile)) {
			throw new Error(`Failed to write cloud version for ${path}`);
		}

		const fingerprint = await this.payloadCodec.fingerprint(
			kind === 'text' ? new TextDecoder().decode(plaintext) : plaintext,
		);

		const record: SyncStateRecord = {
			path,
			remoteKey,
			contentFingerprint: fingerprint,
			localMtime: localFile.stat.mtime,
			localSize: localFile.stat.size,
			remoteClientMtime: downloaded.clientMtime ?? null,
			remoteObjectSize: downloaded.size,
			remoteEtag: downloaded.etag,
			remoteLastModified: downloaded.lastModified,
			lastWriterDeviceId: downloaded.deviceId,
			lastSyncedAt: Date.now(),
		};
		await this.journal.setStateRecord(record);
		await this.journal.deleteConflict(path);
	}

	private async uploadLocal(file: TFile): Promise<void> {
		const content = await readVaultFile(this.app.vault, file);
		const fingerprint = await this.payloadCodec.fingerprint(content);
		const payload = this.payloadCodec.encodeForUpload(content);
		const remoteKey = this.pathCodec.localToRemote(file.path);

		const metadata = encodeMetadata({
			fingerprint,
			clientMtime: file.stat.mtime,
			deviceId: this.deviceId,
			payloadFormat: this.payloadCodec.getActivePayloadFormat(),
		});

		const etag = await this.s3Provider.uploadFile(remoteKey, payload, {
			contentType:
				getVaultFileKind(file.path) === 'text'
					? 'text/plain; charset=utf-8'
					: 'application/octet-stream',
			metadata,
		});

		const record: SyncStateRecord = {
			path: file.path,
			remoteKey,
			contentFingerprint: fingerprint,
			localMtime: file.stat.mtime,
			localSize: file.stat.size,
			remoteClientMtime: file.stat.mtime,
			remoteObjectSize: payload.byteLength,
			remoteEtag: etag,
			remoteLastModified: Date.now(),
			lastWriterDeviceId: this.deviceId,
			lastSyncedAt: Date.now(),
		};
		await this.journal.setStateRecord(record);
	}

	private async writeLocalFile(path: string, content: string | Uint8Array): Promise<void> {
		const existingFile = this.app.vault.getAbstractFileByPath(path);
		if (existingFile instanceof TFile) {
			if (typeof content === 'string') {
				await this.app.vault.modify(existingFile, content);
			} else {
				await this.app.vault.modifyBinary(existingFile, toArrayBuffer(content));
			}
			return;
		}

		const parts = path.split('/');
		parts.pop();
		let currentPath = '';
		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(currentPath)) {
				await this.app.vault.createFolder(currentPath);
			}
		}

		if (typeof content === 'string') {
			await this.app.vault.create(path, content);
		} else {
			await this.app.vault.createBinary(path, toArrayBuffer(content));
		}
	}
}
