/**
 * Line-oriented unified diff focused on changed hunks (mobile-friendly).
 * Device text is treated as the “old” side; cloud as the “new” side.
 *
 * Compares the full texts; callers limit how many changed lines are shown.
 */

export type DiffLineKind = 'context' | 'add' | 'del';

export interface DiffLine {
	kind: DiffLineKind;
	text: string;
	/** 1-based line number on the device (old) side, when applicable. */
	deviceLine?: number;
	/** 1-based line number on the cloud (new) side, when applicable. */
	cloudLine?: number;
}

export interface DiffHunk {
	deviceStart: number;
	cloudStart: number;
	lines: DiffLine[];
}

export interface DiffResult {
	hunks: DiffHunk[];
	identical: boolean;
}

const DEFAULT_CONTEXT = 2;

/**
 * Build unified hunks for every changed region in the full texts.
 */
export function buildUnifiedHunks(
	deviceText: string,
	cloudText: string,
	context: number = DEFAULT_CONTEXT,
): DiffResult {
	const deviceLines = splitLines(deviceText);
	const cloudLines = splitLines(cloudText);

	if (
		deviceLines.length === cloudLines.length &&
		deviceLines.every((line, i) => line === cloudLines[i])
	) {
		return { hunks: [], identical: true };
	}

	const edits = myersDiff(deviceLines, cloudLines);
	const hunks = groupIntoHunks(edits, context);
	return { hunks, identical: hunks.length === 0 };
}

/**
 * Flatten hunks for display, keeping only the first {@link maxLines} output lines
 * (changed hunks with context). Remaining changed lines are counted as omitted.
 */
export function flattenHunksForDisplay(
	hunks: DiffHunk[],
	maxLines: number = 48,
): { lines: DiffLine[]; omitted: number } {
	const lines: DiffLine[] = [];
	let total = 0;
	for (const hunk of hunks) {
		for (const line of hunk.lines) {
			if (total >= maxLines) {
				const remaining = countLines(hunks) - total;
				return { lines, omitted: remaining };
			}
			lines.push(line);
			total++;
		}
	}
	return { lines, omitted: 0 };
}

/** Display row: a real diff line, or a folded run of identical context. */
export type DiffDisplayItem =
	| { type: 'line'; line: DiffLine }
	| { type: 'fold'; count: number };

/**
 * Collapse consecutive context (identical) lines into a single fold marker.
 * Add/del lines stay expanded.
 */
export function collapseContextRuns(lines: DiffLine[]): DiffDisplayItem[] {
	const items: DiffDisplayItem[] = [];
	let foldCount = 0;

	const flushFold = () => {
		if (foldCount > 0) {
			items.push({ type: 'fold', count: foldCount });
			foldCount = 0;
		}
	};

	for (const line of lines) {
		if (line.kind === 'context') {
			foldCount++;
			continue;
		}
		flushFold();
		items.push({ type: 'line', line });
	}
	flushFold();
	return items;
}

function countLines(hunks: DiffHunk[]): number {
	return hunks.reduce((n, h) => n + h.lines.length, 0);
}

function splitLines(text: string): string[] {
	if (text.length === 0) return [];
	return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

type Edit =
	| { type: 'eq'; deviceLine: number; cloudLine: number; text: string }
	| { type: 'del'; deviceLine: number; text: string }
	| { type: 'add'; cloudLine: number; text: string };

function myersDiff(a: string[], b: string[]): Edit[] {
	const n = a.length;
	const m = b.length;
	const max = n + m;
	const offset = max;
	const v = new Array<number>(2 * max + 1).fill(0);
	const trace: number[][] = [];

	for (let d = 0; d <= max; d++) {
		const vSnapshot = v.slice();
		trace.push(vSnapshot);
		for (let k = -d; k <= d; k += 2) {
			let x: number;
			if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) {
				x = v[offset + k + 1]!;
			} else {
				x = v[offset + k - 1]! + 1;
			}
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) {
				return buildEditsFromTrace(a, b, trace, offset);
			}
		}
	}
	return buildEditsFromTrace(a, b, trace, offset);
}

function buildEditsFromTrace(
	a: string[],
	b: string[],
	trace: number[][],
	offset: number,
): Edit[] {
	const edits: Edit[] = [];
	let x = a.length;
	let y = b.length;

	for (let d = trace.length - 1; d >= 0; d--) {
		const v = trace[d]!;
		const k = x - y;
		let prevK: number;
		if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) {
			prevK = k + 1;
		} else {
			prevK = k - 1;
		}
		const prevX = v[offset + prevK]!;
		const prevY = prevX - prevK;

		while (x > prevX && y > prevY) {
			edits.push({
				type: 'eq',
				deviceLine: x,
				cloudLine: y,
				text: a[x - 1]!,
			});
			x--;
			y--;
		}

		if (d === 0) break;

		if (x === prevX) {
			edits.push({ type: 'add', cloudLine: y, text: b[y - 1]! });
			y--;
		} else {
			edits.push({ type: 'del', deviceLine: x, text: a[x - 1]! });
			x--;
		}
	}

	edits.reverse();
	return edits;
}

function groupIntoHunks(edits: Edit[], context: number): DiffHunk[] {
	const changeIndexes: number[] = [];
	for (let i = 0; i < edits.length; i++) {
		if (edits[i]!.type !== 'eq') changeIndexes.push(i);
	}
	if (changeIndexes.length === 0) return [];

	const ranges: Array<{ start: number; end: number }> = [];
	let rangeStart = Math.max(0, changeIndexes[0]! - context);
	let rangeEnd = Math.min(edits.length, changeIndexes[0]! + 1 + context);

	for (let i = 1; i < changeIndexes.length; i++) {
		const nextStart = Math.max(0, changeIndexes[i]! - context);
		const nextEnd = Math.min(edits.length, changeIndexes[i]! + 1 + context);
		if (nextStart <= rangeEnd) {
			rangeEnd = Math.max(rangeEnd, nextEnd);
		} else {
			ranges.push({ start: rangeStart, end: rangeEnd });
			rangeStart = nextStart;
			rangeEnd = nextEnd;
		}
	}
	ranges.push({ start: rangeStart, end: rangeEnd });

	return ranges.map(({ start, end }) => {
		const slice = edits.slice(start, end);
		let deviceStart = 1;
		let cloudStart = 1;
		for (const edit of slice) {
			if (edit.type === 'eq' || edit.type === 'del') {
				deviceStart = edit.deviceLine;
				break;
			}
		}
		for (const edit of slice) {
			if (edit.type === 'eq' || edit.type === 'add') {
				cloudStart = edit.cloudLine;
				break;
			}
		}

		const lines: DiffLine[] = slice.map((edit) => {
			if (edit.type === 'eq') {
				return {
					kind: 'context',
					text: edit.text,
					deviceLine: edit.deviceLine,
					cloudLine: edit.cloudLine,
				};
			}
			if (edit.type === 'del') {
				return { kind: 'del', text: edit.text, deviceLine: edit.deviceLine };
			}
			return { kind: 'add', text: edit.text, cloudLine: edit.cloudLine };
		});

		return { deviceStart, cloudStart, lines };
	});
}
