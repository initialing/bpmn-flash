import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ScriptTaskExecutor } from '../../executors/ScriptTaskExecutor.js';
import { ProcessState } from '../../state/WorkflowState.js';
import { ScriptExecutorPlugin } from '../../types/index.js';

function createTestState(overrides: Partial<ProcessState> = {}): ProcessState {
	return {
		id: 'inst-1',
		name: '测试流程',
		status: 'running',
		createdAt: new Date(),
		definitionId: 'test-process',
		data: { x: 10, y: 5 },
		tokens: [{ id: 'token1', elementId: 'script1', data: { x: 10, y: 5 }, createdAt: new Date() }],
		items: [],
		variables: {},
		history: [],
		...overrides,
	};
}

function createScriptElement(script: string, scriptLanguage = 'javascript') {
	return {
		id: 'script1',
		type: 'bpmn:scriptTask',
		name: '脚本任务',
		incoming: [],
		outgoing: [],
		properties: {
			script,
			scriptLanguage,
		},
	};
}

describe('ScriptExecutorPlugin', () => {
	let executor: ScriptTaskExecutor;

	beforeEach(() => {
		executor = new ScriptTaskExecutor();
	});

	describe('插件注册', () => {
		test('默认无插件', () => {
			expect(executor.getScriptExecutorPlugin()).toBeNull();
		});

		test('应能设置和获取插件', () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => cb(null, {}),
			};
			executor.setScriptExecutorPlugin(plugin);
			expect(executor.getScriptExecutorPlugin()).toBe(plugin);
		});

		test('应能清除插件', () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => cb(null, {}),
			};
			executor.setScriptExecutorPlugin(plugin);
			executor.setScriptExecutorPlugin(null);
			expect(executor.getScriptExecutorPlugin()).toBeNull();
		});
	});

	describe('无插件时 - 使用内置表达式计算器', () => {
		test('应使用内置表达式计算器执行脚本', async () => {
			const state = createTestState();
			const element = createScriptElement('x + y');
			const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

			const result = await executor.execute(state, element, token);

			expect(result).toBeDefined();
			expect(result.data).toBeDefined();
			// 现有行为不变
			const completeEntry = result.history.find(h => h.action === 'complete');
			expect(completeEntry).toBeDefined();
		});
	});

	describe('有插件时 - 调用插件执行脚本', () => {
		test('应调用插件而非内置计算器', async () => {
			const pluginExecute = vi.fn(
				(state: ProcessState, script: string, cb: (error: Error | null, result?: Record<string, any>) => void) => {
					cb(null, { computed: 42 });
				}
			);

			const plugin: ScriptExecutorPlugin = {
				execute: pluginExecute,
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState();
			const element = createScriptElement('any script content');
			const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

			const result = await executor.execute(state, element, token);

			// 验证插件被调用
			expect(pluginExecute).toHaveBeenCalledTimes(1);
			// 验证传入了正确的参数
			expect(pluginExecute.mock.calls[0][1]).toBe('any script content');
			// 验证 state 参数是完整的 ProcessState
			const passedState = pluginExecute.mock.calls[0][0];
			expect(passedState.id).toBe('inst-1');
			expect(passedState.status).toBe('running');
		});

		test('插件收到完整的 ProcessState', async () => {
			let receivedState: ProcessState | null = null;

			const plugin: ScriptExecutorPlugin = {
				execute: (state, _script, cb) => {
					receivedState = state;
					cb(null, {});
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState({
				data: { foo: 'bar', num: 123 },
				variables: { v1: 'val1' },
			});
			const element = createScriptElement('test');
			const token = { id: 'token1', elementId: 'script1', data: { foo: 'bar', num: 123 } };

			await executor.execute(state, element, token);

			expect(receivedState).not.toBeNull();
			expect(receivedState!.data.foo).toBe('bar');
			expect(receivedState!.data.num).toBe(123);
			expect(receivedState!.variables.v1).toBe('val1');
			expect(receivedState!.definitionId).toBe('test-process');
		});
	});

	describe('插件 cb 返回成功 - result 合并到流程变量', () => {
		test('应将 result 合并到 state.data', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => {
					cb(null, { result: 100, greeting: 'hello' });
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState({ data: { existing: true } });
			const element = createScriptElement('some script');
			const token = { id: 'token1', elementId: 'script1', data: { existing: true } };

			const newState = await executor.execute(state, element, token);

			// result 合并到 data
			expect(newState.data.result).toBe(100);
			expect(newState.data.greeting).toBe('hello');
			expect(newState.data.existing).toBe(true);
		});

		test('cb 返回空对象时不影响现有数据', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => {
					cb(null, {});
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState({ data: { keep: 'this' } });
			const element = createScriptElement('some script');
			const token = { id: 'token1', elementId: 'script1', data: { keep: 'this' } };

			const newState = await executor.execute(state, element, token);

			expect(newState.data.keep).toBe('this');
		});

		test('cb 返回 undefined result 时正常完成', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => {
					cb(null);
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState();
			const element = createScriptElement('some script');
			const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

			const newState = await executor.execute(state, element, token);

			const completeEntry = newState.history.find(h => h.action === 'complete');
			expect(completeEntry).toBeDefined();
		});

		test('应记录 complete 到历史', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => {
					cb(null, { output: 'done' });
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState();
			const element = createScriptElement('some script');
			const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

			const newState = await executor.execute(state, element, token);

			const startEntry = newState.history.find(h => h.action === 'start');
			const completeEntry = newState.history.find(h => h.action === 'complete');
			expect(startEntry).toBeDefined();
			expect(completeEntry).toBeDefined();
			expect(completeEntry!.data?.result).toEqual({ output: 'done' });
		});
	});

	describe('插件 cb 返回错误 - 记录错误到 history', () => {
		test('应记录 error 到历史', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => {
					cb(new Error('脚本执行失败：语法错误'));
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState();
			const element = createScriptElement('bad script');
			const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

			const newState = await executor.execute(state, element, token);

			const errorEntry = newState.history.find(h => h.action === 'error');
			expect(errorEntry).toBeDefined();
			expect(errorEntry!.data?.error).toContain('脚本执行失败');
		});

		test('错误时不应合并 result 到 data', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => {
					cb(new Error('执行失败'));
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState({ data: { original: true } });
			const element = createScriptElement('bad script');
			const token = { id: 'token1', elementId: 'script1', data: { original: true } };

			const newState = await executor.execute(state, element, token);

			expect(newState.data.original).toBe(true);
			// 不应有新的数据被合并
			const completeEntry = newState.history.find(h => h.action === 'complete');
			expect(completeEntry).toBeUndefined();
		});
	});

	describe('插件同步异常处理', () => {
		test('插件 execute 抛异常时应安全处理', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: () => {
					throw new Error('插件内部崩溃');
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState();
			const element = createScriptElement('crash script');
			const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

			const newState = await executor.execute(state, element, token);

			// 应有错误记录
			const errorEntry = newState.history.find(h => h.action === 'error');
			expect(errorEntry).toBeDefined();
			expect(errorEntry!.data?.error).toContain('插件内部崩溃');
		});
	});

	describe('插件异步 cb 调用', () => {
		test('插件异步调用 cb 时应正常工作', async () => {
			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => {
					setTimeout(() => {
						cb(null, { async: true, value: 999 });
					}, 10);
				},
			};

			executor.setScriptExecutorPlugin(plugin);

			const state = createTestState();
			const element = createScriptElement('async script');
			const token = { id: 'token1', elementId: 'script1', data: { x: 10, y: 5 } };

			const newState = await executor.execute(state, element, token);

			expect(newState.data.async).toBe(true);
			expect(newState.data.value).toBe(999);
			const completeEntry = newState.history.find(h => h.action === 'complete');
			expect(completeEntry).toBeDefined();
		});
	});

	describe('WorkflowEngine 集成', () => {
		test('应通过 WorkflowEngine 注册和获取插件', async () => {
			const { WorkflowEngine } = await import('../../core/WorkflowEngine.js');
			const engine = new WorkflowEngine();

			expect(engine.getScriptExecutorPlugin()).toBeNull();

			const plugin: ScriptExecutorPlugin = {
				execute: (_state, _script, cb) => cb(null, {}),
			};

			engine.setScriptExecutorPlugin(plugin);
			expect(engine.getScriptExecutorPlugin()).toBe(plugin);
		});
	});
});
