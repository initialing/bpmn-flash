import { describe, it, expect, beforeEach } from 'vitest';
import { EndEventExecutor } from '../../executors/EndEventExecutor';
import { ProcessState } from '../../state/WorkflowState';
import { createTestState, createTestDefinition } from '../../test-utils';
import { ProcessDefinition } from '../../types';
import { createTestState, createTestDefinition } from '../test-utils';

describe('EndEventExecutor', () => {
	let executor: EndEventExecutor;
	let mockDefinition: ProcessDefinition;

	beforeEach(() => {
		executor = new EndEventExecutor();
		mockDefinition = createTestDefinition();
	});

	it('应返回支持的元素类型', async () => {
		const types = executor.getSupportedTypes();
		expect(types).toContain('bpmn:endEvent');
	});

	it('应执行结束事件并移除令牌', async () => {
		const state = createTestState({ tokens: [{ id: 'token1', elementId: 'end1' }] });

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(0);
	});

	it('应保持其他令牌不受影响', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [
				{ id: 'token1', elementId: 'end1' },
				{ id: 'token2', elementId: 'task1' },
			],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('task1');
	});

	it('应检查是否所有令牌都已完成', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'end1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.status).toBe('completed');
	});

	it('应处理带有文档信息的结束事件', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'end1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
			documentation: '结束节点文档',
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(0);
	});

	it('应处理带有扩展元素的结束事件', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'end1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
			extensionElements: {
				customProperty: 'customValue',
			},
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(0);
	});

	it('应处理多个结束事件', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [
				{ id: 'token1', elementId: 'end1' },
				{ id: 'token2', elementId: 'end2' },
			],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(1);
		expect(newState.tokens[0].elementId).toBe('end2');
	});

	it('应保持变量不变', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'end1' }],
			items: [],
			variables: { result: 'approved' },
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.variables).toEqual({ result: 'approved' });
	});

	it('应保持项目状态不变', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'end1' }],
			items: [
				{
					id: 'item1',
					elementId: 'task1',
					status: 'completed',
					type: 'bpmn:userTask',
				},
			],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.items).toHaveLength(1);
		expect(newState.items[0].status).toBe('completed');
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
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState.tokens).toHaveLength(0);
		expect(newState.status).toBe('completed');
	});

	it('应返回执行结果包含成功标志', async () => {
		const state: ProcessState = {
			status: 'running',
			tokens: [{ id: 'token1', elementId: 'end1' }],
			items: [],
			variables: {},
			startedAt: new Date(),
		};

		const element = {
			id: 'end1',
			type: 'bpmn:endEvent',
			incoming: ['flow1'],
		};

		const token = state.tokens.length > 0 ? state.tokens[0] : { id: 'token1', elementId: element.id, data: {} }; const newState = await executor.execute(state, element, token);

		expect(newState).toBeDefined();
		expect(newState.status).toBe('completed');
	});
});
