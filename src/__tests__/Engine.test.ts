import { describe, test, expect, beforeEach } from 'vitest';
import Engine from '../Engine';
import { simpleProcessXML, gatewayProcessXML, complexProcessXML } from './fixtures/sample-processes';

describe('Engine', () => {
	let engine: Engine;

	beforeEach(() => {
		engine = new Engine();
	});

	describe('startFromXml - 从XML启动流程', () => {
		test('E001: 应能从XML字符串启动流程', async () => {
			const result = await engine.startFromXml(simpleProcessXML, {});

			expect(result).toBeDefined();
			expect(result.id).toBeDefined();
			expect(result.name).toBe('简单流程');
			expect(result.status).toBe('wait'); // 用户任务会进入等待状态
		});

		test('E002: 启动时应能传入初始数据', async () => {
			const initialData = { applicant: '张三', amount: 1000 };
			const result = await engine.startFromXml(simpleProcessXML, initialData);

			expect(result.data).toEqual(initialData);
		});

		test('E003: 启动复杂流程应正确解析所有元素', async () => {
			const result = await engine.startFromXml(complexProcessXML, {});

			expect(result).toBeDefined();
			expect(result.name).toBe('复杂流程');
		});

		test('应处理无效XML', async () => {
			const invalidXML = '<invalid>';
			await expect(engine.startFromXml(invalidXML, {})).rejects.toThrow();
		});
	});

	describe('start - 从已解析定义启动', () => {
		test('E002: 应先解析流程定义再启动', async () => {
			// 首先通过 startFromXml 解析并存储定义
			await engine.startFromXml(simpleProcessXML, {});

			// 然后使用相同名称启动新实例
			const result = await engine.start('简单流程', {});

			expect(result).toBeDefined();
			expect(result.name).toBe('简单流程');
		});

		test('E004: 启动不存在的流程定义应抛出异常', async () => {
			await expect(engine.start('non-existent-process', {})).rejects.toThrow('流程定义');
		});

		test('多次启动应创建独立实例', async () => {
			await engine.startFromXml(simpleProcessXML, {});

			const instance1 = await engine.start('简单流程', { id: 1 });
			const instance2 = await engine.start('简单流程', { id: 2 });

			expect(instance1.id).not.toBe(instance2.id);
			expect(instance1.data).toEqual({ id: 1 });
			expect(instance2.data).toEqual({ id: 2 });
		});
	});

	describe('get - 获取流程实例', () => {
		test('E005: 应能通过ID获取流程实例', async () => {
			const started = await engine.startFromXml(simpleProcessXML, {});
			const retrieved = await engine.get({ id: started.id });

			expect(retrieved).toBeDefined();
			expect(retrieved.id).toBe(started.id);
		});

		test('E006: 获取不存在的实例应抛出异常', async () => {
			await expect(engine.get({ id: 'non-existent-id' })).rejects.toThrow('未找到流程实例');
		});

		test('获取实例应返回相同引用', async () => {
			const started = await engine.startFromXml(simpleProcessXML, {});
			const retrieved1 = await engine.get({ id: started.id });
			const retrieved2 = await engine.get({ id: started.id });

			// 应该是同一个实例对象
			expect(retrieved1).toBe(retrieved2);
		});
	});

	describe('invoke - 调用任务', () => {
		test('E007: 应能完成用户任务并继续流程', async () => {
			const instance = await engine.startFromXml(simpleProcessXML, {});
			const items = instance.getItems();
			const userTask = items.find(item => item.type === 'bpmn:userTask');

			expect(userTask).toBeDefined();
			expect(userTask?.status).toBe('wait');

			// 完成任务
			await engine.invoke(
				{ instanceId: instance.id, elementId: userTask!.elementId },
				{ approved: true }
			);

			// 流程应该已完成
			expect(instance.status).toBe('end');
		});

		test('E008: 调用不存在的任务应抛出异常', async () => {
			const instance = await engine.startFromXml(simpleProcessXML, {});

			await expect(
				engine.invoke(
					{ instanceId: instance.id, elementId: 'non-existent-task' },
					{}
				)
			).rejects.toThrow('未找到');
		});

		test('invoke应更新任务数据', async () => {
			const instance = await engine.startFromXml(simpleProcessXML, {});
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');

			const completeData = { decision: 'approved', comment: '同意' };
			await engine.invoke(
				{ instanceId: instance.id, elementId: userTask!.elementId },
				completeData
			);

			// 检查任务数据是否更新
			const updatedTask = instance.getItem(userTask!.elementId);
			expect(updatedTask?.data).toMatchObject(completeData);
		});
	});

	describe('assign - 分配任务', () => {
		test('E009: 应能分配任务给指定用户', async () => {
			const instance = await engine.startFromXml(simpleProcessXML, {});
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');

			await engine.assign(
				{ instanceId: instance.id, elementId: userTask!.elementId },
				{},
				'张三'
			);

			const updatedTask = instance.getItem(userTask!.elementId);
			expect(updatedTask?.assignee).toBe('张三');
		});

		test('E010: 应能分配任务候选用户和组', async () => {
			const instance = await engine.startFromXml(simpleProcessXML, {});
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');

			await engine.assign(
				{ instanceId: instance.id, elementId: userTask!.elementId },
				{},
				{
					assignee: '经理',
					candidateUsers: ['张三', '李四'],
					candidateGroups: ['审批组']
				}
			);

			const updatedTask = instance.getItem(userTask!.elementId);
			expect(updatedTask?.assignee).toBe('经理');
			expect(updatedTask?.candidateUsers).toContain('张三');
			expect(updatedTask?.candidateGroups).toContain('审批组');
		});
	});

	describe('startEvent - 启动事件', () => {
		test('E011: 应能通过startEvent触发流程', async () => {
			const instance = await engine.startFromXml(simpleProcessXML, {});

			// 注意：startEvent通常在启动时自动触发
			// 此方法用于手动触发额外的起始事件（如消息启动）
			const result = await engine.startEvent(instance.id, 'start', { triggerData: true });

			expect(result).toBeDefined();
		});
	});

	describe('restart - 重启任务', () => {
		test('E012: 应能重启已完成任务', async () => {
			const instance = await engine.startFromXml(simpleProcessXML, {});
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');

			// 先完成任务
			await engine.invoke(
				{ instanceId: instance.id, elementId: userTask!.elementId },
				{}
			);

			// 重启任务
			await engine.restart(
				{ instanceId: instance.id, elementId: userTask!.elementId },
				{ restartData: true }
			);

			const restartedTask = instance.getItem(userTask!.elementId);
			expect(restartedTask?.status).toBe('wait');
		});
	});

	describe('多实例管理', () => {
		test('E013: 应能管理多个流程实例', async () => {
			const instance1 = await engine.startFromXml(simpleProcessXML, { instance: 1 });
			const instance2 = await engine.startFromXml(simpleProcessXML, { instance: 2 });
			const instance3 = await engine.startFromXml(simpleProcessXML, { instance: 3 });

			// 验证每个实例独立
			const retrieved1 = await engine.get({ id: instance1.id });
			const retrieved2 = await engine.get({ id: instance2.id });
			const retrieved3 = await engine.get({ id: instance3.id });

			expect(retrieved1.data).toEqual({ instance: 1 });
			expect(retrieved2.data).toEqual({ instance: 2 });
			expect(retrieved3.data).toEqual({ instance: 3 });
		});

		test('E014: 实例间应相互隔离', async () => {
			const instance1 = await engine.startFromXml(simpleProcessXML, { value: 1 });
			const instance2 = await engine.startFromXml(simpleProcessXML, { value: 2 });

			// 完成第一个实例的任务
			const task1 = instance1.getItems().find(item => item.type === 'bpmn:userTask');
			await engine.invoke(
				{ instanceId: instance1.id, elementId: task1!.elementId },
				{ completed: true }
			);

			// 第二个实例应保持不变
			expect(instance1.status).toBe('end');
			expect(instance2.status).toBe('wait');
		});
	});
});
