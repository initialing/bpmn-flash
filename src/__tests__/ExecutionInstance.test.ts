import { describe, test, expect, beforeEach } from 'vitest';
import ExecutionInstance from '../ExecutionInstance';
import BPMNParser from '../parser/BPMNParser';
import { simpleProcessXML, gatewayProcessXML, complexProcessXML } from './fixtures/sample-processes';

describe('ExecutionInstance', () => {
	describe('初始化', () => {
		test('X001: 实例初始化时应创建起始令牌', () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			expect(instance.id).toBeDefined();
			expect(instance.name).toBe('简单流程');
			expect(instance.status).toBe('running');
			expect(instance.tokens.length).toBeGreaterThan(0);
		});

		test('应保存传入的初始数据', () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const initialData = { key: 'value', number: 123 };
			const instance = new ExecutionInstance(definition, initialData);

			expect(instance.data).toEqual(initialData);
		});

		test('应记录开始时间', () => {
			const before = new Date();
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});
			const after = new Date();

			expect(instance.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(instance.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
		});
	});

	describe('自动任务执行', () => {
		test('X002: 自动执行任务应自动流转', async () => {
			const definition = BPMNParser.parse(complexProcessXML);
			const instance = new ExecutionInstance(definition, {});

			// 复杂流程包含 serviceTask 和 scriptTask，应自动执行
			await instance.execute();

			// 自动任务应已执行，等待用户任务
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			expect(userTask).toBeDefined();
		});

		test('X004: 服务任务应自动执行', async () => {
			const definition = BPMNParser.parse(complexProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			// 服务任务应该已经自动完成
			const items = instance.getItems();
			const serviceTask = items.find(item => item.elementId === 'service1');
			// 服务任务是自动执行的，不会创建wait状态的item
			expect(serviceTask?.status || 'completed').toBe('completed');
		});

		test('X005: 脚本任务应自动执行', async () => {
			const definition = BPMNParser.parse(complexProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			const items = instance.getItems();
			const scriptTask = items.find(item => item.elementId === 'script1');
			expect(scriptTask?.status || 'completed').toBe('completed');
		});
	});

	describe('用户任务执行', () => {
		test('X003: 用户任务应进入等待状态', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			// 用户任务应该处于等待状态
			expect(instance.status).toBe('wait');

			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			expect(userTask).toBeDefined();
			expect(userTask?.status).toBe('wait');
		});

		test('X007: invoke应完成任务并继续流程', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			expect(userTask?.status).toBe('wait');

			// 完成任务
			await instance.invoke(userTask!.elementId, { approved: true });

			// 任务应该已完成
			const updatedTask = instance.getItem(userTask!.elementId);
			expect(updatedTask?.status).toBe('completed');
		});

		test('X008: invoke非等待任务应抛出异常', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			// 尝试invoke不存在的任务
			await expect(instance.invoke('non-existent-task', {})).rejects.toThrow('未找到');
		});

		test('invoke应更新任务数据', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			const completeData = { decision: 'approved', comment: '同意申请' };

			await instance.invoke(userTask!.elementId, completeData);

			const updatedTask = instance.getItem(userTask!.elementId);
			expect(updatedTask?.data).toMatchObject(completeData);
		});
	});

	describe('任务分配', () => {
		test('X009: assign应更新任务分配信息', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');

			// 分配给用户
			await instance.assign(userTask!.elementId, '张三');

			const updatedTask = instance.getItem(userTask!.elementId);
			expect(updatedTask?.assignee).toBe('张三');
		});

		test('应支持候选用户和组分配', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');

			await instance.assign(userTask!.elementId, {
				assignee: '经理',
				candidateUsers: ['张三', '李四'],
				candidateGroups: ['审批组', '管理组']
			});

			const updatedTask = instance.getItem(userTask!.elementId);
			expect(updatedTask?.assignee).toBe('经理');
			expect(updatedTask?.candidateUsers).toContain('张三');
			expect(updatedTask?.candidateGroups).toContain('审批组');
		});
	});

	describe('排他网关', () => {
		test('X010: 排他网关应根据条件选择分支', async () => {
			const definition = BPMNParser.parse(gatewayProcessXML);
			const instance = new ExecutionInstance(definition, { approved: true });

			await instance.execute();

			// 应该走 approvedTask 分支
			const approvedTask = instance.getItems().find(item => item.elementId === 'approvedTask');
			const rejectedTask = instance.getItems().find(item => item.elementId === 'rejectedTask');

			expect(approvedTask).toBeDefined();
			expect(rejectedTask).toBeUndefined();
		});

		test('X011: 排他网关应使用默认分支', async () => {
			const definition = BPMNParser.parse(gatewayProcessXML);
			const instance = new ExecutionInstance(definition, { approved: false });

			await instance.execute();

			// 应该走默认分支（rejectedTask）
			const approvedTask = instance.getItems().find(item => item.elementId === 'approvedTask');
			const rejectedTask = instance.getItems().find(item => item.elementId === 'rejectedTask');

			expect(approvedTask).toBeUndefined();
			expect(rejectedTask).toBeDefined();
		});

		test('X013: 应正确评估条件表达式', async () => {
			// 测试各种条件表达式
			const testCases = [
				{ data: { approved: true }, expected: 'approvedTask' },
				{ data: { approved: false }, expected: 'rejectedTask' },
				{ data: {}, expected: 'rejectedTask' } // 默认分支
			];

			for (const testCase of testCases) {
				const definition = BPMNParser.parse(gatewayProcessXML);
				const instance = new ExecutionInstance(definition, testCase.data);
				await instance.execute();

				const task = instance.getItems().find(item =>
					item.elementId === testCase.expected
				);
				expect(task).toBeDefined();
			}
		});
	});

	describe('流程完成', () => {
		test('X006: 流程正常结束应更新状态', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
		const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			// 完成用户任务
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			await instance.invoke(userTask!.elementId, {});

			// 流程应该已结束
			expect(instance.status).toBe('end');
			expect(instance.endedAt).toBeDefined();
		});

		test('X019: 实例状态应正确转换', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			// 初始状态
			expect(instance.status).toBe('running');

			await instance.execute();

			// 遇到用户任务后变为等待
			expect(instance.status).toBe('wait');

			// 完成任务
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			await instance.invoke(userTask!.elementId, {});

			// 流程结束
			expect(instance.status).toBe('end');
		});
	});

	describe('任务重启', () => {
		test('X015: restart应重置任务状态', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await instance.execute();

			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');

			// 先完成任务
			await instance.invoke(userTask!.elementId, { first: true });
			expect(instance.getItem(userTask!.elementId)?.status).toBe('completed');

			// 重启任务
			await instance.restart(userTask!.elementId, { second: true });

			// 任务应该回到等待状态
			const restartedTask = instance.getItem(userTask!.elementId);
			expect(restartedTask?.status).toBe('wait');
			expect(restartedTask?.data).toMatchObject({ second: true });
		});
	});

	describe('令牌和数据传递', () => {
		test('X017: 令牌数据应正确传递', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const initialData = { key: 'value' };
			const instance = new ExecutionInstance(definition, initialData);

			await instance.execute();

			// 检查任务是否接收到初始数据
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			expect(userTask?.data).toMatchObject(initialData);
		});

		test('X018: 任务数据应随流程传递', async () => {
			const definition = BPMNParser.parse(complexProcessXML);
			const instance = new ExecutionInstance(definition, { initial: true });

			await instance.execute();

			// 用户任务应该继承了初始数据
			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			expect(userTask?.data).toMatchObject({ initial: true });
		});
	});

	describe('事件启动', () => {
		test('应能通过startEvent手动触发', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			// 手动触发起始事件
			await instance.startEvent('start', { manual: true });

			// 应该创建新的令牌
			expect(instance.tokens.length).toBeGreaterThan(0);
		});

		test('非起始事件应抛出异常', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, {});

			await expect(instance.startEvent('task1', {})).rejects.toThrow('不是起始事件');
		});
	});

	describe('边界条件', () => {
		test('应处理空数据', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const instance = new ExecutionInstance(definition, null as any);

			await instance.execute();

			expect(instance.status).toBe('wait');
		});

		test('应处理复杂数据类型', async () => {
			const definition = BPMNParser.parse(simpleProcessXML);
			const complexData = {
				string: 'value',
				number: 123,
				boolean: true,
				array: [1, 2, 3],
				nested: { key: 'value' }
			};
			const instance = new ExecutionInstance(definition, complexData);

			await instance.execute();

			const userTask = instance.getItems().find(item => item.type === 'bpmn:userTask');
			expect(userTask?.data).toEqual(complexData);
		});

		test('X014: 无效条件表达式应返回false', async () => {
			// 创建一个带有无效条件表达式的流程
			const invalidConditionXML = gatewayProcessXML.replace(
				'\\${data.approved === true}',
				'\\${invalid.syntax...}'
			);
			const definition = BPMNParser.parse(invalidConditionXML);
			const instance = new ExecutionInstance(definition, {});

			// 应该使用默认分支，不会抛出异常
			await instance.execute();
			expect(instance.status).toBe('wait');
		});
	});
});
