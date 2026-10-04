/**
 * Clock-skew safeguards for AWS SDK v3 + Obsidian `requestUrl`.
 *
 * AWS SDK updates `systemClockOffset` from every response `Date` header.
 * Obsidian's HTTP layer (and some mobile/proxy paths) can return stale or
 * incorrect `Date` values without an `Age` header. That poisons the long-lived
 * sync `S3Client`, so later requests sign with a bad `x-amz-date` and R2/S3
 * returns `RequestTimeTooSkewed` — while Settings → Test connection still
 * works because it constructs a fresh client with offset 0.
 */

import type { S3Client } from '@aws-sdk/client-s3';

const CLOCK_HEADERS = new Set(['date', 'age']);

/**
 * Drop `Date` / `Age` from successful responses so cached/stale headers cannot
 * poison `systemClockOffset`. Keep them on 4xx/5xx so the SDK can recover from
 * real device clock skew via `ServerTime` / `Date` on the error response.
 */
export function filterResponseHeadersForAwsSdk(
	headers: Record<string, string>,
	statusCode: number,
): Record<string, string> {
	if (statusCode >= 400) {
		return { ...headers };
	}

	const filtered: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (CLOCK_HEADERS.has(key.toLowerCase())) {
			continue;
		}
		filtered[key] = value;
	}
	return filtered;
}

export function isRequestTimeTooSkewed(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}
	const err = error as { name?: string; Code?: string; message?: string };
	if (err.name === 'RequestTimeTooSkewed' || err.Code === 'RequestTimeTooSkewed') {
		return true;
	}
	return typeof err.message === 'string' && err.message.includes('RequestTimeTooSkewed');
}

/** Parse server UTC millis from a skew error (`ServerTime` or response `Date`). */
export function serverTimeFromSkewError(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') {
		return undefined;
	}
	const err = error as {
		ServerTime?: string;
		$response?: { headers?: Record<string, string | undefined> };
	};
	const raw =
		err.ServerTime ??
		err.$response?.headers?.date ??
		err.$response?.headers?.Date;
	if (!raw) {
		return undefined;
	}
	const ms = Date.parse(raw);
	return Number.isFinite(ms) ? ms : undefined;
}

export function applySystemClockOffset(client: S3Client, serverTimeMs: number): void {
	client.config.systemClockOffset = serverTimeMs - Date.now();
}

/**
 * Retry once after applying server time when the SDK's built-in skew retry
 * misses a sibling (common with SyncExecutor's parallel S3 calls).
 */
export function installClockSkewRetryMiddleware(client: S3Client): void {
	client.middlewareStack.add(
		(next) => async (args) => {
			try {
				return await next(args);
			} catch (error) {
				if (!isRequestTimeTooSkewed(error)) {
					throw error;
				}
				const serverTime = serverTimeFromSkewError(error);
				if (serverTime === undefined) {
					throw error;
				}
				applySystemClockOffset(client, serverTime);
				return next(args);
			}
		},
		{
			name: 'easySyncClockSkewRetry',
			priority: 'low',
		},
	);
}
