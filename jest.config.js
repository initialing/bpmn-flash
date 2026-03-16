import { createDefaultPreset } from 'ts-jest';

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
	rootDir: './src',
	testEnvironment: 'node',
	transform: {
		...tsJestTransformCfg,
	},
};
