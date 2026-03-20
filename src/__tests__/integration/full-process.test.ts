import { describe, test, expect } from 'vitest';
import Engine from '../../Engine';
import {
	simpleProcessXML,
	gatewayProcessXML,
	complexProcessXML,
	generateLargeProcess
} from '../fixtures/sample-processes';

/**
 * 端到端集成测试
 * 验证完整的流程执行链路
 */
describe('集成测试 - 完整流程执行', () => {
	describe('简单流程端到端', () => {
		test('应能完成简单审批流程', async () => {
			const engine = new Engine();

			// 1. 启动流程
			const instance = await engine.startFromXml(simpleProcessXML, {
				applicant: '张三',
				amount: 5000
			});

			expect(instance.status).toBe('wait');
			expect(instance.data.applicant).toBe('张三');

			// 2. 获取待办任务
			const items = instance.getItems();
			expect(items.length).toBe(1);
			expect(items[0].type).toBe('bpmn:userTask');

			// 3. 分配任务
			await engine.assign(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{},
				'经理'
			);

			const assignedTask = instance.getItem(items[0].elementId);
			expect(assignedTask?.assignee).toBe('经理');

			// 4. 完成任务
			await engine.invoke(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{ approved: true, comment: '同意' }
			);

			// 5. 验证流程完成
			expect(instance.status).toBe('end');
			expect(instance.endedAt).toBeDefined();
		});

		test('应支持多次启动相同流程', async () => {
			const engine = new Engine();

			// 启动多个实例
			const instance1 = await engine.startFromXml(simpleProcessXML, { id: 1 });
			const instance2 = await engine.startFromXml(simpleProcessXML, { id: 2 });
			const instance3 = await engine.startFromXml(simpleProcessXML, { id: 3 });

			// 完成第二个实例
			const items2 = instance2.getItems();
			await engine.invoke(
				{ instanceId: instance2.id, elementId: items2[0].elementId },
				{}
			);

			// 验证状态
			expect(instance1.status).toBe('wait');
			expect(instance2.status).toBe('end');
			expect(instance3.status).toBe('wait');
		});
	});

	describe('网关流程端到端', () => {
		test('应正确执行条件分支 - 批准路径', async () => {
			const engine = new Engine();

			const instance = await engine.startFromXml(gatewayProcessXML, {
				approved: true
			});

			// 应该走批准分支
			const items = instance.getItems();
			expect(items.length).toBe(1);
			expect(items[0].elementId).toBe('approvedTask');

			// 完成任务
			await engine.invoke(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{}
			);

			expect(instance.status).toBe('end');
		});

		test('应正确执行条件分支 - 拒绝路径', async () => {
			const engine = new Engine();

			const instance = await engine.startFromXml(gatewayProcessXML, {
				approved: false
			});

			// 应该走默认分支（拒绝）
			const items = instance.getItems();
			expect(items.length).toBe(1);
			expect(items[0].elementId).toBe('rejectedTask');

			// 完成任务
			await engine.invoke(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{}
			);

			expect(instance.status).toBe('end');
		});
	});

	describe('复杂流程端到端', () => {
		test('应正确执行包含多种任务类型的流程', async () => {
			const engine = new Engine();

			const instance = await engine.startFromXml(complexProcessXML, {
				requestId: 'REQ-001'
			});

			// serviceTask 和 scriptTask 应自动执行
			// 最终等待 userTask
			expect(instance.status).toBe('wait');

			const items = instance.getItems();
			expect(items.length).toBe(1);
			expect(items[0].type).toBe('bpmn:userTask');
			expect(items[0].elementId).toBe('user1');

			// 数据应传递
			expect(items[0].data.requestId).toBe('REQ-001');

			// 完成任务
			await engine.invoke(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{ decision: 'approved' }
			);

			expect(instance.status).toBe('end');
		});
	});

	describe('流程实例查询', () => {
		test('应能通过ID查询实例', async () => {
			const engine = new Engine();

			const started = await engine.startFromXml(simpleProcessXML, {});
			const retrieved = await engine.get({ id: started.id });

			expect(retrieved.id).toBe(started.id);
			expect(retrieved).toBe(started); // 应该是同一个引用
		});

		test('查询不存在的实例应抛出异常', async () => {
			const engine = new Engine();

			await expect(engine.get({ id: 'non-existent' })).rejects.toThrow();
		});
	});

	describe('任务重启场景', () => {
		test('应支持任务重启', async () => {
			const engine = new Engine();

			const instance = await engine.startFromXml(simpleProcessXML, { version: 1 });

			// 完成任务
			const items = instance.getItems();
			await engine.invoke(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{ first: true }
			);

			expect(instance.status).toBe('end');

			// 重启任务
			await engine.restart(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{ version: 2 }
			);

			// 流程应回到等待状态
			expect(instance.status).toBe('wait');

			// 再次完成任务
			const newItems = instance.getItems().filter(item => item.status === 'wait');
			await engine.invoke(
				{ instanceId: instance.id, elementId: newItems[0].elementId },
				{ second: true }
			);

			expect(instance.status).toBe('end');
		});
	});

	describe('性能基准测试', () => {
		test('简单流程启动应小于50ms', async () => {
			const engine = new Engine();

			const start = Date.now();
			await engine.startFromXml(simpleProcessXML, {});
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(50);
		});

		test('20节点流程执行应小于200ms', async () => {
			const engine = new Engine();
			const largeXML = generateLargeProcess(20);

			const start = Date.now();
			const instance = await engine.startFromXml(largeXML, {});
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(200);
			expect(instance).toBeDefined();
		});

		test('应支持并发实例启动', async () => {
			const engine = new Engine();

			const promises = [];
			for (let i = 0; i < 10; i++) {
				promises.push(engine.startFromXml(simpleProcessXML, { index: i }));
			}

			const instances = await Promise.all(promises);

			expect(instances.length).toBe(10);
			// 验证每个实例独立
			const ids = instances.map(i => i.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(10);
		});
	});

	describe('错误处理', () => {
		test('无效XML应返回清晰错误', async () => {
			const engine = new Engine();

			await expect(engine.startFromXml('invalid xml', {})).rejects.toThrow();
		});

		test('重复完成任务应抛出异常', async () => {
			const engine = new Engine();

			const instance = await engine.startFromXml(simpleProcessXML, {});
			const items = instance.getItems();

			// 第一次完成
			await engine.invoke(
				{ instanceId: instance.id, elementId: items[0].elementId },
				{}
			);

			// 第二次完成应该失败
			await expect(
				engine.invoke(
					{ instanceId: instance.id, elementId: items[0].elementId },
					{}
				)
			).rejects.toThrow();
		});
	});
});
