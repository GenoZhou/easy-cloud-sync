/**
 * Paths for Keep-both conflict copies under a user-configurable vault folder.
 */

import { DEFAULT_CONFLICT_FOLDER } from '../types';
import { getDirectory, getExtension, getFilename, normalizePrefix } from '../utils/paths';

function filenameWithoutExtension(path: string): string {
	const filename = getFilename(path);
	const lastDot = filename.lastIndexOf('.');
	return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

function datedConflictFilename(originalPath: string, date: Date): string {
	const base = filenameWithoutExtension(originalPath);
	const ext = getExtension(originalPath);
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${base} (conflict ${yyyy}-${mm}-${dd})${ext ? `.${ext}` : ''}`;
}

/**
 * Normalize the settings conflict folder (vault-relative). Empty → default.
 */
export function normalizeConflictFolder(folder: string): string {
	const normalized = normalizePrefix(folder);
	return normalized.length > 0 ? normalized : DEFAULT_CONFLICT_FOLDER;
}

/**
 * Vault path for the non-primary Keep-both copy.
 * Example: `notes/a.md` + folder `Easy Sync Conflicts`
 * → `Easy Sync Conflicts/notes/a (conflict YYYY-MM-DD).md`
 */
export function conflictCopyPath(
	originalPath: string,
	conflictFolder: string,
	date: Date = new Date(),
): string {
	const folder = normalizeConflictFolder(conflictFolder);
	const stamped = datedConflictFilename(originalPath, date);
	const dir = getDirectory(originalPath);
	const relative = dir ? `${dir}/${stamped}` : stamped;
	return `${folder}/${relative}`;
}
