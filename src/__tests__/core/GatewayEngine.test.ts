import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import type { EngineHooks, NodeContext } from '../../types/index.js';

// ==================== BPMN XML 模板 ====================

/** 排他网关 — 带条件分支和默认分支 */
const EXCLUSIVE_GATEWAY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="gateway-process" name="网关流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" name="金额判断" default="Flow_3">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="UserTask_1" name="经理审批">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="UserTask_2" name="自动通过">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:incoming>Flow_5</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Gateway_1" targetRef="UserTask_1">
      <bpmn:conditionExpression>\${amount > 500}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="UserTask_2" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="UserTask_1" targetRef="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="UserTask_2" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

/** 排他网关 — 单出口 */
const EXCLUSIVE_GATEWAY_SINGLE_EXIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="single-exit-process" name="单出口网关流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" name="单出口网关">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Gateway_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

/** 并行网关 — 分裂与汇聚 */
const PARALLEL_GATEWAY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="parallel-process" name="并行网关流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:parallelGateway id="Fork_1" name="并行分裂">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:parallelGateway>
    <bpmn:userTask id="TaskA" name="任务A">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="TaskB" name="任务B">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:parallelGateway id="Join_1" name="并行汇聚">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:parallelGateway>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_6</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Fork_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Fork_1" targetRef="TaskA" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Fork_1" targetRef="TaskB" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="TaskA" targetRef="Join_1" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="TaskB" targetRef="Join_1" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Join_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

// ==================== 测试用例 ====================

describe('GatewayEngine — 网关测试', () => {

  describe('排他网关 — 条件匹配', () => {
    it('amount > 500 走经理审批分支', async () => {
      const pausedElements: string[] = [];

      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((ctx: NodeContext) => {
          if (ctx.element.type === 'bpmn:userTask') {
            pausedElements.push(ctx.element.id);
            ctx.pause();
          }
        }),
      };

      const engine = new WorkflowEngine(hooks);
      const state = await engine.startProcess(EXCLUSIVE_GATEWAY_XML, { amount: 1000 });

      // amount=1000 > 500，应该走 UserTask_1（经理审批）
      const waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('UserTask_1');
      expect(pausedElements).toContain('UserTask_1');
      expect(pausedElements).not.toContain('UserTask_2');
    });
  });

  describe('排他网关 — 默认分支', () => {
    it('无条件匹配时走默认分支', async () => {
      const pausedElements: string[] = [];

      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((ctx: NodeContext) => {
          if (ctx.element.type === 'bpmn:userTask') {
            pausedElements.push(ctx.element.id);
            ctx.pause();
          }
        }),
      };

      const engine = new WorkflowEngine(hooks);
      // amount=100 <= 500，不满足条件，走默认分支 Flow_3 → UserTask_2
      const state = await engine.startProcess(EXCLUSIVE_GATEWAY_XML, { amount: 100 });

      const waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('UserTask_2');
      expect(pausedElements).toContain('UserTask_2');
      expect(pausedElements).not.toContain('UserTask_1');
    });
  });

  describe('排他网关 — 单出口', () => {
    it('只有一个出口时直接通过', async () => {
      const engine = new WorkflowEngine();
      const state = await engine.startProcess(EXCLUSIVE_GATEWAY_SINGLE_EXIT_XML);

      // 单出口网关，直接通过到 EndEvent
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
    });
  });

  describe('并行网关 — 分裂', () => {
    it('一个 token 变成多个（每个出口一个）', async () => {
      const enteredElements: string[] = [];

      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((ctx: NodeContext) => {
          enteredElements.push(ctx.element.id);
          if (ctx.element.type === 'bpmn:userTask') {
            ctx.pause();
          }
        }),
      };

      const engine = new WorkflowEngine(hooks);
      const state = await engine.startProcess(PARALLEL_GATEWAY_XML);

      // 并行分裂后，应该有两个 wait Item（TaskA 和 TaskB）
      const waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(2);

      const waitingElementIds = waitingItems.map((item) => item.elementId).sort();
      expect(waitingElementIds).toEqual(['TaskA', 'TaskB']);

      // 验证 TaskA 和 TaskB 都被进入
      expect(enteredElements).toContain('TaskA');
      expect(enteredElements).toContain('TaskB');
    });
  });

  describe('并行网关 — 汇聚', () => {
    it('多个 token 汇聚为一个，流程继续到 EndEvent', async () => {
      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((ctx: NodeContext) => {
          if (ctx.element.type === 'bpmn:userTask') {
            ctx.pause();
          }
        }),
      };

      const engine = new WorkflowEngine(hooks);
      let state = await engine.startProcess(PARALLEL_GATEWAY_XML);

      // 两个并行任务
      let waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(2);

      // resume TaskA
      const taskAItem = waitingItems.find((item) => item.elementId === 'TaskA');
      expect(taskAItem).toBeDefined();
      state = await engine.resume(state, taskAItem!.id, { a: 'done' }, PARALLEL_GATEWAY_XML);

      // TaskA 完成后，TaskB 仍在等待，流程不应完成（等待汇聚）
      waitingItems = engine.getWaitingItems(state);
      // 至少 TaskB 还在等待
      const taskBItem = waitingItems.find((item) => item.elementId === 'TaskB');
      expect(taskBItem).toBeDefined();
      expect(state.status).not.toBe('completed');

      // resume TaskB
      state = await engine.resume(state, taskBItem!.id, { b: 'done' }, PARALLEL_GATEWAY_XML);

      // 两个都完成后，汇聚网关合并，流程走到 EndEvent 完成
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
    });
  });
});
