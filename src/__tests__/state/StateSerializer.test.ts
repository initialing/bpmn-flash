import { describe, test, expect } from 'vitest';
import { StateSerializer } from '../../state/StateSerializer.js';
import { ProcessState } from '../../state/WorkflowState.js';

function createSampleState(): ProcessState {
	const now = new Date('2024-06-15T10:00:00Z');
	return {
		id: 'inst-1',
		name: '序列化测试流程',
		status: 'running',
		createdAt: now,
		startedAt: now,
		definitionId: 'def-1',
		data: { amount: 100, name: '张三' },
		tokens: [
			{ id: 't1', elementId: 'task1', data: { x: 1 }, createdAt: now },
		],
		items: [
			{
				id: 'item1', elementId: 'task0', name: '初审', type: 'bpmn:userTask',
				status: 'completed', data: { approved: true },
				startedAt: now, endedAt: new Date('2024-06-15T11:00:00Z'),
				assignee: 'user1', candidateUsers: ['user1', 'user2'], candidateGroups: ['admin'],
			},
		],
		variables: { v1: 'hello', v2: 42 },
		history: [
			{
				id: 'h1', elementId: 'start', elementType: 'bpmn:startEvent',
				action: 'start', timestamp: now, data: {},
			},
			{
				id: 'h2', elementId: 'task0', elementType: 'bpmn:userTask',
				action: 'complete', timestamp: new Date('2024-06-15T11:00:00Z'),
				data: { approved: true },
			},
		],
	};
}

describe('StateSerializer', () => {
	describe('serialize / deserialize', () => {
		test('应正确序列化和反序列化完整状态', () => {
			const state = createSampleState();
			const json = StateSerializer.serialize(state);
			const restored = StateSerializer.deserialize(json);

			expect(restored.id).toBe('inst-1');
			expect(restored.name).toBe('序列化测试流程');
			expect(restored.status).toBe('running');
			expect(restored.createdAt).toBeInstanceOf(Date);
			expect(restored.startedAt).toBeInstanceOf(Date);
			expect(restored.data.amount).toBe(100);
			expect(restored.tokens).toHaveLength(1);
			expect(restored.tokens[0].createdAt).toBeInstanceOf(Date);
			expect(restored.items).toHaveLength(1);
			expect(restored.items[0].startedAt).toBeInstanceOf(Date);
			expect(restored.items[0].endedAt).toBeInstanceOf(Date);
			expect(restored.history).toHaveLength(2);
			expect(restored.history[0].timestamp).toBeInstanceOf(Date);
		});

		test('应处理缺少可选日期字段的状态', () => {
			const state: ProcessState = {
				id: 'inst-2',
				name: '空流程',
				status: 'created',
				createdAt: new Date(),
				definitionId: 'def-2',
				data: {},
				tokens: [],
				items: [],
				variables: {},
				history: [],
			};

			const json = StateSerializer.serialize(state);
			const restored = StateSerializer.deserialize(json);

			expect(restored.startedAt).toBeUndefined();
			expect(restored.endedAt).toBeUndefined();
		});

		test('序列化结果应为合法 JSON 字符串', () => {
			const state = createSampleState();
			const json = StateSerializer.serialize(state);

			expect(() => JSON.parse(json)).not.toThrow();
		});
	});

	describe('serializeToObject / deserializeFromObject', () => {
		test('应正确转换为对象并恢复', () => {
			const state = createSampleState();
			const obj = StateSerializer.serializeToObject(state);

			expect(typeof obj.createdAt).toBe('string');
			expect(typeof obj.tokens[0].createdAt).toBe('string');

			const restored = StateSerializer.deserializeFromObject(obj);

			expect(restored.createdAt).toBeInstanceOf(Date);
			expect(restored.tokens[0].createdAt).toBeInstanceOf(Date);
			expect(restored.id).toBe(state.id);
		});

		test('对象格式中 null 日期应正确恢复为 undefined', () => {
			const state: ProcessState = {
				id: 'inst-3',
				name: '测试',
				status: 'created',
				createdAt: new Date(),
				definitionId: 'def-3',
				data: {},
				tokens: [],
				items: [],
				variables: {},
				history: [],
			};

			const obj = StateSerializer.serializeToObject(state);
			expect(obj.startedAt).toBeNull();
			expect(obj.endedAt).toBeNull();

			const restored = StateSerializer.deserializeFromObject(obj);
			expect(restored.startedAt).toBeUndefined();
			expect(restored.endedAt).toBeUndefined();
		});
	});

	describe('serializeCompressed / deserializeCompressed', () => {
		test('应正确压缩序列化和反序列化', () => {
			const state = createSampleState();
			const compressed = StateSerializer.serializeCompressed(state);
			const restored = StateSerializer.deserializeCompressed(compressed);

			expect(restored.id).toBe('inst-1');
			expect(restored.name).toBe('序列化测试流程');
			expect(restored.status).toBe('running');
			expect(restored.createdAt).toBeInstanceOf(Date);
			expect(restored.data.amount).toBe(100);
			expect(restored.tokens).toHaveLength(1);
			expect(restored.tokens[0].elementId).toBe('task1');
			expect(restored.items).toHaveLength(1);
			expect(restored.items[0].assignee).toBe('user1');
			expect(restored.items[0].candidateUsers).toEqual(['user1', 'user2']);
			expect(restored.history).toHaveLength(2);
		});

		test('压缩格式应比标准格式更小', () => {
			const state = createSampleState();
			const standard = StateSerializer.serialize(state);
			const compressed = StateSerializer.serializeCompressed(state);

			expect(compressed.length).toBeLessThan(standard.length);
		});

		test('压缩格式应处理缺少可选字段', () => {
			const state: ProcessState = {
				id: 'inst-4',
				name: '简单',
				status: 'created',
				createdAt: new Date(),
				definitionId: 'def-4',
				data: {},
				tokens: [],
				items: [],
				variables: {},
				history: [],
			};

			const compressed = StateSerializer.serializeCompressed(state);
			const restored = StateSerializer.deserializeCompressed(compressed);

			expect(restored.id).toBe('inst-4');
			expect(restored.startedAt).toBeUndefined();
			expect(restored.endedAt).toBeUndefined();
		});

		test('压缩格式应处理含 endedAt 的 item', () => {
			const state = createSampleState();
			const compressed = StateSerializer.serializeCompressed(state);
			const restored = StateSerializer.deserializeCompressed(compressed);

			expect(restored.items[0].endedAt).toBeInstanceOf(Date);
		});

		test('压缩格式应保留 history 中的 error 字段', () => {
			const state: ProcessState = {
				...createSampleState(),
				history: [{
					id: 'h-err', elementId: 'task1', elementType: 'bpmn:userTask',
					action: 'error', timestamp: new Date(), error: '执行失败',
				}],
			};

			const compressed = StateSerializer.serializeCompressed(state);
			const restored = StateSerializer.deserializeCompressed(compressed);

			expect(restored.history[0].action).toBe('error');
			expect(restored.history[0].error).toBe('执行失败');
		});
	});
});
