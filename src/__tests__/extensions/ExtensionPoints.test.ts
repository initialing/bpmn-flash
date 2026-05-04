import { describe, test, expect, vi } from 'vitest';
import { SimplePluginRegistry } from '../../extensions/ExtensionPoints.js';
import type {
	EngineHook,
	EngineHookType,
	WorkflowPlugin,
	HookContext,
	WorkflowEngineOptions,
} from '../../extensions/ExtensionPoints.js';

describe('SimplePluginRegistry', () => {
	test('应能注册和获取钩子', () => {
		const registry = new SimplePluginRegistry();
		const hook: EngineHook = vi.fn();

		registry.registerHook('beforeExecute', hook);

		const hooks = registry.getHooks('beforeExecute');
		expect(hooks).toHaveLength(1);
		expect(hooks[0]).toBe(hook);
	});

	test('应能注册多个钩子到同一类型', () => {
		const registry = new SimplePluginRegistry();
		const hook1: EngineHook = vi.fn();
		const hook2: EngineHook = vi.fn();

		registry.registerHook('afterExecute', hook1);
		registry.registerHook('afterExecute', hook2);

		const hooks = registry.getHooks('afterExecute');
		expect(hooks).toHaveLength(2);
	});

	test('应能注册钩子到不同类型', () => {
		const registry = new SimplePluginRegistry();
		const hook1: EngineHook = vi.fn();
		const hook2: EngineHook = vi.fn();

		registry.registerHook('beforeExecute', hook1);
		registry.registerHook('afterExecute', hook2);

		expect(registry.getHooks('beforeExecute')).toHaveLength(1);
		expect(registry.getHooks('afterExecute')).toHaveLength(1);
	});

	test('应能注销钩子', () => {
		const registry = new SimplePluginRegistry();
		const hook: EngineHook = vi.fn();

		registry.registerHook('beforeExecute', hook);
		expect(registry.getHooks('beforeExecute')).toHaveLength(1);

		registry.unregisterHook('beforeExecute', hook);
		expect(registry.getHooks('beforeExecute')).toHaveLength(0);
	});

	test('注销不存在的钩子类型不应报错', () => {
		const registry = new SimplePluginRegistry();
		const hook: EngineHook = vi.fn();

		expect(() => registry.unregisterHook('beforeExecute', hook)).not.toThrow();
	});

	test('注销不存在的钩子不应影响已有钩子', () => {
		const registry = new SimplePluginRegistry();
		const hook1: EngineHook = vi.fn();
		const hook2: EngineHook = vi.fn();

		registry.registerHook('beforeExecute', hook1);
		registry.unregisterHook('beforeExecute', hook2);

		expect(registry.getHooks('beforeExecute')).toHaveLength(1);
	});

	test('获取未注册类型的钩子应返回空数组', () => {
		const registry = new SimplePluginRegistry();

		const hooks = registry.getHooks('onTaskCreated');
		expect(hooks).toEqual([]);
	});

	test('clear 应清空所有钩子', () => {
		const registry = new SimplePluginRegistry();
		registry.registerHook('beforeExecute', vi.fn());
		registry.registerHook('afterExecute', vi.fn());
		registry.registerHook('onTaskCreated', vi.fn());

		registry.clear();

		expect(registry.getHooks('beforeExecute')).toEqual([]);
		expect(registry.getHooks('afterExecute')).toEqual([]);
		expect(registry.getHooks('onTaskCreated')).toEqual([]);
	});

	test('不应重复注册同一个钩子函数（Set 行为）', () => {
		const registry = new SimplePluginRegistry();
		const hook: EngineHook = vi.fn();

		registry.registerHook('beforeExecute', hook);
		registry.registerHook('beforeExecute', hook);

		expect(registry.getHooks('beforeExecute')).toHaveLength(1);
	});

	test('插件应能通过 install 注册钩子', () => {
		const registry = new SimplePluginRegistry();

		const plugin: WorkflowPlugin = {
			name: 'test-plugin',
			version: '1.0.0',
			description: '测试插件',
			install(reg) {
				reg.registerHook('beforeExecute', async (ctx) => {
					// noop
				});
				reg.registerHook('afterExecute', async (ctx) => {
					// noop
				});
			},
		};

		plugin.install(registry);

		expect(registry.getHooks('beforeExecute')).toHaveLength(1);
		expect(registry.getHooks('afterExecute')).toHaveLength(1);
	});

	test('应支持所有钩子类型', () => {
		const registry = new SimplePluginRegistry();
		const hookTypes: EngineHookType[] = [
			'beforeExecute', 'afterExecute',
			'beforeTransition', 'afterTransition',
			'onTaskCreated', 'onTaskCompleted',
			'onProcessStarted', 'onProcessCompleted',
		];

		for (const hookType of hookTypes) {
			const hook: EngineHook = vi.fn();
			registry.registerHook(hookType, hook);
			expect(registry.getHooks(hookType)).toHaveLength(1);
		}
	});

	test('钩子函数应能被异步调用', async () => {
		const registry = new SimplePluginRegistry();
		const results: string[] = [];

		const asyncHook: EngineHook = async (ctx: HookContext) => {
			results.push(`hook:${ctx.hookType}`);
		};

		registry.registerHook('onProcessStarted', asyncHook);

		const hooks = registry.getHooks('onProcessStarted');
		const context: HookContext = {
			hookType: 'onProcessStarted',
			state: {
				id: 's1', name: 'test', status: 'running',
				createdAt: new Date(), definitionId: 'd1',
				data: {}, tokens: [], items: [], variables: {}, history: [],
			},
			timestamp: new Date(),
		};

		for (const hook of hooks) {
			await hook(context);
		}

		expect(results).toEqual(['hook:onProcessStarted']);
	});
});
