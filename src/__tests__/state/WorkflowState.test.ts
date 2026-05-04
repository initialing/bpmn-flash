import { describe, test, expect } from 'vitest';
import { WorkflowState, ProcessState, StateAction } from '../../state/WorkflowState.js';

function createMinimalDefinition() {
	return {
		id: 'proc-1',
		name: '测试流程',
		elements: new Map(),
		sequenceFlows: new Map(),
	};
}

function createSampleState(): ProcessState {
	return {
		id: 'inst-1',
		name: '测试流程',
		status: 'created',
		createdAt: new Date('2024-01-01'),
		definitionId: 'proc-1',
		data: {},
		tokens: [],
		items: [],
		variables: {},
		history: [],
	};
}

describe('WorkflowState', () => {
	describe('createInitialState', () => {
		test('应使用定义的 id 和 name 创建初始状态', () => {
			const def = createMinimalDefinition();
			const state = WorkflowState.createInitialState(def);

			expect(state.status).toBe('created');
			expect(state.name).toBe('测试流程');
			expect(state.definitionId).toBe('proc-1');
			expect(state.tokens).toEqual([]);
			expect(state.items).toEqual([]);
			expect(state.history).toEqual([]);
			expect(state.data).toEqual({});
		});

		test('应合并初始数据', () => {
			const def = createMinimalDefinition();
			const state = WorkflowState.createInitialState(def, { x: 10, y: 'hello' });

			expect(state.data).toEqual({ x: 10, y: 'hello' });
		});

		test('当定义没有 name 时应使用 id 作为 name', () => {
			const def = { ...createMinimalDefinition(), name: '' };
			const state = WorkflowState.createInitialState(def);

			expect(state.name).toBe('proc-1');
		});

		test('应生成唯一 id', () => {
			const def = createMinimalDefinition();
			const s1 = WorkflowState.createInitialState(def);
			const s2 = WorkflowState.createInitialState(def);

			expect(s1.id).not.toBe(s2.id);
		});

		test('不传 initialData 时默认空对象', () => {
			const def = createMinimalDefinition();
			const state = WorkflowState.createInitialState(def);
			expect(state.data).toEqual({});
		});
	});

	describe('applyAction', () => {
		test('START_PROCESS 应将状态改为 running 并添加 tokens', () => {
			const state = createSampleState();
			const tokens = [{ id: 't1', elementId: 'start', data: {}, createdAt: new Date() }];
			const action: StateAction = {
				type: 'START_PROCESS',
				payload: { tokens, initialData: {} },
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);

			expect(newState.status).toBe('running');
			expect(newState.tokens).toHaveLength(1);
			expect(newState.tokens[0].elementId).toBe('start');
			expect(newState.history).toHaveLength(1);
		});

		test('START_PROCESS 应保留已有 startedAt', () => {
			const existingStart = new Date('2023-06-01');
			const state = { ...createSampleState(), startedAt: existingStart };
			const action: StateAction = {
				type: 'START_PROCESS',
				payload: { tokens: [] },
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);
			expect(newState.startedAt).toBe(existingStart);
		});

		test('EXECUTE_ELEMENT 应更新 data、移除 token 并添加 item', () => {
			const state: ProcessState = {
				...createSampleState(),
				status: 'running',
				tokens: [{ id: 't1', elementId: 'task1', data: {}, createdAt: new Date() }],
			};
			const item = {
				id: 'item1',
				elementId: 'task1',
				name: '任务1',
				type: 'bpmn:userTask',
				status: 'wait' as const,
				data: {},
				startedAt: new Date(),
				assignee: null,
				candidateUsers: null,
				candidateGroups: null,
			};
			const action: StateAction = {
				type: 'EXECUTE_ELEMENT',
				payload: { tokenId: 't1', newData: { result: 'ok' }, item },
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);

			expect(newState.tokens).toHaveLength(0);
			expect(newState.items).toHaveLength(1);
			expect(newState.data.result).toBe('ok');
		});

		test('EXECUTE_ELEMENT 不提供 item 时不添加 item', () => {
			const state: ProcessState = {
				...createSampleState(),
				tokens: [{ id: 't1', elementId: 'x', data: {}, createdAt: new Date() }],
			};
			const action: StateAction = {
				type: 'EXECUTE_ELEMENT',
				payload: { tokenId: 't1', newData: {} },
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);
			expect(newState.items).toHaveLength(0);
		});

		test('COMPLETE_TASK 应将对应 item 标记为 completed 并添加 nextTokens', () => {
			const state: ProcessState = {
				...createSampleState(),
				status: 'running',
				items: [{
					id: 'item1', elementId: 'task1', name: '任务1', type: 'bpmn:userTask',
					status: 'wait', data: {}, startedAt: new Date(),
					assignee: null, candidateUsers: null, candidateGroups: null,
				}],
			};
			const action: StateAction = {
				type: 'COMPLETE_TASK',
				payload: {
					itemId: 'item1',
					nextTokens: [{ id: 't2', elementId: 'end', data: {}, createdAt: new Date() }],
				},
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);

			expect(newState.items[0].status).toBe('completed');
			expect(newState.items[0].endedAt).toBeDefined();
			expect(newState.tokens).toHaveLength(1);
		});

		test('TRANSITION_TOKEN 应替换 token', () => {
			const state: ProcessState = {
				...createSampleState(),
				tokens: [{ id: 't1', elementId: 'a', data: {}, createdAt: new Date() }],
			};
			const action: StateAction = {
				type: 'TRANSITION_TOKEN',
				payload: {
					tokenId: 't1',
					newTokens: [{ id: 't2', elementId: 'b', data: {}, createdAt: new Date() }],
				},
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);

			expect(newState.tokens).toHaveLength(1);
			expect(newState.tokens[0].id).toBe('t2');
		});

		test('UPDATE_DATA 应合并数据', () => {
			const state = { ...createSampleState(), data: { a: 1 } };
			const action: StateAction = {
				type: 'UPDATE_DATA',
				payload: { data: { b: 2 } },
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);

			expect(newState.data).toEqual({ a: 1, b: 2 });
		});

		test('ERROR_OCCURRED 应在 history 中记录错误', () => {
			const state = createSampleState();
			const action: StateAction = {
				type: 'ERROR_OCCURRED',
				payload: { error: '出错了' },
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);

			expect(newState.history).toHaveLength(1);
			expect(newState.history[0].action).toBe('error');
			expect(newState.history[0].error).toBe('出错了');
		});

		test('未知 action type 应返回原状态', () => {
			const state = createSampleState();
			const action = {
				type: 'UNKNOWN_TYPE' as any,
				payload: {},
				timestamp: new Date(),
			};

			const newState = WorkflowState.applyAction(state, action);

			expect(newState.status).toBe(state.status);
		});
	});

	describe('serialize / deserialize', () => {
		test('应正确序列化和反序列化完整状态', () => {
			const now = new Date('2024-06-15T10:30:00Z');
			const state: ProcessState = {
				id: 's1',
				name: '流程A',
				status: 'running',
				createdAt: now,
				startedAt: now,
				definitionId: 'def-1',
				data: { x: 42 },
				tokens: [{ id: 't1', elementId: 'task1', data: { a: 1 }, createdAt: now }],
				items: [{
					id: 'i1', elementId: 'task1', name: '任务', type: 'bpmn:userTask',
					status: 'wait', data: {}, startedAt: now,
					assignee: null, candidateUsers: null, candidateGroups: null,
				}],
				variables: { v: 'val' },
				history: [{
					id: 'h1', elementId: 'start', elementType: 'bpmn:startEvent',
					action: 'start', timestamp: now, data: {},
				}],
			};

			const json = WorkflowState.serialize(state);
			const restored = WorkflowState.deserialize(json);

			expect(restored.id).toBe('s1');
			expect(restored.status).toBe('running');
			expect(restored.createdAt).toBeInstanceOf(Date);
			expect(restored.startedAt).toBeInstanceOf(Date);
			expect(restored.tokens[0].createdAt).toBeInstanceOf(Date);
			expect(restored.items[0].startedAt).toBeInstanceOf(Date);
			expect(restored.history[0].timestamp).toBeInstanceOf(Date);
			expect(restored.data.x).toBe(42);
		});

		test('应处理缺少可选字段的状态', () => {
			const state: ProcessState = {
				id: 's2',
				name: '流程B',
				status: 'created',
				createdAt: new Date(),
				definitionId: 'def-2',
				data: {},
				tokens: [],
				items: [],
				variables: {},
				history: [],
			};

			const json = WorkflowState.serialize(state);
			const restored = WorkflowState.deserialize(json);

			expect(restored.startedAt).toBeUndefined();
			expect(restored.endedAt).toBeUndefined();
		});

		test('应处理带 endedAt 的已完成状态', () => {
			const state: ProcessState = {
				id: 's3',
				name: '流程C',
				status: 'completed',
				createdAt: new Date('2024-01-01'),
				startedAt: new Date('2024-01-01'),
				endedAt: new Date('2024-01-02'),
				definitionId: 'def-3',
				data: {},
				tokens: [],
				items: [{
					id: 'i1', elementId: 'task', name: '完成任务', type: 'bpmn:userTask',
					status: 'completed', data: {}, startedAt: new Date('2024-01-01'),
					endedAt: new Date('2024-01-02'),
					assignee: null, candidateUsers: null, candidateGroups: null,
				}],
				variables: {},
				history: [],
			};

			const json = WorkflowState.serialize(state);
			const restored = WorkflowState.deserialize(json);

			expect(restored.endedAt).toBeInstanceOf(Date);
			expect(restored.items[0].endedAt).toBeInstanceOf(Date);
		});
	});
});
