import { describe, test, expect } from 'vitest';
import { TaskGenerator, TaskComputer } from '../../tasks/TaskGenerator.js';
import { ProcessState } from '../../state/WorkflowState.js';

function createTestState(overrides: Partial<ProcessState> = {}): ProcessState {
	return {
		id: 'inst-1',
		name: '测试流程',
		status: 'running',
		createdAt: new Date(),
		definitionId: 'proc-1',
		data: {},
		tokens: [],
		items: [],
		variables: {},
		history: [],
		...overrides,
	};
}

const makeItem = (id: string, status: 'wait' | 'completed' | 'active', type = 'bpmn:userTask') => ({
	id,
	elementId: `el-${id}`,
	name: `任务 ${id}`,
	type,
	status,
	data: {},
	startedAt: new Date(),
	assignee: null,
	candidateUsers: null,
	candidateGroups: null,
});

describe('TaskGenerator', () => {
	describe('generateTasks', () => {
		test('空 tokens 应返回空数组', () => {
			const state = createTestState({ tokens: [] });
			const tasks = TaskGenerator.generateTasks(state);
			expect(tasks).toEqual([]);
		});

		test('有 tokens 但当前实现返回 null，应返回空数组', () => {
			const state = createTestState({
				tokens: [{ id: 't1', elementId: 'task1', data: {}, createdAt: new Date() }],
			});
			const tasks = TaskGenerator.generateTasks(state);
			expect(tasks).toEqual([]);
		});

		test('多个 tokens 也应返回空数组（当前实现）', () => {
			const state = createTestState({
				tokens: [
					{ id: 't1', elementId: 'a', data: {}, createdAt: new Date() },
					{ id: 't2', elementId: 'b', data: {}, createdAt: new Date() },
				],
			});
			const tasks = TaskGenerator.generateTasks(state);
			expect(tasks).toEqual([]);
		});
	});

	describe('restorePendingTasks', () => {
		test('应返回所有 wait 状态的 items', () => {
			const state = createTestState({
				items: [
					makeItem('1', 'wait'),
					makeItem('2', 'completed'),
					makeItem('3', 'wait'),
				],
			});
			const pending = TaskGenerator.restorePendingTasks(state);
			expect(pending).toHaveLength(2);
			expect(pending[0].id).toBe('1');
			expect(pending[1].id).toBe('3');
		});

		test('应返回所有 active 状态的 items', () => {
			const state = createTestState({
				items: [makeItem('1', 'active'), makeItem('2', 'completed')],
			});
			const pending = TaskGenerator.restorePendingTasks(state);
			expect(pending).toHaveLength(1);
			expect(pending[0].status).toBe('active');
		});

		test('没有 pending 任务时返回空数组', () => {
			const state = createTestState({
				items: [makeItem('1', 'completed'), makeItem('2', 'completed')],
			});
			const pending = TaskGenerator.restorePendingTasks(state);
			expect(pending).toEqual([]);
		});

		test('空 items 返回空数组', () => {
			const state = createTestState({ items: [] });
			const pending = TaskGenerator.restorePendingTasks(state);
			expect(pending).toEqual([]);
		});
	});

	describe('generateFollowUpTasks', () => {
		test('应返回空数组（当前简化实现）', () => {
			const state = createTestState();
			const followUp = TaskGenerator.generateFollowUpTasks(state, 'task1');
			expect(followUp).toEqual([]);
		});
	});
});

describe('TaskComputer', () => {
	describe('computeCurrentTasks', () => {
		test('应返回所有 wait 和 active 状态的 items', () => {
			const state = createTestState({
				items: [
					makeItem('1', 'wait'),
					makeItem('2', 'active'),
					makeItem('3', 'completed'),
				],
			});
			const tasks = TaskComputer.computeCurrentTasks(state);
			expect(tasks).toHaveLength(2);
		});

		test('空 items 和空 tokens 返回空数组', () => {
			const state = createTestState();
			const tasks = TaskComputer.computeCurrentTasks(state);
			expect(tasks).toEqual([]);
		});

		test('不应出现重复任务', () => {
			const state = createTestState({
				items: [makeItem('1', 'wait')],
			});
			const tasks = TaskComputer.computeCurrentTasks(state);
			expect(tasks).toHaveLength(1);
		});
	});

	describe('computeDependencies', () => {
		test('应返回空 Map（当前简化实现）', () => {
			const items = [makeItem('1', 'wait'), makeItem('2', 'wait')];
			const deps = TaskComputer.computeDependencies(items);
			expect(deps).toBeInstanceOf(Map);
			expect(deps.size).toBe(0);
		});

		test('空数组应返回空 Map', () => {
			const deps = TaskComputer.computeDependencies([]);
			expect(deps.size).toBe(0);
		});
	});

	describe('computePriority', () => {
		test('startEvent 优先级应为 100', () => {
			const item = makeItem('1', 'wait', 'bpmn:startEvent');
			const state = createTestState();
			expect(TaskComputer.computePriority(item, state)).toBe(100);
		});

		test('userTask 优先级应为 50', () => {
			const item = makeItem('1', 'wait', 'bpmn:userTask');
			const state = createTestState();
			expect(TaskComputer.computePriority(item, state)).toBe(50);
		});

		test('endEvent 优先级应为 10', () => {
			const item = makeItem('1', 'wait', 'bpmn:endEvent');
			const state = createTestState();
			expect(TaskComputer.computePriority(item, state)).toBe(10);
		});

		test('未知类型优先级应为 30', () => {
			const item = makeItem('1', 'wait', 'bpmn:customType');
			const state = createTestState();
			expect(TaskComputer.computePriority(item, state)).toBe(30);
		});
	});

	describe('checkPrerequisites', () => {
		test('应返回 true（当前简化实现）', () => {
			const item = makeItem('1', 'wait');
			const state = createTestState();
			expect(TaskComputer.checkPrerequisites(item, state)).toBe(true);
		});
	});

	describe('computeCompletionPercentage', () => {
		test('空 items 应返回 0', () => {
			const state = createTestState({ items: [] });
			expect(TaskComputer.computeCompletionPercentage(state)).toBe(0);
		});

		test('全部完成应返回 100', () => {
			const state = createTestState({
				items: [makeItem('1', 'completed'), makeItem('2', 'completed')],
			});
			expect(TaskComputer.computeCompletionPercentage(state)).toBe(100);
		});

		test('一半完成应返回 50', () => {
			const state = createTestState({
				items: [makeItem('1', 'completed'), makeItem('2', 'wait')],
			});
			expect(TaskComputer.computeCompletionPercentage(state)).toBe(50);
		});

		test('全部未完成应返回 0', () => {
			const state = createTestState({
				items: [makeItem('1', 'wait'), makeItem('2', 'active')],
			});
			expect(TaskComputer.computeCompletionPercentage(state)).toBe(0);
		});

		test('3 个中完成 1 个应返回 33', () => {
			const state = createTestState({
				items: [makeItem('1', 'completed'), makeItem('2', 'wait'), makeItem('3', 'wait')],
			});
			expect(TaskComputer.computeCompletionPercentage(state)).toBe(33);
		});
	});
});
