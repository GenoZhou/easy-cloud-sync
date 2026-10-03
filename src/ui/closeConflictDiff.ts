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

/**
 * Run refresh → detach → activate (one activate retry after the first failure).
 * Callers map outcomes to Notices / reload.
 */
export async function closeConflictDiffToSidebar(
	nav: CloseConflictDiffNav,
): Promise<CloseConflictDiffOutcome> {
	nav.refreshConflictUi();
	try {
		await nav.detachDiff();
	} catch (error) {
		return { ok: false, step: 'detach', error };
	}

	try {
		await nav.activateSidebar();
		return { ok: true };
	} catch {
		// Detach already closed the decide surface — retry reveal once.
		try {
			await nav.activateSidebar();
			return { ok: true };
		} catch (error) {
			return { ok: false, step: 'activate', error };
		}
	}
}
