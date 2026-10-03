import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { beginConflictDiffSession } from '../src/ui/conflictDiffSession';

describe('beginConflictDiffSession', () => {
	it('clears a resolved banner when reopening the same path', () => {
		const previous = {
			path: 'notes/a.md',
			resolvedMessage: 'Kept on this device: notes/a.md',
		};
		const next = beginConflictDiffSession(previous, 'notes/a.md');
		assert.equal(next.path, 'notes/a.md');
		assert.equal(next.resolvedMessage, null);
	});

	it('clears state when switching to another path', () => {
		const previous = {
			path: 'a.md',
			resolvedMessage: 'Kept in the cloud: a.md',
		};
		const next = beginConflictDiffSession(previous, 'b.md');
		assert.equal(next.path, 'b.md');
		assert.equal(next.resolvedMessage, null);
	});
});
