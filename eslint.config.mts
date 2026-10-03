import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'src/shims/**',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// Plan requires stable IDs `easy-sync-*` and brand casing "Easy Sync".
			'obsidianmd/commands/no-plugin-id-in-command-id': 'off',
			'obsidianmd/commands/no-plugin-name-in-command-name': 'off',
			'obsidianmd/ui/sentence-case': 'off',
			// Settings search API is optional for v1; connection settings stay imperative.
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
		},
	},
);
