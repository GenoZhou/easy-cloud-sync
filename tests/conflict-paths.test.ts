import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CONFLICT_FOLDER } from '../src/types';
import { conflictCopyPath, normalizeConflictFolder } from '../src/ui/conflictPaths';

describe('conflictCopyPath', () => {
	const fixed = new Date(2026, 9, 3); // 2026-10-03 local

	it('places a root file under the conflict folder with a dated name', () => {
		assert.equal(
			conflictCopyPath('note.md', 'Easy Sync Conflicts', fixed),
			'Easy Sync Conflicts/note (conflict 2026-10-03).md',
		);
	});

	it('preserves the relative directory under the conflict folder', () => {
		assert.equal(
			conflictCopyPath('notes/deep/a.md', 'Conflicts', fixed),
			'Conflicts/notes/deep/a (conflict 2026-10-03).md',
		);
	});

	it('falls back to the default folder when settings are empty', () => {
		assert.equal(normalizeConflictFolder('  '), DEFAULT_CONFLICT_FOLDER);
		assert.equal(
			conflictCopyPath('a.md', '', fixed),
			`${DEFAULT_CONFLICT_FOLDER}/a (conflict 2026-10-03).md`,
		);
	});
});
