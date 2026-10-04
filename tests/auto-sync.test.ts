import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allowsAutomaticSync, shouldSkipAutomaticTrigger } from '../src/sync/autoSync';

describe('allowsAutomaticSync', () => {
	it('is false for manual-only interval 0', () => {
		assert.equal(allowsAutomaticSync(0), false);
	});

	it('is true for positive intervals', () => {
		assert.equal(allowsAutomaticSync(5), true);
	});
});

describe('shouldSkipAutomaticTrigger', () => {
	it('never skips manual triggers', () => {
		assert.equal(shouldSkipAutomaticTrigger('manual', 0), false);
		assert.equal(shouldSkipAutomaticTrigger('manual', 5), false);
	});

	it('skips startup and scheduled when interval is 0', () => {
		assert.equal(shouldSkipAutomaticTrigger('startup', 0), true);
		assert.equal(shouldSkipAutomaticTrigger('scheduled', 0), true);
	});

	it('allows startup and scheduled when interval is positive', () => {
		assert.equal(shouldSkipAutomaticTrigger('startup', 5), false);
		assert.equal(shouldSkipAutomaticTrigger('scheduled', 5), false);
	});
});
