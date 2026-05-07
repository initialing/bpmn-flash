import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import type { EngineHooks, NodeContext, FlowContext } from '../../types/index.js';

// ==================== BPMN XML 模板 ====================

const SIMPLE_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="simple-process" name="简单流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const LINEAR_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="linear-process" name="直线流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="任务一">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_2" name="任务二">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const USER_TASK_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="user-task-process" name="用户任务流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="UserTask_1" name="审批任务">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="UserTask_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="UserTask_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const MIXED_TASK_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="mixed-process" name="混合任务流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="AutoTask_1" name="自动任务">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:userTask id="UserTask_1" name="人工审批">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:task id="AutoTask_2" name="自动任务2">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="AutoTask_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="AutoTask_1" targetRef="UserTask_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="UserTask_1" targetRef="AutoTask_2" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="AutoTask_2" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

// ==================== 测试用例 ====================

describe('EngineHooks — 钩子系统测试', () => {

  describe('onNodeEnter 被调用', () => {
    it('验证每个节点进入时都触发 onNodeEnter', async () => {
      const onNodeEnter = vi.fn();

      const engine = new WorkflowEngine({ onNodeEnter });
      await engine.startProcess(SIMPLE_PROCESS_XML);

      // StartEvent 和 EndEvent 都应该触发 onNodeEnter
      expect(onNodeEnter).toHaveBeenCalled();
      expect(onNodeEnter.mock.calls.length).toBeGreaterThanOrEqual(2);

      // 验证 ctx 结构
      const firstCall = onNodeEnter.mock.calls[0]![0] as NodeContext;
      expect(firstCall).toHaveProperty('token');
      expect(firstCall).toHaveProperty('element');
      expect(firstCall).toHaveProperty('state');
      expect(firstCall).toHaveProperty('definition');
      expect(firstCall).toHaveProperty('pause');
      expect(typeof firstCall.pause).toBe('function');
    });
  });

  describe('onNodeEnter 顺序', () => {
    it('验证调用顺序与流程拓扑一致', async () => {
      const enterOrder: string[] = [];

      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((ctx: NodeContext) => {
          enterOrder.push(ctx.element.id);
        }),
      };

      const engine = new WorkflowEngine(hooks);
      await engine.startProcess(LINEAR_PROCESS_XML);

      // 顺序应为: StartEvent_1 → Task_1 → Task_2 → EndEvent_1
      expect(enterOrder).toEqual([
        'StartEvent_1',
        'Task_1',
        'Task_2',
        'EndEvent_1',
      ]);
    });
  });

  describe('onNodeComplete 被调用', () => {
    it('验证节点完成时触发 onNodeComplete', async () => {
      const completedElements: string[] = [];

      const hooks: EngineHooks = {
        onNodeComplete: vi.fn((ctx: NodeContext) => {
          completedElements.push(ctx.element.id);
        }),
      };

      const engine = new WorkflowEngine(hooks);
      await engine.startProcess(LINEAR_PROCESS_XML);

      // 所有节点都自动通过，应该都触发 onNodeComplete
      expect(completedElements).toContain('StartEvent_1');
      expect(completedElements).toContain('Task_1');
      expect(completedElements).toContain('Task_2');
      // EndEvent 是否触发 onNodeComplete 取决于实现
      // 至少非 EndEvent 节点应该触发
    });
  });

  describe('onFlowPass 被调用', () => {
    it('验证 flow 经过时触发，ctx 包含正确的 flow/source/target', async () => {
      const flowRecords: Array<{
        flowId: string;
        sourceId: string;
        targetId: string;
      }> = [];

      const hooks: EngineHooks = {
        onFlowPass: vi.fn((ctx: FlowContext) => {
          flowRecords.push({
            flowId: ctx.flow.id,
            sourceId: ctx.sourceElement.id,
            targetId: ctx.targetElement.id,
          });
        }),
      };

      const engine = new WorkflowEngine(hooks);
      await engine.startProcess(SIMPLE_PROCESS_XML);

      // 应该有一个 flow 被经过: Flow_1 (StartEvent_1 → EndEvent_1)
      expect(flowRecords).toHaveLength(1);
      expect(flowRecords[0]!.flowId).toBe('Flow_1');
      expect(flowRecords[0]!.sourceId).toBe('StartEvent_1');
      expect(flowRecords[0]!.targetId).toBe('EndEvent_1');
    });

    it('多段流程的 onFlowPass 按顺序触发', async () => {
      const flowIds: string[] = [];

      const hooks: EngineHooks = {
        onFlowPass: vi.fn((ctx: FlowContext) => {
          flowIds.push(ctx.flow.id);
        }),
      };

      const engine = new WorkflowEngine(hooks);
      await engine.startProcess(LINEAR_PROCESS_XML);

      // 三段 flow: Flow_1, Flow_2, Flow_3
      expect(flowIds).toEqual(['Flow_1', 'Flow_2', 'Flow_3']);
    });
  });

  describe('pause 后 resume 的钩子顺序', () => {
    it('pause 时只触发 onNodeEnter，resume 后触发 onNodeComplete 和后续 onFlowPass', async () => {
      const enterLog: string[] = [];
      const completeLog: string[] = [];
      const flowLog: string[] = [];

      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((ctx: NodeContext) => {
          enterLog.push(ctx.element.id);
          if (ctx.element.type === 'bpmn:userTask') {
            ctx.pause();
          }
        }),
        onNodeComplete: vi.fn((ctx: NodeContext) => {
          completeLog.push(ctx.element.id);
        }),
        onFlowPass: vi.fn((ctx: FlowContext) => {
          flowLog.push(ctx.flow.id);
        }),
      };

      const engine = new WorkflowEngine(hooks);

      // --- startProcess 阶段 ---
      const state = await engine.startProcess(USER_TASK_PROCESS_XML);

      // pause 时：onNodeEnter 触发了 StartEvent 和 UserTask
      expect(enterLog).toContain('StartEvent_1');
      expect(enterLog).toContain('UserTask_1');
      // UserTask 不应有 onNodeComplete（因为 pause 了）
      expect(completeLog).not.toContain('UserTask_1');
      // Flow_1 应该已经触发（Start → UserTask）
      expect(flowLog).toContain('Flow_1');
      // Flow_2 不应触发（UserTask pause 了，没走到 End）
      expect(flowLog).not.toContain('Flow_2');

      // 记录 start 阶段的长度
      const enterCountAfterStart = enterLog.length;
      const completeCountAfterStart = completeLog.length;
      const flowCountAfterStart = flowLog.length;

      // --- resume 阶段 ---
      const waitingItems = engine.getWaitingItems(state);
      await engine.resume(
        state,
        waitingItems[0]!.id,
        {},
        USER_TASK_PROCESS_XML
      );

      // resume 后应该触发 UserTask 的 onNodeComplete
      expect(completeLog).toContain('UserTask_1');
      // resume 后应该触发 Flow_2 (UserTask → End)
      expect(flowLog).toContain('Flow_2');
      // EndEvent 的 onNodeEnter 应该被触发
      expect(enterLog).toContain('EndEvent_1');
    });
  });

  describe('异步钩子', () => {
    it('验证 async 钩子正确等待', async () => {
      const callOrder: string[] = [];

      const hooks: EngineHooks = {
        onNodeEnter: vi.fn(async (ctx: NodeContext) => {
          // 模拟异步操作
          await new Promise((resolve) => setTimeout(resolve, 10));
          callOrder.push(`enter:${ctx.element.id}`);
        }),
        onNodeComplete: vi.fn(async (ctx: NodeContext) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          callOrder.push(`complete:${ctx.element.id}`);
        }),
      };

      const engine = new WorkflowEngine(hooks);
      await engine.startProcess(SIMPLE_PROCESS_XML);

      // 异步钩子应该被正确等待，顺序正确
      expect(callOrder).toContain('enter:StartEvent_1');
      expect(callOrder).toContain('enter:EndEvent_1');

      // 确认顺序：StartEvent enter 在 EndEvent enter 之前
      const startEnterIdx = callOrder.indexOf('enter:StartEvent_1');
      const endEnterIdx = callOrder.indexOf('enter:EndEvent_1');
      expect(startEnterIdx).toBeLessThan(endEnterIdx);
    });
  });

  describe('选择性 pause', () => {
    it('根据 element.type 决定是否 pause — 只 pause userTask', async () => {
      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((ctx: NodeContext) => {
          // 只 pause userTask，其他节点自动通过
          if (ctx.element.type === 'bpmn:userTask') {
            ctx.pause();
          }
        }),
      };

      const engine = new WorkflowEngine(hooks);
      const state = await engine.startProcess(MIXED_TASK_PROCESS_XML);

      // AutoTask_1 自动通过，UserTask_1 pause
      const waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('UserTask_1');

      // resume 后 AutoTask_2 自动通过，到 EndEvent 完成
      const resumedState = await engine.resume(
        state,
        waitingItems[0]!.id,
        {},
        MIXED_TASK_PROCESS_XML
      );

      expect(resumedState.status).toBe('completed');
    });

    it('不 pause 任何节点时全部自动通过', async () => {
      const hooks: EngineHooks = {
        onNodeEnter: vi.fn((_ctx: NodeContext) => {
          // 不调用 pause，全部自动通过
        }),
      };

      const engine = new WorkflowEngine(hooks);
      const state = await engine.startProcess(MIXED_TASK_PROCESS_XML);

      expect(state.status).toBe('completed');
      expect(engine.getWaitingItems(state)).toHaveLength(0);
    });
  });
});
