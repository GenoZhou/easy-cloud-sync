import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpResponse } from '@smithy/protocol-http';
import {
	applySystemClockOffset,
	clearSystemClockOffset,
	createClockSkewRetryMiddleware,
	filterResponseHeadersForAwsSdk,
	installClockSkewRetryMiddleware,
	isRequestTimeTooSkewed,
	serverTimeFromSkewError,
} from '../src/storage/clockSkew';

describe('clock skew response filtering', () => {
	it('lowercases keys and strips Date and Age', () => {
		const filtered = filterResponseHeadersForAwsSdk({
			Date: 'Wed, 01 Jan 2020 00:00:00 GMT',
			Age: '120',
			ETag: '"abc"',
			'X-Amz-Request-Id': 'req-1',
		});
		assert.deepEqual(filtered, {
			etag: '"abc"',
			'x-amz-request-id': 'req-1',
		});
	});

	it('strips Date and Age from error responses too', () => {
		const filtered = filterResponseHeadersForAwsSdk({
			date: 'Wed, 01 Jan 2020 00:00:00 GMT',
			age: '0',
			'content-type': 'application/xml',
		});
		assert.deepEqual(filtered, {
			'content-type': 'application/xml',
		});
	});
});

describe('clock skew error helpers', () => {
	it('detects RequestTimeTooSkewed by name, Code, or message', () => {
		assert.equal(isRequestTimeTooSkewed({ name: 'RequestTimeTooSkewed' }), true);
		assert.equal(isRequestTimeTooSkewed({ Code: 'RequestTimeTooSkewed' }), true);
		assert.equal(
			isRequestTimeTooSkewed({ message: 'RequestTimeTooSkewed: too large' }),
			true,
		);
		assert.equal(isRequestTimeTooSkewed({ name: 'AccessDenied' }), false);
		assert.equal(isRequestTimeTooSkewed(null), false);
	});

	it('reads ServerTime only — never HTTP Date', () => {
		const fromServerTime = serverTimeFromSkewError({
			ServerTime: '2026-10-04T04:00:00.000Z',
			$response: { headers: { date: 'Wed, 01 Jan 2020 00:00:00 GMT' } },
		});
		assert.equal(fromServerTime, Date.parse('2026-10-04T04:00:00.000Z'));

		assert.equal(
			serverTimeFromSkewError({
				$response: { headers: { date: 'Sat, 04 Oct 2026 04:00:00 GMT' } },
			}),
			undefined,
		);
		assert.equal(serverTimeFromSkewError({ name: 'RequestTimeTooSkewed' }), undefined);
		assert.equal(serverTimeFromSkewError({ ServerTime: 'not-a-date' }), undefined);
	});

	it('applies and clears systemClockOffset', () => {
		const client = { config: { systemClockOffset: 0 } };
		applySystemClockOffset(client, 1_000_000, 900_000);
		assert.equal(client.config.systemClockOffset, 100_000);
		clearSystemClockOffset(client);
		assert.equal(client.config.systemClockOffset, 0);
	});
});

describe('createClockSkewRetryMiddleware', () => {
	it('retries once after applying ServerTime', async () => {
		const client = { config: { systemClockOffset: 0 } };
		let attempts = 0;
		const inner = async () => {
			attempts++;
			if (attempts === 1) {
				throw Object.assign(new Error('skew'), {
					name: 'RequestTimeTooSkewed',
					ServerTime: '2026-10-04T12:00:00.000Z',
				});
			}
			return { ok: true };
		};

		const wrapped = createClockSkewRetryMiddleware(client)(inner);
		const result = await wrapped({});
		assert.deepEqual(result, { ok: true });
		assert.equal(attempts, 2);
		assert.notEqual(client.config.systemClockOffset, 0);
	});

	it('does not retry non-skew errors', async () => {
		const client = { config: { systemClockOffset: 0 } };
		let attempts = 0;
		const inner = async () => {
			attempts++;
			throw Object.assign(new Error('nope'), { name: 'AccessDenied' });
		};
		const wrapped = createClockSkewRetryMiddleware(client)(inner);
		await assert.rejects(() => wrapped({}), /nope/);
		assert.equal(attempts, 1);
		assert.equal(client.config.systemClockOffset, 0);
	});

	it('does not retry skew errors without ServerTime', async () => {
		const client = { config: { systemClockOffset: 0 } };
		let attempts = 0;
		const inner = async () => {
			attempts++;
			throw Object.assign(new Error('skew'), {
				name: 'RequestTimeTooSkewed',
				$response: { headers: { date: 'Sat, 04 Oct 2026 04:00:00 GMT' } },
			});
		};
		const wrapped = createClockSkewRetryMiddleware(client)(inner);
		await assert.rejects(() => wrapped({}), /skew/);
		assert.equal(attempts, 1);
		assert.equal(client.config.systemClockOffset, 0);
	});
});

describe('installClockSkewRetryMiddleware (S3Client integration)', () => {
	it('recovers HeadBucket after RequestTimeTooSkewed using ServerTime', async () => {
		const serverTime = '2026-10-04T12:00:00.000Z';
		const skewXml = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>RequestTimeTooSkewed</Code>
  <Message>The difference between the request time and the current time is too large.</Message>
  <ServerTime>${serverTime}</ServerTime>
</Error>`;

		let calls = 0;
		const handler = {
			async handle() {
				calls++;
				if (calls === 1) {
					// Stale Date must not be used — omit it; body carries ServerTime.
					return {
						response: new HttpResponse({
							statusCode: 403,
							headers: { 'content-type': 'application/xml' },
							body: bodyStream(skewXml),
						}),
					};
				}
				return {
					response: new HttpResponse({
						statusCode: 200,
						headers: {
							// Poisonous Date on success — stripped in production handler;
							// here the mock still returns it to prove ServerTime path works.
							date: 'Wed, 01 Jan 2020 00:00:00 GMT',
							'content-type': 'application/xml',
						},
						body: bodyStream(''),
					}),
				};
			},
			destroy() {},
			updateHttpClientConfig() {},
			httpHandlerConfigs() {
				return {};
			},
		};

		const client = new S3Client({
			region: 'auto',
			credentials: { accessKeyId: 'AKIA', secretAccessKey: 'secret' },
			endpoint: 'https://example.r2.cloudflarestorage.com',
			forcePathStyle: true,
			requestHandler: handler,
			// Let our middleware own the single recovery retry (SDK would also
			// retry via ServerTime; keep attempts low so the test is decisive).
			maxAttempts: 1,
		});
		installClockSkewRetryMiddleware(client);

		await client.send(new HeadBucketCommand({ Bucket: 'test-bucket' }));
		assert.equal(calls, 2);
		assert.notEqual(client.config.systemClockOffset, 0);
		client.destroy();
	});
});

function bodyStream(text: string): ReadableStream<Uint8Array> {
	const chunk = new TextEncoder().encode(text);
	return new ReadableStream<Uint8Array>({
		start(controller) {
			if (chunk.byteLength > 0) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	});
}
