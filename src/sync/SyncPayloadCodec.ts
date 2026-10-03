/**
 * Plaintext payload codec for the sync data path.
 *
 * Adapted from obsidian-s3-sync-and-backup (MIT) — encryption path removed for Easy Sync v1.
 * Copyright (c) 2025 Sathindu
 */

import { hashContent } from '../crypto/Hasher';
import { PayloadFormat } from '../types';

/**
 * Content hashing and plaintext-only encode/decode for vault sync.
 * Non-plaintext S3 payload formats are rejected (fail-closed).
 */
export class SyncPayloadCodec {
	/** Easy Sync always uploads plaintext. */
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

	/**
	 * Decode S3 bytes for the vault. Only `plaintext-v1` (or absent) is accepted.
	 * Encrypted formats from other tools are rejected so ciphertext is never written.
	 */
	decodeAfterDownload(payload: Uint8Array, payloadFormat?: PayloadFormat): Uint8Array {
		const format = payloadFormat ?? 'plaintext-v1';
		if (format !== 'plaintext-v1') {
			throw new Error(
				`Unsupported payload format "${format}". Easy Sync v1 stores files as plaintext only ` +
					'and cannot decrypt encrypted objects. Re-upload as plaintext or use a tool that supports decryption.',
			);
		}
		return payload;
	}

	decodeToString(payload: Uint8Array, payloadFormat?: PayloadFormat): string {
		const bytes = this.decodeAfterDownload(payload, payloadFormat);
		return new TextDecoder().decode(bytes);
	}
}
