/**
 * Helpers for startup / interval sync gating.
 */

/** False when the user chose Manual only (interval 0). */
export function allowsAutomaticSync(intervalMinutes: number): boolean {
	return intervalMinutes > 0;
}

export type SyncTrigger = 'manual' | 'scheduled' | 'startup';

/** Auto triggers are skipped when interval is Manual only. */
export function shouldSkipAutomaticTrigger(
	trigger: SyncTrigger,
	intervalMinutes: number,
): boolean {
	return trigger !== 'manual' && !allowsAutomaticSync(intervalMinutes);
}
