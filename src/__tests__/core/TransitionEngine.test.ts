import { describe, test, expect, beforeEach } from 'vitest';
import { TransitionEngine } from '../../core/TransitionEngine.js';
import { ProcessState } from '../../state/WorkflowState.js';

describe('TransitionEngine', () => {
	let engine: TransitionEngine;

	beforeEach(() => {
		engine = new TransitionEngine();
	});

	const createInitialState = (): ProcessState => ({
		status: 'created',
		data: {},
		tokens: [],
		items: [],
		history: [],
	});

	describe('validateTransition', () => {
		test('应允许从 created 状态启动流程', () => {
			const state = createInitialState();
			const action = { type: 'START_PROCESS', payload: {} };

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});

		test('应允许完成任务当任务存在且处于可完成状态', () => {
			const state: ProcessState = {
				...createInitialState(),
				status: 'running',
				items: [
					{
						id: 'task1',
						elementId: 'element1',
						name: 'Task 1',
						type: 'bpmn:userTask',
						status: 'wait',
						data: {},
						startedAt: new Date(),
						assignee: null,
						candidateUsers: null,
						candidateGroups: null,
					},
				],
			};
			const action = {
				type: 'COMPLETE_TASK',
				payload: { taskId: 'task1' },
			};

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});

		test('应允许完成任务当任务处于 active 状态', () => {
			const state: ProcessState = {
				...createInitialState(),
				status: 'running',
				items: [
					{
						id: 'task1',
						elementId: 'element1',
						name: 'Task 1',
						type: 'bpmn:userTask',
						status: 'active',
						data: {},
						startedAt: new Date(),
						assignee: null,
						candidateUsers: null,
						candidateGroups: null,
					},
				],
			};
			const action = {
				type: 'COMPLETE_TASK',
				payload: { taskId: 'task1' },
			};

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});

		test('应拒绝完成不存在的任务', () => {
			const state = createInitialState();
			const action = {
				type: 'COMPLETE_TASK',
				payload: { taskId: 'nonexistent' },
			};

			const result = engine.validateTransition(state, action);

			expect(result).toBe(false); // 任务不存在，应该拒绝
		});

		test('应允许执行元素', () => {
			const state = createInitialState();
			const action = { type: 'EXECUTE_ELEMENT', payload: {} };

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});

		test('应允许更新数据', () => {
			const state = createInitialState();
			const action = { type: 'UPDATE_DATA', payload: {} };

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});

		test('应允许令牌转换当令牌存在', () => {
			const state: ProcessState = {
				...createInitialState(),
				tokens: [{ id: 'token1', elementId: 'element1', data: {} }],
			};
			const action = {
				type: 'TRANSITION_TOKEN',
				payload: { tokenId: 'token1' },
			};

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});

		test('应允许错误发生', () => {
			const state = createInitialState();
			const action = { type: 'ERROR_OCCURRED', payload: {} };

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});

		test('应允许所有未明确定义的动作', () => {
			const state = createInitialState();
			const action = { type: 'UNKNOWN_ACTION', payload: {} };

			const result = engine.validateTransition(state, action);

			expect(result).toBe(true);
		});
	});

	describe('applyTransition', () => {
		test('应抛出错误当转换无效时', () => {
			const state: ProcessState = {
				...createInitialState(),
				status: 'running',
			};
			const action = { type: 'START_PROCESS', payload: {} };

			expect(() => {
				engine.applyTransition(state, action);
			}).toThrow('Invalid transition');
		});

		test('应应用有效的状态转换', () => {
			const state = createInitialState();
			const action = {
				type: 'START_PROCESS',
				payload: {
					tokens: [{ id: 'token1', elementId: 'start', data: {} }],
					initialData: { x: 10 },
				},
			};

			const result = engine.applyTransition(state, action);

			expect(result.status).toBe('running');
			expect(result.tokens).toHaveLength(1);
			expect(result.data.x).toBe(10);
		});
	});

	describe('状态转换场景', () => {
		test('应支持完整的流程执行周期', () => {
			// 1. 创建流程
			let state = createInitialState();
			expect(state.status).toBe('created');

			// 2. 启动流程
			state = engine.applyTransition(state, {
				type: 'START_PROCESS',
				payload: {
					tokens: [{ id: 'token1', elementId: 'start', data: {} }],
					initialData: {},
				},
			});
			expect(state.status).toBe('running');
			expect(state.tokens).toHaveLength(1);

			// 3. 执行元素
			state = engine.applyTransition(state, {
				type: 'EXECUTE_ELEMENT',
				payload: {
					tokenId: 'token1',
					newData: { x: 10 },
					item: {
						id: 'item1',
						elementId: 'task1',
						name: 'Task 1',
						type: 'bpmn:userTask',
						status: 'wait',
						data: {},
						startedAt: new Date(),
						assignee: null,
						candidateUsers: null,
						candidateGroups: null,
					},
				},
			});
			expect(state.data.x).toBe(10);
			expect(state.items).toHaveLength(1);

			// 4. 完成任务
			state = engine.applyTransition(state, {
				type: 'COMPLETE_TASK',
				payload: {
					itemId: 'item1',
					nextTokens: [
						{ id: 'token2', elementId: 'end', data: {} },
					],
				},
			});
			expect(state.items[0].status).toBe('completed');
			expect(state.tokens).toHaveLength(1);
			expect(state.tokens[0].elementId).toBe('end');
		});
	});
});
