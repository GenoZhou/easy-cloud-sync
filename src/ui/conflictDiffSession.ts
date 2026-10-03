/**
 * Session state for the dedicated conflict-diff page.
 * Opening Show diff always starts a fresh session so a prior "resolved"
 * banner cannot stick when the same path is reopened.
 */

export interface ConflictDiffSession {
	path: string | null;
	resolvedMessage: string | null;
}

/** Start (or restart) a diff session for {@link path}; always clears resolved UI. */
export function beginConflictDiffSession(
	_previous: ConflictDiffSession,
	path: string,
): ConflictDiffSession {
	return {
		path,
		resolvedMessage: null,
	};
}
