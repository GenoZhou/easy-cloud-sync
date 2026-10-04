/** Journal metadata keys shared by SyncEngine, reset flow, and planner. */

import type { ResetAuthority } from '../types';

export type { ResetAuthority };

export const DESTINATION_FINGERPRINT_KEY = 'destinationFingerprint';
export const LAST_SUCCESSFUL_SYNC_KEY = 'lastSuccessfulSyncAt';
/** One-shot sync authority after Advanced reset: prefer device or cloud. */
export const RESET_AUTHORITY_KEY = 'resetAuthority';

export function parseResetAuthority(value: unknown): ResetAuthority | undefined {
	return value === 'local' || value === 'cloud' ? value : undefined;
}
