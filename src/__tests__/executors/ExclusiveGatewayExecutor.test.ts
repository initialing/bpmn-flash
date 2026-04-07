import { describe, it, expect, beforeEach } from 'vitest';
import { ExclusiveGatewayExecutor } from '../../executors/ExclusiveGatewayExecutor';
import { ProcessState } from '../../state/WorkflowState';
import { createTestState, createTestDefinition } from '../../test-utils';
import { ProcessDefinition } from '../../types';

describe('ExclusiveGatewayExecutor', () => {
	let executor: ExclusiveGatewayExecutor;
	let mockDefinition: ProcessDefinition;

	beforeEach(() => {
		executor = new ExclusiveGatewayExecutor();
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
		expect(types).toContain('bpmn:exclusiveGateway');
	});

	it('应评估条件表达式并选择匹配的路径', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { amount: 1000 },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '${amount > 500}',
				},
				{
					id: 'flow3',
					sourceRef: 'gateway1',
					targetRef: 'task2',
					conditionExpression: '${amount <= 500}',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow2');
	});

	it('应选择默认路径当无条件匹配', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { amount: 100 },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '${amount > 500}',
				},
				{
					id: 'flow3',
					sourceRef: 'gateway1',
					targetRef: 'task2',
					default: true,
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow3');
	});

	it('应处理无条件表达式的路径', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow2');
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
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens.filter(t => t.elementId === 'gateway1')).toHaveLength(0);
	});

	it('应处理复杂的条件表达式', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { amount: 1000, type: 'A' },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '${amount > 500 && type === "A"}',
				},
				{
					id: 'flow3',
					sourceRef: 'gateway1',
					targetRef: 'task2',
					conditionExpression: '${amount <= 500 || type !== "A"}',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow2');
	});

	it('应处理字符串比较', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { status: 'approved' },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '${status === "approved"}',
				},
				{
					id: 'flow3',
					sourceRef: 'gateway1',
					targetRef: 'task2',
					conditionExpression: '${status === "rejected"}',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow2');
	});

	it('应处理多个外出路径但只选择一个', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { value: 100 },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3', 'flow4'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '${value > 200}',
				},
				{
					id: 'flow3',
					sourceRef: 'gateway1',
					targetRef: 'task2',
					conditionExpression: '${value > 50}',
				},
				{
					id: 'flow4',
					sourceRef: 'gateway1',
					targetRef: 'task3',
					conditionExpression: '${value <= 50}',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow3');
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
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.variables).toEqual({ test: 'value' });
	});

	it('应处理空条件表达式', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
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
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: [],
			sequenceFlows: [],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(0);
	});

	it('应处理带有文档的网关', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { amount: 1000 },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '${amount > 500}',
				},
			],
			documentation: '排他网关文档',
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
	});

	it('第一个匹配条件应为真时选择该路径', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'gateway1' }],
			items: [],
			variables: { value: 100 },
			startedAt: new Date(),
		};

		const element = {
			id: 'gateway1',
			type: 'bpmn:exclusiveGateway',
			incoming: ['flow1'],
			outgoing: ['flow2', 'flow3'],
			sequenceFlows: [
				{
					id: 'flow2',
					sourceRef: 'gateway1',
					targetRef: 'task1',
					conditionExpression: '${value > 50}',
				},
				{
					id: 'flow3',
					sourceRef: 'gateway1',
					targetRef: 'task2',
					conditionExpression: '${value > 50}',
				},
			],
		};

		const token = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('flow2');
	});
});
