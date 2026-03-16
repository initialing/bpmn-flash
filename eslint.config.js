import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['./src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// 可以添加自定义规则
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': 'warn',
			indent: ['error', 'tab'],
			'no-tabs': 'off',
		},
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			environment: {
				node: true,
				es2021: true,
			},
		},
	}
);
