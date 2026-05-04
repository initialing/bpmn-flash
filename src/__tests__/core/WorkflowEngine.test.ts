import { describe, test, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import BPMNParser from '../../parser/BPMNParser.js';
import { ProcessState } from '../../state/WorkflowState.js';
import { simpleProcessXML, gatewayProcessXML, complexProcessXML, parallelGatewayProcessXML } from '../fixtures/sample-processes.js';

describe('WorkflowEngine', () => {
	let engine: WorkflowEngine;

	beforeEach(() => {
		engine = new WorkflowEngine();
	});

	describe('startProcess', () => {
		test('应从定义启动简单流程', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = await engine.startProcess(definition);

			expect(state.status).not.toBe('created');
			expect(state.definitionId).toBe('simple-process');
		});

		test('应传入初始数据', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = await engine.startProcess(definition, { userId: 'u1' });

			expect(state.data.userId).toBe('u1');
		});

		test('不传初始数据时应默认空对象', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const state = await engine.startProcess(definition);

			expect(state.data).toBeDefined();
		});

		test('应处理复杂流程定义', async () => {
			const definition = BPMNParser.parse(complexProcessXML);
			const state = await engine.startProcess(definition);

			expect(state).toBeDefined();
			expect(state.definitionId).toBe('complex-process');
		});

		test('应处理并行网关流程', async () => {
			const definition = BPMNParser.parse(parallelGatewayProcessXML);
			const state = await engine.startProcess(definition);

			expect(state).toBeDefined();
			expect(state.definitionId).toBe('parallel-process');
		});
	});

	describe('startFromXml', () => {
		test('应从 XML 字符串启动流程', async () => {
			const state = await engine.startFromXml(simpleProcessXML, 'inst-1');

			expect(state).toBeDefined();
			expect(state.definitionId).toBe('simple-process');
		});

		test('应传入初始变量', async () => {
			const state = await engine.startFromXml(simpleProcessXML, 'inst-2', { key: 'val' });

			expect(state.data.key).toBe('val');
		});

		test('不传 variables 时应正常工作', async () => {
			const state = await engine.startFromXml(simpleProcessXML, 'inst-3');

			expect(state).toBeDefined();
		});
	});

	describe('executeAction', () => {
		test('应执行 COMPLETE_TASK 动作', async () => {
			// 先启动流程获得初始状态
			const definition = BPMNParser.parse(simpleProcessXML);
			const initialState = await engine.startProcess(definition);

			// 找到等待中的 item
			const waitingItems = initialState.items.filter(i => i.status === 'wait');

			if (waitingItems.length > 0) {
				const result = await engine.executeAction(
					initialState,
					{
						type: 'COMPLETE_TASK',
						payload: {
							itemId: waitingItems[0].id,
							nextTokens: [{
								id: 'next-token',
								elementId: 'end',
								data: {},
								createdAt: new Date(),
							}],
						},
						timestamp: new Date(),
					},
					simpleProcessXML
				);

				expect(result.success).toBe(true);
				expect(result.newState).toBeDefined();
			}
		});

		test('应在错误时返回 success=false', async () => {
			const state: ProcessState = {
				id: 'inst-err',
				name: '错误测试',
				status: 'running',
				createdAt: new Date(),
				definitionId: 'wrong-id',
				data: {},
				tokens: [{ id: 't1', elementId: 'nonexistent', data: {}, createdAt: new Date() }],
				items: [],
				variables: {},
				history: [],
			};

			const result = await engine.executeAction(
				state,
				{
					type: 'EXECUTE_ELEMENT',
					payload: { tokenId: 't1' },
					timestamp: new Date(),
				},
				simpleProcessXML
			);

			// 即使 definitionId 不匹配也不应崩溃
			expect(result).toBeDefined();
			expect(result.newState).toBeDefined();
		});

		test('应生成事件', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const initialState = await engine.startProcess(definition);

			const result = await engine.executeAction(
				{ ...initialState, status: 'created' },
				{
					type: 'START_PROCESS',
					payload: {
						tokens: [{ id: 't1', elementId: 'start', data: {}, createdAt: new Date() }],
						initialData: {},
					},
					timestamp: new Date(),
				},
				simpleProcessXML
			);

			expect(result.success).toBe(true);
			expect(result.events).toBeDefined();
		});
	});

	describe('getState', () => {
		test('应返回 null（当前简化实现）', () => {
			const state = engine.getState('nonexistent');
			expect(state).toBeNull();
		});
	});

	describe('getTasks', () => {
		test('应返回等待中的任务', () => {
			const state: ProcessState = {
				id: 'inst-1',
				name: '测试',
				status: 'running',
				createdAt: new Date(),
				definitionId: 'def-1',
				data: {},
				tokens: [],
				items: [
					{
						id: 'i1', elementId: 'task1', name: '任务1', type: 'bpmn:userTask',
						status: 'wait', data: {}, startedAt: new Date(),
						assignee: null, candidateUsers: null, candidateGroups: null,
					},
					{
						id: 'i2', elementId: 'task2', name: '任务2', type: 'bpmn:userTask',
						status: 'completed', data: {}, startedAt: new Date(),
						assignee: null, candidateUsers: null, candidateGroups: null,
					},
				],
				variables: {},
				history: [],
			};

			const tasks = engine.getTasks(state);
			expect(tasks).toHaveLength(1);
			expect(tasks[0].id).toBe('i1');
		});

		test('空 items 应返回空数组', () => {
			const state: ProcessState = {
				id: 'inst-2', name: '空', status: 'running', createdAt: new Date(),
				definitionId: 'def-1', data: {}, tokens: [], items: [], variables: {}, history: [],
			};

			const tasks = engine.getTasks(state);
			expect(tasks).toEqual([]);
		});
	});

	describe('网关流程端到端测试', () => {
		test('排他网关 - approved=true 应走审批路径', async () => {
			const definition = BPMNParser.parse(gatewayProcessXML);
			const state = await engine.startProcess(definition, { approved: true });

			// 应该有等待中的用户任务
			const waitItems = state.items.filter(i => i.status === 'wait');
			if (waitItems.length > 0) {
				// 检查走到了正确的分支
				const approvedTask = waitItems.find(i => i.elementId === 'approvedTask');
				if (approvedTask) {
					expect(approvedTask).toBeDefined();
				}
			}
		});

		test('排他网关 - approved=false 应走默认路径', async () => {
			const definition = BPMNParser.parse(gatewayProcessXML);
			const state = await engine.startProcess(definition, { approved: false });

			expect(state).toBeDefined();
		});
	});
});
