import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SyncPayloadCodec } from '../src/sync/SyncPayloadCodec';

describe('SyncPayloadCodec', () => {
	const codec = new SyncPayloadCodec();

	it('reports plaintext-v1 as the active upload format', () => {
		assert.equal(codec.getActivePayloadFormat(), 'plaintext-v1');
	});

	it('encodes strings as UTF-8 bytes', () => {
		const bytes = codec.encodeForUpload('hello');
		assert.deepEqual(bytes, new TextEncoder().encode('hello'));
	});

	it('passes through binary payloads unchanged', () => {
		const input = new Uint8Array([1, 2, 3]);
		assert.equal(codec.encodeForUpload(input), input);
	});

	it('decodes plaintext payloads', () => {
		const payload = new TextEncoder().encode('vault note');
		assert.deepEqual(codec.decodeAfterDownload(payload), payload);
		assert.deepEqual(codec.decodeAfterDownload(payload, 'plaintext-v1'), payload);
		assert.equal(codec.decodeToString(payload), 'vault note');
	});

	it('rejects encrypted payload formats', () => {
		const payload = new Uint8Array([9, 9, 9]);
		assert.throws(
			() => codec.decodeAfterDownload(payload, 'xsalsa20poly1305-v1'),
			/Unsupported payload format/,
		);
	});

	it('fingerprints content with a sha256: prefix', async () => {
		const fingerprint = await codec.fingerprint('same');
		assert.match(fingerprint, /^sha256:[0-9a-f]{64}$/);
		assert.equal(await codec.fingerprint('same'), fingerprint);
		assert.notEqual(await codec.fingerprint('different'), fingerprint);
	});
});
