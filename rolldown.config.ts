import { defineConfig } from 'rolldown';
import typescript from '@rollup/plugin-typescript';

export default defineConfig([
	{
		input: 'src/index.ts',
		output: {
			dir: 'dist',
			format: 'es',
			entryFileNames: '[name].js',
			chunkFileNames: '[name]-[hash].js',
		},
		plugins: [
			typescript({
				tsconfig: './tsconfig.json',
				declaration: true,
				declarationDir: 'dist',
			}),
		],
		external: [],
	},
	{
		input: 'src/index.ts',
		output: {
			dir: 'dist',
			format: 'cjs',
			entryFileNames: '[name].cjs',
			chunkFileNames: '[name]-[hash].cjs',
		},
		plugins: [
			typescript({
				tsconfig: './tsconfig.json',
				declaration: true,
				declarationDir: 'dist',
			}),
		],
		external: [],
	},
]);
