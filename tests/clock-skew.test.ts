import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	filterResponseHeadersForAwsSdk,
	isRequestTimeTooSkewed,
	serverTimeFromSkewError,
} from '../src/storage/clockSkew';

describe('clock skew response filtering', () => {
	it('strips Date and Age from successful responses', () => {
		const filtered = filterResponseHeadersForAwsSdk(
			{
				date: 'Wed, 01 Jan 2020 00:00:00 GMT',
				age: '120',
				etag: '"abc"',
				'x-amz-request-id': 'req-1',
			},
			200,
		);
		assert.deepEqual(filtered, {
			etag: '"abc"',
			'x-amz-request-id': 'req-1',
		});
	});

	it('keeps Date and Age on error responses for SDK recovery', () => {
		const headers = {
			date: 'Wed, 01 Jan 2020 00:00:00 GMT',
			age: '0',
			'content-type': 'application/xml',
		};
		assert.deepEqual(filterResponseHeadersForAwsSdk(headers, 403), headers);
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

	it('reads ServerTime or response Date header', () => {
		const fromServerTime = serverTimeFromSkewError({
			ServerTime: '2026-10-04T04:00:00.000Z',
		});
		assert.equal(fromServerTime, Date.parse('2026-10-04T04:00:00.000Z'));

		const fromHeader = serverTimeFromSkewError({
			$response: { headers: { date: 'Sat, 04 Oct 2026 04:00:00 GMT' } },
		});
		assert.equal(fromHeader, Date.parse('Sat, 04 Oct 2026 04:00:00 GMT'));

		assert.equal(serverTimeFromSkewError({ name: 'RequestTimeTooSkewed' }), undefined);
	});
});
