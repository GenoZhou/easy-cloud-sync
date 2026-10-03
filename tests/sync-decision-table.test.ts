import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide } from '../src/sync/SyncDecisionTable';
import type { DecisionInput } from '../src/types';

function base(overrides: Partial<DecisionInput>): DecisionInput {
	return {
		path: 'note.md',
		local: 'L=',
		remote: 'R=',
		hasUnresolvedConflict: false,
		hasConflictArtifacts: false,
		localExists: true,
		remoteExists: true,
		hasBaseline: true,
		...overrides,
	};
}

describe('SyncDecisionTable.decide', () => {
	it('skips while an unresolved conflict is open', () => {
		const item = decide(
			base({ hasUnresolvedConflict: true, local: 'LΔ', remote: 'RΔ' }),
		);
		assert.equal(item.action, 'skip');
	});

	it('uploads a new local-only file on first sync', () => {
		const item = decide(
			base({
				local: 'L+',
				remote: 'R0',
				hasBaseline: false,
				localExists: true,
				remoteExists: false,
			}),
		);
		assert.equal(item.action, 'upload');
	});

	it('downloads a new remote-only file on first sync', () => {
		const item = decide(
			base({
				local: 'L0',
				remote: 'R+',
				hasBaseline: false,
				localExists: false,
				remoteExists: true,
			}),
		);
		assert.equal(item.action, 'download');
	});

	it('conflicts when both sides are new with different fingerprints', () => {
		const item = decide(
			base({
				local: 'L+',
				remote: 'R+',
				hasBaseline: false,
				localFingerprint: 'sha256:aaa',
				remoteFingerprint: 'sha256:bbb',
			}),
		);
		assert.equal(item.action, 'conflict');
		assert.equal(item.conflictMode, 'both');
	});

	it('adopts when both sides are new with matching fingerprints', () => {
		const item = decide(
			base({
				local: 'L+',
				remote: 'R+',
				hasBaseline: false,
				localFingerprint: 'sha256:same',
				remoteFingerprint: 'sha256:same',
			}),
		);
		assert.equal(item.action, 'adopt');
	});

	it('propagates local edit when remote is unchanged', () => {
		const item = decide(base({ local: 'LΔ', remote: 'R=' }));
		assert.equal(item.action, 'upload');
	});

	it('propagates remote edit when local is unchanged', () => {
		const item = decide(base({ local: 'L=', remote: 'RΔ' }));
		assert.equal(item.action, 'download');
	});

	it('deletes remote when local is gone and remote matches baseline', () => {
		const item = decide(
			base({
				local: 'L0',
				remote: 'R=',
				localExists: false,
			}),
		);
		assert.equal(item.action, 'delete-remote');
	});

	it('deletes local when remote is gone and local matches baseline', () => {
		const item = decide(
			base({
				local: 'L=',
				remote: 'R0',
				remoteExists: false,
			}),
		);
		assert.equal(item.action, 'delete-local');
	});
});
