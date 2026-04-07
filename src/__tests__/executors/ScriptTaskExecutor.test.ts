import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptTaskExecutor } from '../../executors/ScriptTaskExecutor.js';
import { ProcessState } from '../../state/WorkflowState.js';

describe('ScriptTaskExecutor', () => {
	let executor: ScriptTaskExecutor;

	beforeEach(() => {
		executor = new ScriptTaskExecutor();
	});

	test('应支持 bpmn:scriptTask 类型', () => {
		expect(executor.getSupportedTypes()).toContain('bpmn:scriptTask');
		expect(executor.canHandle('bpmn:scriptTask')).toBe(true);
		expect(executor.canHandle('bpmn:userTask')).toBe(false);
	});

	test('应执行简单的 JavaScript 表达式', async () => {
		const state: ProcessState = {
			status: 'running',
			data: { x: 10, y: 5 },
			tokens: [{ id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '脚本任务',
			incoming: [],
			outgoing: [],
			properties: {
				script: 'x + y',
				scriptLanguage: 'javascript',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

		const result = await executor.execute(state, element, token);

		expect(result).toBeDefined();
		expect(result.data).toBeDefined();
		expect(result.data.x).toBe(10);
		expect(result.data.y).toBe(5);
	});

	test('应执行多行脚本', async () => {
		const state: ProcessState = {
			status: 'running',
			data: { x: 10 },
			tokens: [{ id: 'token1', elementId: 'script1', data: { x: 10 } }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '多行脚本',
			incoming: [],
			outgoing: [],
			properties: {
				script: `
					y = x * 2
					z = y + 5
					z
				`.trim(),
				scriptLanguage: 'javascript',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: { x: 10 } };

		const result = await executor.execute(state, element, token);

		expect(result).toBeDefined();
		expect(result.history).toBeDefined();
		expect(result.history.length).toBeGreaterThan(0);
	});

	test('应拒绝包含不安全关键字的脚本', async () => {
		const state: ProcessState = {
			status: 'running',
			data: {},
			tokens: [{ id: 'token1', elementId: 'script1', data: {} }],
			items: [],
			history: [],
		};

		const unsafeScripts = [
			'eval("alert(1)")',
			'require("fs")',
			'process.env',
			'Function("return this")()',
			'global',
		];

		for (const script of unsafeScripts) {
			const element = {
				id: 'script1',
				type: 'bpmn:scriptTask',
				name: '不安全脚本',
				incoming: [],
				outgoing: [],
				properties: {
					script,
					scriptLanguage: 'javascript',
				},
			};

			const token = { id: 'token1', elementId: 'script1', data: {} };

			const result = await executor.execute(state, element, token);

			expect(result).toBeDefined();
			expect(result.history).toBeDefined();
			const lastEntry = result.history[result.history.length - 1];
			expect(lastEntry.action).toBe('error');
		}
	});

	test('应处理空脚本', async () => {
		const state: ProcessState = {
			status: 'running',
			data: { x: 10 },
			tokens: [{ id: 'token1', elementId: 'script1', data: { x: 10 } }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '空脚本',
			incoming: [],
			outgoing: [],
			properties: {
				script: '',
				scriptLanguage: 'javascript',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: { x: 10 } };

		const result = await executor.execute(state, element, token);

		expect(result).toBeDefined();
		expect(result.data.x).toBe(10);
	});

	test('应处理未指定脚本的错误', async () => {
		const state: ProcessState = {
			status: 'running',
			data: {},
			tokens: [{ id: 'token1', elementId: 'script1', data: {} }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '无脚本',
			incoming: [],
			outgoing: [],
			properties: {
				scriptLanguage: 'javascript',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: {} };

		const result = await executor.execute(state, element, token);

		expect(result).toBeDefined();
		expect(result.history).toBeDefined();
		const lastEntry = result.history[result.history.length - 1];
		expect(lastEntry.action).toBe('error');
	});

	test('应拒绝不支持的脚本语言', async () => {
		const state: ProcessState = {
			status: 'running',
			data: {},
			tokens: [{ id: 'token1', elementId: 'script1', data: {} }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '不支持的语言',
			incoming: [],
			outgoing: [],
			properties: {
				script: 'print("hello")',
				scriptLanguage: 'python',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: {} };

		const result = await executor.execute(state, element, token);

		expect(result).toBeDefined();
		expect(result.history).toBeDefined();
		const lastEntry = result.history[result.history.length - 1];
		expect(lastEntry.action).toBe('error');
	});

	test('应执行字符串拼接', async () => {
		const state: ProcessState = {
			status: 'running',
			data: { firstName: 'John', lastName: 'Doe' },
			tokens: [{ id: 'token1', elementId: 'script1', data: { firstName: 'John', lastName: 'Doe' } }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '字符串拼接',
			incoming: [],
			outgoing: [],
			properties: {
				script: "'Hello ' + firstName + ' ' + lastName",
				scriptLanguage: 'javascript',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: { firstName: 'John', lastName: 'Doe' } };

		const result = await executor.execute(state, element, token);

		expect(result).toBeDefined();
		expect(result.data.firstName).toBe('John');
		expect(result.data.lastName).toBe('Doe');
	});

	test('应执行比较运算', async () => {
		const state: ProcessState = {
			status: 'running',
			data: { age: 25 },
			tokens: [{ id: 'token1', elementId: 'script1', data: { age: 25 } }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '比较运算',
			incoming: [],
			outgoing: [],
			properties: {
				script: 'age >= 18',
				scriptLanguage: 'javascript',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: { age: 25 } };

		const result = await executor.execute(state, element, token);

		expect(result).toBeDefined();
		expect(result.history.length).toBeGreaterThan(0);
		const completeEntry = result.history.find(h => h.action === 'complete');
		expect(completeEntry).toBeDefined();
	});

	test('应记录执行历史', async () => {
		const state: ProcessState = {
			status: 'running',
			data: { x: 10 },
			tokens: [{ id: 'token1', elementId: 'script1', data: { x: 10 } }],
			items: [],
			history: [],
		};

		const element = {
			id: 'script1',
			type: 'bpmn:scriptTask',
			name: '脚本任务',
			incoming: [],
			outgoing: [],
			properties: {
				script: 'x * 2',
				scriptLanguage: 'javascript',
			},
		};

		const token = { id: 'token1', elementId: 'script1', data: { x: 10 } };

		const result = await executor.execute(state, element, token);

		expect(result.history).toBeDefined();
		expect(result.history.length).toBeGreaterThanOrEqual(1);
		
		const startEntry = result.history.find(h => h.action === 'start');
		expect(startEntry).toBeDefined();
		expect(startEntry?.elementId).toBe('script1');
	});
});
