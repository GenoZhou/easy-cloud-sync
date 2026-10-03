/**
 * Post-resolve navigation: close the conflict-diff leaf, then reveal the sidebar.
 *
 * Detach must run before reveal — on mobile, reveal-then-detach expands the
 * drawer and dismisses it when the active leaf goes away.
 */

export type CloseConflictDiffNav = {
	refreshConflictUi: () => void;
	detachDiff: () => void | Promise<void>;
	activateSidebar: () => void | Promise<void>;
};

export type CloseConflictDiffOutcome =
	| { ok: true }
	| { ok: false; step: 'detach' | 'activate'; error: unknown };

/** refresh → detach → activate (retry activate once if the first call fails). */
export async function closeConflictDiffToSidebar(
	nav: CloseConflictDiffNav,
): Promise<CloseConflictDiffOutcome> {
	nav.refreshConflictUi();
	try {
		await nav.detachDiff();
	} catch (error) {
		return { ok: false, step: 'detach', error };
	}

	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			await nav.activateSidebar();
			return { ok: true };
		} catch (error) {
			lastError = error;
		}
	}
	return { ok: false, step: 'activate', error: lastError };
}
