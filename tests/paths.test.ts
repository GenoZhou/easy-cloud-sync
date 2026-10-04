import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	isPluginOwnPath,
	matchGlob,
	matchesAnyGlob,
	normalizePrefix,
} from '../src/utils/paths';

describe('path excludes and prefixes', () => {
	it('normalizes S3 prefixes', () => {
		assert.equal(normalizePrefix('  /my//vault/ '), 'my/vault');
		assert.equal(normalizePrefix(''), '');
	});

	it('matches single-segment and multi-segment globs', () => {
		assert.equal(matchGlob('notes/daily.md', 'notes/*.md'), true);
		assert.equal(matchGlob('notes/deep/sub.md', 'notes/**'), true);
		assert.equal(matchGlob('attachments/img.png', '*.md'), false);
	});

	it('matches default workspace and trash exclude patterns', () => {
		const patterns = ['**/workspace*', '.trash/**'];
		assert.equal(matchesAnyGlob('.obsidian/workspace.json', patterns), true);
		assert.equal(matchesAnyGlob('.obsidian/workspace-mobile.json', patterns), true);
		assert.equal(matchesAnyGlob('.trash/note.md', patterns), true);
		assert.equal(matchesAnyGlob('notes/note.md', patterns), false);
	});

	it('detects this plugin’s own config paths', () => {
		assert.equal(
			isPluginOwnPath('.obsidian/plugins/easy-cloud-sync/data.json', '.obsidian'),
			true,
		);
		assert.equal(
			isPluginOwnPath('.obsidian/plugins/other-plugin/data.json', '.obsidian'),
			false,
		);
	});
});
