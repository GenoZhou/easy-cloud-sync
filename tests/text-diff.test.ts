import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	buildUnifiedHunks,
	collapseContextRuns,
	flattenHunksForDisplay,
	interleaveChangePairs,
} from '../src/utils/textDiff';

describe('buildUnifiedHunks', () => {
	it('returns identical for the same text', () => {
		const result = buildUnifiedHunks('a\nb\n', 'a\nb\n');
		assert.equal(result.identical, true);
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

	it('finds a change near the end of a long file', () => {
		const head = Array.from({ length: 900 }, (_, i) => `line-${i}`);
		const device = [...head, 'device-tail'].join('\n');
		const cloud = [...head, 'cloud-tail'].join('\n');
		const result = buildUnifiedHunks(device, cloud);
		assert.equal(result.identical, false);
		assert.ok(result.hunks.length >= 1);
		const texts = result.hunks.flatMap((h) => h.lines.map((l) => l.text));
		assert.ok(texts.includes('device-tail'));
		assert.ok(texts.includes('cloud-tail'));
	});

	it('display flatten keeps only the first changed lines', () => {
		const device = Array.from({ length: 40 }, (_, i) => `L${i}`).join('\n');
		const cloud = Array.from({ length: 40 }, (_, i) => `R${i}`).join('\n');
		const { hunks } = buildUnifiedHunks(device, cloud);
		const flat = flattenHunksForDisplay(hunks, 10);
		assert.equal(flat.lines.length, 10);
		assert.ok(flat.omitted > 0);
	});
});

describe('interleaveChangePairs', () => {
	it('pairs consecutive dels and adds so device/cloud sit on adjacent rows', () => {
		const lines = interleaveChangePairs([
			{ kind: 'del', text: 'a' },
			{ kind: 'del', text: 'b' },
			{ kind: 'add', text: 'A' },
			{ kind: 'add', text: 'B' },
		]);
		assert.deepEqual(
			lines.map((l) => `${l.kind}:${l.text}`),
			['del:a', 'add:A', 'del:b', 'add:B'],
		);
	});

	it('leaves context runs in place', () => {
		const lines = interleaveChangePairs([
			{ kind: 'context', text: 'keep' },
			{ kind: 'del', text: 'old' },
			{ kind: 'add', text: 'new' },
			{ kind: 'context', text: 'tail' },
		]);
		assert.deepEqual(
			lines.map((l) => `${l.kind}:${l.text}`),
			['context:keep', 'del:old', 'add:new', 'context:tail'],
		);
	});
});

describe('collapseContextRuns', () => {
	it('folds consecutive identical context lines', () => {
		const items = collapseContextRuns([
			{ kind: 'context', text: 'a' },
			{ kind: 'context', text: 'b' },
			{ kind: 'del', text: 'old' },
			{ kind: 'add', text: 'new' },
			{ kind: 'context', text: 'c' },
		]);
		assert.deepEqual(items, [
			{ type: 'fold', count: 2 },
			{ type: 'line', line: { kind: 'del', text: 'old' } },
			{ type: 'line', line: { kind: 'add', text: 'new' } },
			{ type: 'fold', count: 1 },
		]);
	});

	it('interleaves multi-line replacements before folding', () => {
		const items = collapseContextRuns([
			{ kind: 'del', text: 'a' },
			{ kind: 'del', text: 'b' },
			{ kind: 'add', text: 'A' },
			{ kind: 'add', text: 'B' },
		]);
		assert.deepEqual(
			items.map((item) =>
				item.type === 'fold' ? `fold:${item.count}` : `${item.line.kind}:${item.line.text}`,
			),
			['del:a', 'add:A', 'del:b', 'add:B'],
		);
	});

	it('passes through add/del-only lists unchanged in structure', () => {
		const items = collapseContextRuns([
			{ kind: 'del', text: 'x' },
			{ kind: 'add', text: 'y' },
		]);
		assert.equal(items.length, 2);
		assert.equal(items[0]?.type, 'line');
		assert.equal(items[1]?.type, 'line');
	});
});
