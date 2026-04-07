import { describe, it, expect, beforeEach } from 'vitest';
import { ParallelGatewayExecutor } from '../../executors/ParallelGatewayExecutor';
import { ProcessState } from '../../state/WorkflowState';
import { createTestState, createTestDefinition } from '../../test-utils';
import { ProcessDefinition } from '../../types';

describe('ParallelGatewayExecutor', () => {
	let executor: ParallelGatewayExecutor;
	let mockDefinition: ProcessDefinition;

	beforeEach(() => {
		executor = new ParallelGatewayExecutor();
		mockDefinition = {
			id: 'test-process',
			name: '测试流程',
			elements: new Map(),
			sequenceFlows: [],
			properties: {},
			variables: [],
		} as ProcessDefinition;
	});

	it('应返回支持的元素类型', async () => {
		const types = executor.getSupportedTypes();
		expect(types).toContain('bpmn:parallelGateway');
	});

	it('应在分叉时创建多个令牌', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(2);
		expect(newState.tokens.map(t => t.elementId)).toEqual(['flow2', 'flow3']);
	});

	it('应在汇聚时等待所有输入令牌', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [
				{ id: 'token1', elementId: 'gateway1' },
				{ id: 'token2', elementId: 'gateway1' },
			],
			items: [],
			variables: {},
			startedAt: new Date(),
			activeTokens: 2,
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow2', 'flow3'],
			outgoing: ['flow4'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow4');
	});

	it('应处理单个外出路径的分叉', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow2');
	});

	it('应处理三个外出路径的分叉', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3', 'flow4'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(3);
	});

	it('应移除输入令牌', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens.filter(t => t.elementId === 'gateway1')).toHaveLength(0);
	});

	it('应保持变量不变', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { test: 'value' },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.variables).toEqual({ test: 'value' });
	});

	it('应处理没有外出路径的网关', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: [],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(0);
	});

	it('应处理空令牌数组', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(0);
	});

	it('应为每个新令牌生成唯一 ID', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		const tokenIds = newState.tokens.map(t => t.id);
		expect(new Set(tokenIds).size).toBe(tokenIds.length);
	});

	it('应保持流程状态为 running', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.status).toBe('running');
	});

	it('应处理带有文档的网关', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
			documentation: '并行网关文档',
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(2);
	});

	it('应处理带有扩展元素的网关', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
			extensionElements: {
				customProperty: 'customValue',
			},
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(2);
	});

	it('应处理复杂并行网关场景', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { applicant: '张三', amount: 1000 },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3', 'flow4', 'flow5'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(4);
		expect(newState.variables).toEqual({ applicant: '张三', amount: 1000 });
	});

	it('汇聚时应只消耗一个令牌当还有未完成路径', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [
				{ id: 'token1', elementId: 'gateway1' },
				{ id: 'token2', elementId: 'task1' },
			],
			items: [],
			variables: {},
			startedAt: new Date(),
			activeTokens: 2,
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:parallelGateway',
			incoming: ['flow2', 'flow3'],
			outgoing: ['flow4'],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens.length).toBeLessThan(2);
	});
});
