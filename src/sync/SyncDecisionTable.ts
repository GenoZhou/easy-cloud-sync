/**
 * Adapted from obsidian-s3-sync-and-backup (MIT)
 * Copyright (c) 2025 Sathindu
 */

/**
 * Pure-function decision table for three-way sync reconciliation.
 *
 * Given a {@link DecisionInput} (local/remote classification plus conflict
 * state), returns the {@link SyncPlanItem} action to execute.  The function
 * is deterministic and side-effect-free — all I/O happens in SyncPlanner
 * (before) and SyncExecutor (after).
 *
 * ## Three-way model
 * Each file is classified independently on both sides relative to the last
 * known baseline stored in the journal:
 * - `L0 / R0` — absent (never existed or already deleted)
 * - `L+ / R+` — new (no baseline record exists)
 * - `L= / R=` — unchanged (matches baseline fingerprint/mtime)
 * - `LΔ / RΔ` — modified (differs from baseline)
 *
 * The Cartesian product of these states, combined with the conflict flag,
 * fully determines the required action without any further I/O.
 */

import {
	ConflictMode,
	DecisionInput,
	SyncAction,
	SyncPlanItem,
} from '../types';

/**
 * Decide the sync action for a single file path.
 *
 * The decision is split into three modes:
 * 1. **Unresolved conflict** — artifacts present or user resolved
 * 2. **No baseline** — first sync for this file
 * 3. **Baseline exists** — standard three-way comparison
 *
 * @param input - All classification data needed to make the decision,
 *   including local/remote state, fingerprints, and conflict flags.
 * @returns A {@link SyncPlanItem} describing the action to take and the
 *   human-readable reason why.
 */
export function decide(input: DecisionInput): SyncPlanItem {
	if (input.authority === 'local' || input.authority === 'cloud') {
		return decideWithAuthority(input);
	}

	if (input.hasUnresolvedConflict) {
		return decideConflictMode(input);
	}

	const isFirstSync = input.local === 'L+' || input.remote === 'R+';

	if (isFirstSync) {
		return decideNoBaseline(input);
	}

	if (!input.hasBaseline) {
		return decideNoBaseline(input);
	}

	return decideWithBaseline(input);
}

/**
 * Advanced reset: force one side to win for every path.
 * - local → upload device copy / delete cloud-only
 * - cloud → download cloud copy / delete device-only
 */
function decideWithAuthority(input: DecisionInput): SyncPlanItem {
	const { path } = input;
	const preferLocal = input.authority === 'local';

	if (!input.localExists && !input.remoteExists) {
		return input.hasBaseline
			? plan(path, 'forget', 'Authority reset — both sides absent')
			: plan(path, 'skip', 'Authority reset — nothing to align');
	}

	if (input.localExists && input.remoteExists && fingerprintsMatch(input)) {
		return plan(path, 'adopt', 'Authority reset — content identical');
	}

	if (preferLocal) {
		if (input.localExists) {
			return plan(path, 'upload', 'Authority reset — keep device copy');
		}
		return plan(path, 'delete-remote', 'Authority reset — remove cloud-only copy');
	}

	if (input.remoteExists) {
		return plan(path, 'download', 'Authority reset — keep cloud copy');
	}
	return plan(path, 'delete-local', 'Authority reset — remove device-only copy');
}

/**
 * Mode 1: An unresolved conflict record exists for this path.
 *
 * Easy Sync keeps both versions in place and waits for explicit resolution
 * via the conflict modal. Until the journal conflict is cleared, always skip.
 */
function decideConflictMode(input: DecisionInput): SyncPlanItem {
	return plan(input.path, 'skip', 'Unresolved conflict — waiting for user resolution');
}

/**
 * Mode 2: No baseline exists (first sync for this file).
 *
 * Without a baseline we cannot detect who changed what, so we compare
 * existence only.  When both sides exist we fall back to fingerprint
 * comparison: identical content → `adopt` (no transfer needed); differing
 * content → `conflict(both)` to preserve both versions for the user.
 *
 * | Local | Remote | Action                                  |
 * |-------|--------|-----------------------------------------|
 * | L0    | R0     | skip                                    |
 * | L+    | R0     | upload                                  |
 * | L0    | R+     | download                                |
 * | L+    | R+     | adopt (same fingerprint) / conflict(both) |
 *
 * @param input - Decision input for a path that has no journal baseline.
 * @returns A {@link SyncPlanItem} with the action appropriate for the
 *   first-seen state of this file.
 */
function decideNoBaseline(input: DecisionInput): SyncPlanItem {
	const { local, remote, path } = input;

	if (local === 'L0' && remote === 'R0') {
		return plan(path, 'skip', 'Neither local nor remote exists');
	}

	if (local === 'L+' && remote === 'R0') {
		return plan(path, 'upload', 'New local file — no remote counterpart');
	}

	if (local === 'L0' && remote === 'R+') {
		return plan(path, 'download', 'New remote file — no local counterpart');
	}

	if (local === 'L+' && remote === 'R+') {
		if (fingerprintsMatch(input)) {
			return plan(path, 'adopt', 'First sync — local and remote content identical');
		}
		return planConflict(path, 'both', 'First sync — local and remote content differ');
	}

	return plan(path, 'skip', 'No action needed');
}

/**
 * Mode 3: Baseline exists — standard three-way comparison.
 *
 * With a known baseline we can determine which side (if any) diverged.
 * Asymmetric changes are propagated to the other side.  Symmetric deletions
 * remove the stale baseline.  Edit/delete asymmetries produce conflicts so
 * no data is silently lost.
 *
 * | Local | Remote | Action                                          |
 * |-------|--------|-------------------------------------------------|
 * | L=    | R=     | skip                                            |
 * | LΔ    | R=     | upload                                          |
 * | L=    | RΔ     | download                                        |
 * | LΔ    | RΔ     | adopt (same fingerprint) / conflict(both)       |
 * | L0    | R=     | delete-remote                                   |
 * | L=    | R0     | delete-local                                    |
 * | L0    | R0     | forget                                          |
 * | LΔ    | R0     | conflict(local-only) — local edited, remote gone |
 * | L0    | RΔ     | conflict(remote-only) — remote edited, local gone |
 *
 * @param input - Decision input for a path that has a valid journal baseline.
 * @returns A {@link SyncPlanItem} encoding the reconciled action for the
 *   (local, remote) classification pair.
 */
function decideWithBaseline(input: DecisionInput): SyncPlanItem {
	const { local, remote, path } = input;

	if (local === 'L=' && remote === 'R=') {
		return plan(path, 'skip', 'Both sides match baseline');
	}

	if (local === 'LΔ' && remote === 'R=') {
		return plan(path, 'upload', 'Local modified, remote unchanged');
	}

	if (local === 'L=' && remote === 'RΔ') {
		return plan(path, 'download', 'Remote modified, local unchanged');
	}

	if (local === 'LΔ' && remote === 'RΔ') {
		if (fingerprintsMatch(input)) {
			return plan(path, 'adopt', 'Both sides changed to identical content');
		}
		return planConflict(path, 'both', 'Both sides modified with different content');
	}

	if (local === 'L0' && remote === 'R=') {
		return plan(path, 'delete-remote', 'Locally deleted, remote unchanged');
	}

	if (local === 'L=' && remote === 'R0') {
		return plan(path, 'delete-local', 'Remotely deleted, local unchanged');
	}

	if (local === 'L0' && remote === 'R0') {
		return plan(path, 'forget', 'Both sides deleted — removing stale baseline');
	}

	if (local === 'LΔ' && remote === 'R0') {
		return planConflict(path, 'local-only', 'Local modified but remote was deleted');
	}

	if (local === 'L0' && remote === 'RΔ') {
		return planConflict(path, 'remote-only', 'Remote modified but local was deleted');
	}

	return plan(path, 'skip', `Unhandled state: local=${local} remote=${remote}`);
}

/**
 * Return `true` when both sides carry a known fingerprint and they are equal.
 *
 * A fingerprint is the SHA-256 hash of the plaintext content (before
 * encryption).  When both values are present and identical the files have
 * the same logical content regardless of timestamps, so no transfer is
 * needed and we can safely `adopt` the existing remote object as the new
 * baseline.
 *
 * @param input - Decision input carrying optional `localFingerprint` and
 *   `remoteFingerprint` fields (both are `undefined` when unknown).
 * @returns `true` if both fingerprints are defined and identical.
 */
function fingerprintsMatch(input: DecisionInput): boolean {
	return (
		input.localFingerprint !== undefined &&
		input.remoteFingerprint !== undefined &&
		input.localFingerprint === input.remoteFingerprint
	);
}

/**
 * Construct a plain (non-conflict) {@link SyncPlanItem}.
 *
 * @param path - Vault-relative file path.
 * @param action - The sync action to take.
 * @param reason - Human-readable explanation surfaced in debug logs.
 * @returns A {@link SyncPlanItem} with no `conflictMode` set.
 */
function plan(path: string, action: SyncAction, reason: string): SyncPlanItem {
	return { path, action, reason };
}

/**
 * Construct a conflict {@link SyncPlanItem}.
 *
 * Conflicts always use action `'conflict'`; the {@link ConflictMode} describes
 * which sides diverge. The executor records a journal conflict for modal UX
 * without creating LOCAL_/REMOTE_ files.
 */
function planConflict(path: string, mode: ConflictMode, reason: string): SyncPlanItem {
	return { path, action: 'conflict', conflictMode: mode, reason };
}
