import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closeConflictDiffToSidebar } from '../src/ui/closeConflictDiff';

describe('closeConflictDiffToSidebar', () => {
	it('refreshes, detaches, then activates (detach before reveal)', async () => {
		const steps: string[] = [];
		const outcome = await closeConflictDiffToSidebar({
			refreshConflictUi: () => {
				steps.push('refresh');
			},
			detachDiff: () => {
				steps.push('detach');
			},
			activateSidebar: () => {
				steps.push('activate');
			},
		});
		assert.equal(outcome.ok, true);
		assert.deepEqual(steps, ['refresh', 'detach', 'activate']);
	});

	it('returns detach failure without activating when detach throws', async () => {
		const steps: string[] = [];
		const outcome = await closeConflictDiffToSidebar({
			refreshConflictUi: () => {
				steps.push('refresh');
			},
			detachDiff: () => {
				steps.push('detach');
				throw new Error('detach failed');
			},
			activateSidebar: () => {
				steps.push('activate');
			},
		});
		assert.equal(outcome.ok, false);
		if (outcome.ok) assert.fail('expected failure');
		assert.equal(outcome.step, 'detach');
		assert.ok(outcome.error instanceof Error);
		assert.equal(outcome.error.message, 'detach failed');
		assert.deepEqual(steps, ['refresh', 'detach']);
	});

	it('retries activate once after the first activate failure', async () => {
		const steps: string[] = [];
		let activateCalls = 0;
		const outcome = await closeConflictDiffToSidebar({
			refreshConflictUi: () => {
				steps.push('refresh');
			},
			detachDiff: () => {
				steps.push('detach');
			},
			activateSidebar: () => {
				activateCalls += 1;
				steps.push(`activate-${activateCalls}`);
				if (activateCalls === 1) {
					throw new Error('first activate failed');
				}
			},
		});
		assert.equal(outcome.ok, true);
		assert.deepEqual(steps, ['refresh', 'detach', 'activate-1', 'activate-2']);
	});

	it('returns activate failure when both activate attempts fail', async () => {
		const steps: string[] = [];
		const outcome = await closeConflictDiffToSidebar({
			refreshConflictUi: () => {
				steps.push('refresh');
			},
			detachDiff: () => {
				steps.push('detach');
			},
			activateSidebar: () => {
				steps.push('activate');
				throw new Error('activate failed');
			},
		});
		assert.equal(outcome.ok, false);
		if (outcome.ok) assert.fail('expected failure');
		assert.equal(outcome.step, 'activate');
		assert.ok(outcome.error instanceof Error);
		assert.equal(outcome.error.message, 'activate failed');
		assert.deepEqual(steps, ['refresh', 'detach', 'activate', 'activate']);
	});
});
