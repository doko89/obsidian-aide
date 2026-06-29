import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianPlugin from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		plugins: {
			'obsidianmd': obsidianPlugin,
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
		languageOptions: {
			globals: {
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		ignores: [
			'node_modules/',
			'main.js',
			'esbuild.config.mjs',
			'version-bump.mjs',
		],
	},
);
