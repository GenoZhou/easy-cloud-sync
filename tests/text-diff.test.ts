import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildUnifiedHunks, flattenHunksForDisplay } from '../src/utils/textDiff';

describe('buildUnifiedHunks', () => {
	it('returns identical for the same text', () => {
		const result = buildUnifiedHunks('a\nb\n', 'a\nb\n');
		assert.equal(result.identical, true);
		assert.equal(result.truncated, false);
		assert.equal(result.hunks.length, 0);
	});

	it('emits del/add for a changed middle line', () => {
		const result = buildUnifiedHunks('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
		assert.equal(result.identical, false);
		assert.ok(result.hunks.length >= 1);
		const kinds = result.hunks[0]!.lines.map((l) => l.kind);
		assert.ok(kinds.includes('del'));
		assert.ok(kinds.includes('add'));
	});

	it('does not report identical when only a truncated prefix matches', () => {
		const device = Array.from({ length: 900 }, (_, i) => `line-${i}`).join('\n');
		const cloud =
			Array.from({ length: 800 }, (_, i) => `line-${i}`).join('\n') +
			'\n' +
			Array.from({ length: 100 }, (_, i) => `cloud-only-${i}`).join('\n');
		const result = buildUnifiedHunks(device, cloud);
		assert.equal(result.truncated, true);
		assert.equal(result.identical, false);
	});

	it('caps display lines and reports omitted count', () => {
		const device = Array.from({ length: 40 }, (_, i) => `L${i}`).join('\n');
		const cloud = Array.from({ length: 40 }, (_, i) => `R${i}`).join('\n');
		const { hunks } = buildUnifiedHunks(device, cloud);
		const flat = flattenHunksForDisplay(hunks, 10);
		assert.equal(flat.lines.length, 10);
		assert.ok(flat.omitted > 0);
	});
});
