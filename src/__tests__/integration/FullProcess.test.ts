import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import type { EngineHooks, NodeContext, FlowContext } from '../../types/index.js';

// ==================== BPMN XML 模板 ====================

/**
 * 审批流程:
 * Start → 提交申请(userTask) → 排他网关(amount>500?) →
 *   [是] 经理审批(userTask) → End
 *   [否] 自动通过(task) → End
 */
const APPROVAL_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="approval-process" name="审批流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="SubmitTask" name="提交申请">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_1" name="金额判断" default="Flow_4">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="ManagerApproval" name="经理审批">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:task id="AutoApprove" name="自动通过">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:incoming>Flow_6</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="SubmitTask" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubmitTask" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="ManagerApproval">
      <bpmn:conditionExpression>\${amount > 500}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="AutoApprove" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="ManagerApproval" targetRef="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="AutoApprove" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

/**
 * 并行审批流程:
 * Start → 并行网关(分裂) → 审批A(userTask) + 审批B(userTask) → 并行网关(汇聚) → End
 */
const PARALLEL_APPROVAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="parallel-approval" name="并行审批流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:parallelGateway id="Fork_1" name="并行分裂">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:parallelGateway>
    <bpmn:userTask id="ApprovalA" name="审批A">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="ApprovalB" name="审批B">
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
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Fork_1" targetRef="ApprovalA" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Fork_1" targetRef="ApprovalB" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="ApprovalA" targetRef="Join_1" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="ApprovalB" targetRef="Join_1" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Join_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

/**
 * 复杂流程:
 * Start → Task1(userTask, pause) → 排他网关 →
 *   [分支A: amount > 1000] Task2(userTask, pause) → End
 *   [分支B: default] Task3(userTask, pause) → End
 */
const COMPLEX_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="complex-process" name="复杂流程" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task1" name="初审">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_1" name="金额判断" default="Flow_4">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="Task2" name="高额审批">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task3" name="普通审批">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:incoming>Flow_6</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="Task2">
      <bpmn:conditionExpression>\${amount > 1000}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Task3" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Task2" targetRef="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Task3" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

// ==================== 集成测试 ====================

describe('FullProcess — 集成测试', () => {

  /** 通用钩子：只 pause userTask */
  function createUserTaskPauseHooks(): EngineHooks {
    return {
      onNodeEnter: vi.fn((ctx: NodeContext) => {
        if (ctx.element.type === 'bpmn:userTask') {
          ctx.pause();
        }
      }),
      onNodeComplete: vi.fn(),
      onFlowPass: vi.fn(),
    };
  }

  describe('审批流程 — 高金额走经理审批', () => {
    it('Start → 提交申请(pause) → resume → 排他网关(amount>500) → 经理审批(pause) → resume → End', async () => {
      const hooks = createUserTaskPauseHooks();
      const engine = new WorkflowEngine(hooks);

      // 1. 启动流程，初始金额 1000
      let state = await engine.startProcess(APPROVAL_PROCESS_XML, { amount: 1000 });

      // 2. 应该在"提交申请"处 pause
      let waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('SubmitTask');
      expect(state.status).not.toBe('completed');

      // 3. resume 提交申请
      state = await engine.resume(
        state,
        waitingItems[0]!.id,
        { submitter: '张三' },
        APPROVAL_PROCESS_XML
      );

      // 4. 网关判断 amount=1000 > 500 → 经理审批
      waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('ManagerApproval');

      // 5. resume 经理审批
      state = await engine.resume(
        state,
        waitingItems[0]!.id,
        { approved: true, approver: '李经理' },
        APPROVAL_PROCESS_XML
      );

      // 6. 流程完成
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
      expect(engine.getWaitingItems(state)).toHaveLength(0);

      // 7. 验证数据合并
      expect(state.data.amount).toBe(1000);
      expect(state.data.submitter).toBe('张三');
      expect(state.data.approved).toBe(true);
      expect(state.data.approver).toBe('李经理');

      // 8. 验证钩子被调用
      expect(hooks.onNodeEnter).toHaveBeenCalled();
      expect(hooks.onNodeComplete).toHaveBeenCalled();
      expect(hooks.onFlowPass).toHaveBeenCalled();
    });
  });

  describe('审批流程 — 低金额自动通过', () => {
    it('Start → 提交申请(pause) → resume → 排他网关(amount<=500) → 自动通过 → End', async () => {
      const hooks = createUserTaskPauseHooks();
      const engine = new WorkflowEngine(hooks);

      // 1. 启动流程，初始金额 200
      let state = await engine.startProcess(APPROVAL_PROCESS_XML, { amount: 200 });

      // 2. 应该在"提交申请"处 pause
      let waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('SubmitTask');

      // 3. resume 提交申请
      state = await engine.resume(
        state,
        waitingItems[0]!.id,
        { submitter: '王五' },
        APPROVAL_PROCESS_XML
      );

      // 4. 网关判断 amount=200 <= 500 → 自动通过（task 类型，不 pause）
      // 自动通过节点不是 userTask，不会 pause，直接走到 End
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
    });
  });

  describe('并行审批', () => {
    it('Start → 并行分裂 → 审批A(pause) + 审批B(pause) → 依次 resume → 并行汇聚 → End', async () => {
      const hooks = createUserTaskPauseHooks();
      const engine = new WorkflowEngine(hooks);

      // 1. 启动流程
      let state = await engine.startProcess(PARALLEL_APPROVAL_XML);

      // 2. 并行分裂后，两个审批任务都应该 pause
      let waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(2);

      const elementIds = waitingItems.map((item) => item.elementId).sort();
      expect(elementIds).toEqual(['ApprovalA', 'ApprovalB']);
      expect(state.status).not.toBe('completed');

      // 3. resume 审批A
      const approvalAItem = waitingItems.find((item) => item.elementId === 'ApprovalA');
      state = await engine.resume(
        state,
        approvalAItem!.id,
        { approvalA: 'approved' },
        PARALLEL_APPROVAL_XML
      );

      // 4. 审批A 完成后，审批B 仍在等待，流程不应完成
      waitingItems = engine.getWaitingItems(state);
      const approvalBItem = waitingItems.find((item) => item.elementId === 'ApprovalB');
      expect(approvalBItem).toBeDefined();
      expect(state.status).not.toBe('completed');

      // 5. resume 审批B
      state = await engine.resume(
        state,
        approvalBItem!.id,
        { approvalB: 'approved' },
        PARALLEL_APPROVAL_XML
      );

      // 6. 两个都完成 → 汇聚 → EndEvent → 流程完成
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
      expect(engine.getWaitingItems(state)).toHaveLength(0);

      // 7. 验证数据
      expect(state.data.approvalA).toBe('approved');
      expect(state.data.approvalB).toBe('approved');
    });

    it('并行审批 — 先 resume B 再 resume A，顺序无关', async () => {
      const hooks = createUserTaskPauseHooks();
      const engine = new WorkflowEngine(hooks);

      let state = await engine.startProcess(PARALLEL_APPROVAL_XML);

      let waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(2);

      // 先 resume B
      const approvalBItem = waitingItems.find((item) => item.elementId === 'ApprovalB');
      state = await engine.resume(
        state,
        approvalBItem!.id,
        { approvalB: 'rejected' },
        PARALLEL_APPROVAL_XML
      );

      // A 仍在等待
      waitingItems = engine.getWaitingItems(state);
      const approvalAItem = waitingItems.find((item) => item.elementId === 'ApprovalA');
      expect(approvalAItem).toBeDefined();

      // resume A
      state = await engine.resume(
        state,
        approvalAItem!.id,
        { approvalA: 'approved' },
        PARALLEL_APPROVAL_XML
      );

      expect(state.status).toBe('completed');
    });
  });

  describe('复杂流程', () => {
    it('Start → Task1(pause) → resume → 排他网关(amount>1000) → Task2(pause) → resume → End', async () => {
      const hooks = createUserTaskPauseHooks();
      const engine = new WorkflowEngine(hooks);

      // 1. 启动，金额 2000
      let state = await engine.startProcess(COMPLEX_PROCESS_XML, { amount: 2000 });

      // 2. Task1 pause
      let waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('Task1');

      // 3. resume Task1
      state = await engine.resume(
        state,
        waitingItems[0]!.id,
        { reviewResult: 'pass' },
        COMPLEX_PROCESS_XML
      );

      // 4. 网关判断 amount=2000 > 1000 → Task2（高额审批）
      waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('Task2');

      // 5. resume Task2
      state = await engine.resume(
        state,
        waitingItems[0]!.id,
        { finalApproval: true },
        COMPLEX_PROCESS_XML
      );

      // 6. 完成
      expect(state.status).toBe('completed');
      expect(state.data.amount).toBe(2000);
      expect(state.data.reviewResult).toBe('pass');
      expect(state.data.finalApproval).toBe(true);
    });

    it('Start → Task1(pause) → resume → 排他网关(amount<=1000) → Task3(pause) → resume → End', async () => {
      const hooks = createUserTaskPauseHooks();
      const engine = new WorkflowEngine(hooks);

      // 1. 启动，金额 500
      let state = await engine.startProcess(COMPLEX_PROCESS_XML, { amount: 500 });

      // 2. Task1 pause
      let waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('Task1');

      // 3. resume Task1
      state = await engine.resume(
        state,
        waitingItems[0]!.id,
        { reviewResult: 'pass' },
        COMPLEX_PROCESS_XML
      );

      // 4. 网关判断 amount=500 <= 1000 → Task3（普通审批，默认分支）
      waitingItems = engine.getWaitingItems(state);
      expect(waitingItems).toHaveLength(1);
      expect(waitingItems[0]!.elementId).toBe('Task3');

      // 5. resume Task3
      state = await engine.resume(
        state,
        waitingItems[0]!.id,
        { normalApproval: true },
        COMPLEX_PROCESS_XML
      );

      // 6. 完成
      expect(state.status).toBe('completed');
      expect(state.data.amount).toBe(500);
      expect(state.data.normalApproval).toBe(true);
    });
  });

  describe('端到端钩子验证', () => {
    it('完整流程中钩子调用的完整性', async () => {
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
          flowLog.push(`${ctx.sourceElement.id}->${ctx.targetElement.id}`);
        }),
      };

      const engine = new WorkflowEngine(hooks);

      // 简单的 Start → UserTask → End
      let state = await engine.startProcess(
        `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="hook-test-process" name="钩子测试流程" isExecutable="true">
    <bpmn:startEvent id="Start">
      <bpmn:outgoing>F1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task" name="任务">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="End">
      <bpmn:incoming>F2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Task" />
    <bpmn:sequenceFlow id="F2" sourceRef="Task" targetRef="End" />
  </bpmn:process>
</bpmn:definitions>`
      );

      // start 阶段的钩子记录
      expect(enterLog).toContain('Start');
      expect(enterLog).toContain('Task');
      expect(flowLog).toContain('Start->Task');

      // resume
      const items = engine.getWaitingItems(state);
      state = await engine.resume(
        state,
        items[0]!.id,
        {},
        `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="hook-test-process" name="钩子测试流程" isExecutable="true">
    <bpmn:startEvent id="Start">
      <bpmn:outgoing>F1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task" name="任务">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="End">
      <bpmn:incoming>F2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Task" />
    <bpmn:sequenceFlow id="F2" sourceRef="Task" targetRef="End" />
  </bpmn:process>
</bpmn:definitions>`
      );

      // resume 后的钩子
      expect(completeLog).toContain('Task');
      expect(flowLog).toContain('Task->End');
      expect(enterLog).toContain('End');
      expect(state.status).toBe('completed');
    });
  });
});
