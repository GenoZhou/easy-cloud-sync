/**
 * Clock-skew safeguards for AWS SDK v3 + Obsidian `requestUrl`.
 *
 * AWS SDK updates `systemClockOffset` from response `Date` / `ServerTime`.
 * Obsidian's HTTP layer (and some mobile/proxy paths) can return stale or
 * incorrect `Date` values without an `Age` header. That poisons the long-lived
 * sync `S3Client`, so later requests sign with a bad `x-amz-date` and R2/S3
 * returns `RequestTimeTooSkewed` — while Settings → Test connection still
 * works because it constructs a fresh client with offset 0.
 *
 * Strategy:
 * 1. Strip `Date` / `Age` from **every** response (including 4xx/5xx) so 404
 *    heads during sync cannot re-poison the offset.
 * 2. Keep SDK clock-skew correction enabled so an applied `systemClockOffset`
 *    is used for signing — but starve it of HTTP Date headers.
 * 3. On `RequestTimeTooSkewed`, trust only XML `ServerTime` (never Date) and
 *    retry once (covers SyncExecutor parallel siblings the SDK may skip).
 */

import type { S3Client } from '@aws-sdk/client-s3';

const CLOCK_HEADERS = new Set(['date', 'age']);

/**
 * Drop `Date` / `Age` from all responses. Real skew recovery uses the
 * `ServerTime` field on `RequestTimeTooSkewed` errors (parsed from the XML
 * body), not the HTTP Date header.
 */
export function filterResponseHeadersForAwsSdk(
	headers: Record<string, string>,
): Record<string, string> {
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

/**
 * Parse server UTC millis from a skew error's `ServerTime` only.
 * Do not use HTTP `Date` — it is what Obsidian/proxies may forge or cache.
 */
export function serverTimeFromSkewError(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') {
		return undefined;
	}
	const err = error as { ServerTime?: unknown };
	if (typeof err.ServerTime !== 'string' || err.ServerTime.length === 0) {
		return undefined;
	}
	const ms = Date.parse(err.ServerTime);
	return Number.isFinite(ms) ? ms : undefined;
}

export function applySystemClockOffset(
	client: { config: { systemClockOffset: number } },
	serverTimeMs: number,
	nowMs: number = Date.now(),
): void {
	client.config.systemClockOffset = serverTimeMs - nowMs;
}

/** Mutable clock config used by the retry middleware (matches S3Client.config). */
export type ClockOffsetClient = {
	config: { systemClockOffset: number };
};

/**
 * Build the initialize-step middleware that retries once after applying
 * `ServerTime`. Exported for unit tests without standing up a full client.
 */
export function createClockSkewRetryMiddleware(client: ClockOffsetClient) {
	return (next: (args: unknown) => Promise<unknown>) =>
		async (args: unknown): Promise<unknown> => {
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
		};
}

/**
 * Retry once after applying server time when the SDK's built-in skew retry
 * misses a sibling (common with SyncExecutor's parallel S3 calls).
 */
export function installClockSkewRetryMiddleware(client: S3Client): void {
	const retry = createClockSkewRetryMiddleware(client);
	// Smithy middleware generics are command-specific; the runtime contract is
	// (next) => (args) => Promise — cast at the stack boundary only.
	client.middlewareStack.add(
		((next: (args: unknown) => Promise<unknown>) => retry(next)) as never,
		{
			name: 'easySyncClockSkewRetry',
			priority: 'low',
			override: true,
		},
	);
}
