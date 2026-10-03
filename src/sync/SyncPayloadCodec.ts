/**
 * Plaintext payload codec for the sync data path.
 *
 * Adapted from obsidian-s3-sync-and-backup (MIT) — encryption path removed for Easy Sync v1.
 * Copyright (c) 2025 Sathindu
 */

import { hashContent } from '../crypto/Hasher';
import { PayloadFormat } from '../types';

/**
 * Content hashing and pass-through encoding for vault sync.
 * Objects are stored as-is (no client-side encryption).
 */
export class SyncPayloadCodec {
	get isEncryptionEnabled(): boolean {
		return false;
	}

	getActivePayloadFormat(): PayloadFormat {
		return 'plaintext-v1';
	}

	async fingerprint(plaintext: string | Uint8Array): Promise<string> {
		const hex = await hashContent(plaintext);
		return `sha256:${hex}`;
	}

	encodeForUpload(plaintext: string | Uint8Array): Uint8Array {
		return typeof plaintext === 'string'
			? new TextEncoder().encode(plaintext)
			: plaintext;
	}

	decodeAfterDownload(payload: Uint8Array, _payloadFormat?: PayloadFormat): Uint8Array {
		return payload;
	}

	decodeToString(payload: Uint8Array, payloadFormat?: PayloadFormat): string {
		const bytes = this.decodeAfterDownload(payload, payloadFormat);
		return new TextDecoder().decode(bytes);
	}
}
