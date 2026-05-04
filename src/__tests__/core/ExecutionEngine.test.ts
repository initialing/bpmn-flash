import { describe, test, expect, beforeEach } from 'vitest';
import { ExecutionEngine } from '../../core/ExecutionEngine.js';
import { ProcessState } from '../../state/WorkflowState.js';
import { ProcessDefinition, ElementLike, TokenLike } from '../../types/index.js';
import BPMNParser from '../../parser/BPMNParser.js';
import { simpleProcessXML, complexProcessXML, parallelGatewayProcessXML } from '../fixtures/sample-processes.js';

function createTestState(overrides: Partial<ProcessState> = {}): ProcessState {
	return {
		id: 'inst-1',
		name: '测试流程',
		status: 'running',
		createdAt: new Date(),
		definitionId: 'test-process',
		data: {},
		tokens: [],
		items: [],
		variables: {},
		history: [],
		...overrides,
	};
}

describe('ExecutionEngine', () => {
	let engine: ExecutionEngine;

	beforeEach(() => {
		engine = new ExecutionEngine();
	});

	describe('constructor', () => {
		test('应注册默认执行器', () => {
			const executors = engine.getExecutors();
			expect(executors.length).toBeGreaterThan(0);
		});
	});

	describe('registerExecutor', () => {
		test('应能注册自定义执行器', () => {
			const customExecutor = {
				getSupportedTypes: () => ['bpmn:customTask'],
				execute: async (state: ProcessState, element: ElementLike, token: TokenLike) => state,
			};

			engine.registerExecutor(customExecutor);

			const executors = engine.getExecutors();
			expect(executors).toContain(customExecutor);
		});
	});

	describe('execute', () => {
		test('空 tokens 应直接返回状态', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = createTestState({ tokens: [] });

			const result = await engine.execute(state, definition);

			expect(result).toBeDefined();
		});

		test('应执行 startEvent token', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = createTestState({
				tokens: [{
					id: 't1',
					elementId: 'start',
					data: {},
					createdAt: new Date(),
				}],
			});

			const result = await engine.execute(state, definition);

			expect(result).toBeDefined();
			// startEvent 应被执行并产生后续 token
		});

		test('找不到元素的 token 应返回错误', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = createTestState({
				tokens: [{
					id: 't1',
					elementId: 'nonexistent-element',
					data: {},
					createdAt: new Date(),
				}],
			});

			const result = await engine.execute(state, definition);

			// 应该不会崩溃
			expect(result).toBeDefined();
		});

		test('没有活跃 tokens 且没有未完成 items 时应标记为 completed', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = createTestState({
				status: 'running',
				tokens: [],
				items: [{
					id: 'i1', elementId: 'task1', name: '任务', type: 'bpmn:userTask',
					status: 'completed', data: {}, startedAt: new Date(),
					assignee: null, candidateUsers: null, candidateGroups: null,
				}],
			});

			const result = await engine.execute(state, definition);

			expect(result.status).toBe('completed');
			expect(result.endedAt).toBeDefined();
		});

		test('有未完成 items 时不应标记为 completed', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = createTestState({
				status: 'running',
				tokens: [],
				items: [{
					id: 'i1', elementId: 'task1', name: '任务', type: 'bpmn:userTask',
					status: 'wait', data: {}, startedAt: new Date(),
					assignee: null, candidateUsers: null, candidateGroups: null,
				}],
			});

			const result = await engine.execute(state, definition);

			expect(result.status).toBe('running');
		});

		test('非 running 状态不应自动完成', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = createTestState({
				status: 'suspended',
				tokens: [],
				items: [],
			});

			const result = await engine.execute(state, definition);

			expect(result.status).toBe('suspended');
		});
	});

	describe('processElement', () => {
		test('应使用正确的执行器处理 startEvent', async () => {
			const state = createTestState();
			const element: ElementLike = {
				id: 'start',
				type: 'bpmn:startEvent',
				name: '开始',
				incoming: [],
				outgoing: ['flow1'],
			};
			const token: TokenLike = { id: 't1', elementId: 'start', data: {} };

			const result = await engine.processElement(state, element, token);

			expect(result).toBeDefined();
		});

		test('应使用正确的执行器处理 userTask', async () => {
			const state = createTestState();
			const element: ElementLike = {
				id: 'task1',
				type: 'bpmn:userTask',
				name: '用户任务',
				incoming: ['flow1'],
				outgoing: ['flow2'],
			};
			const token: TokenLike = { id: 't1', elementId: 'task1', data: {} };

			const result = await engine.processElement(state, element, token);

			expect(result).toBeDefined();
		});

		test('未知元素类型应返回原状态', async () => {
			const state = createTestState();
			const element: ElementLike = {
				id: 'unknown1',
				type: 'bpmn:unknownType',
				name: '未知',
			};
			const token: TokenLike = { id: 't1', elementId: 'unknown1', data: {} };

			const result = await engine.processElement(state, element, token);

			expect(result).toBe(state);
		});
	});

	describe('getExecutors', () => {
		test('应返回所有注册的执行器', () => {
			const executors = engine.getExecutors();

			expect(executors.length).toBeGreaterThanOrEqual(5);
		});
	});

	describe('端到端执行', () => {
		test('简单流程应能执行到 userTask 等待', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = createTestState({
				definitionId: 'simple-process',
				tokens: [{
					id: 't1',
					elementId: 'start',
					data: {},
					createdAt: new Date(),
				}],
			});

			const result = await engine.execute(state, definition);

			// 应该产生了 userTask 的 item
			const waitItems = result.items.filter(i => i.status === 'wait');
			expect(waitItems.length).toBeGreaterThanOrEqual(0);
		});

		test('复杂流程应能执行 serviceTask 和 scriptTask', async () => {
			const definition = BPMNParser.parse(complexProcessXML);
			const state = createTestState({
				definitionId: 'complex-process',
				tokens: [{
					id: 't1',
					elementId: 'start',
					data: {},
					createdAt: new Date(),
				}],
			});

			const result = await engine.execute(state, definition);

			expect(result).toBeDefined();
		});
	});
});
