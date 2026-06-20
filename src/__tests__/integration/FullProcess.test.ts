/**
 * 完整流程集成测试（v3 FlowEngine）
 * 涵盖审批、并行、复杂流程等真实场景
 */
import { describe, it, expect, vi } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine.js';
import type { NodeHookContext, FlowHookContext } from '../../hooks/types.js';

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
 * Start → Task1(userTask, suspend) → 排他网关 →
 *   [分支A: amount > 1000] Task2(userTask, suspend) → End
 *   [分支B: default] Task3(userTask, suspend) → End
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

  describe('审批流程 — 高金额走经理审批', () => {
    it('Start → 提交申请(suspend) → resume → 排他网关(amount>500) → 经理审批(suspend) → resume → End', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
      });

      // 1. 启动流程，初始金额 1000
      let state = await engine.startProcess(APPROVAL_PROCESS_XML, { amount: 1000 });

      // 2. 应该在"提交申请"处 suspend
      let suspended = engine.getSuspendedTokens(state, APPROVAL_PROCESS_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('SubmitTask');
      expect(state.status).not.toBe('completed');

      // 3. resume 提交申请
      state = await engine.resume(state, suspended[0]!.tokenId, APPROVAL_PROCESS_XML);

      // 4. 网关判断 amount=1000 > 500 → 经理审批
      suspended = engine.getSuspendedTokens(state, APPROVAL_PROCESS_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('ManagerApproval');

      // 5. resume 经理审批
      state = await engine.resume(state, suspended[0]!.tokenId, APPROVAL_PROCESS_XML);

      // 6. 流程完成
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);

      // 7. 验证初始变量
      expect(state.variables.amount).toBe(1000);
    });
  });

  describe('审批流程 — 低金额自动通过', () => {
    it('Start → 提交申请(suspend) → resume → 排他网关(amount<=500) → 自动通过 → End', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
      });

      // 1. 启动流程，初始金额 200
      let state = await engine.startProcess(APPROVAL_PROCESS_XML, { amount: 200 });

      // 2. 应该在"提交申请"处 suspend
      let suspended = engine.getSuspendedTokens(state, APPROVAL_PROCESS_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('SubmitTask');

      // 3. resume 提交申请
      state = await engine.resume(state, suspended[0]!.tokenId, APPROVAL_PROCESS_XML);

      // 4. 网关判断 amount=200 <= 500 → 自动通过（task 类型，不 suspend）
      // 自动通过节点不是 userTask，不会 suspend，直接走到 End
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
    });
  });

  describe('并行审批', () => {
    it('Start → 并行分裂 → 审批A(suspend) + 审批B(suspend) → 依次 resume → 并行汇聚 → End', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
      });

      // 1. 启动流程
      let state = await engine.startProcess(PARALLEL_APPROVAL_XML);

      // 2. 并行分裂后，两个审批任务都应该 suspend
      let suspended = engine.getSuspendedTokens(state, PARALLEL_APPROVAL_XML);
      expect(suspended).toHaveLength(2);

      const nodeIds = suspended.map((t) => t.nodeId).sort();
      expect(nodeIds).toEqual(['ApprovalA', 'ApprovalB']);
      expect(state.status).not.toBe('completed');

      // 3. resume 审批A
      const approvalA = suspended.find((t) => t.nodeId === 'ApprovalA');
      state = await engine.resume(state, approvalA!.tokenId, PARALLEL_APPROVAL_XML);

      // 4. 审批A 完成后，审批B 仍在等待
      suspended = engine.getSuspendedTokens(state, PARALLEL_APPROVAL_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('ApprovalB');
      expect(state.status).not.toBe('completed');

      // 5. resume 审批B
      state = await engine.resume(state, suspended[0]!.tokenId, PARALLEL_APPROVAL_XML);

      // 6. 两个都完成 → 汇聚 → EndEvent → 流程完成
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
    });

    it('并行审批 — 先 resume B 再 resume A，顺序无关', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
      });

      let state = await engine.startProcess(PARALLEL_APPROVAL_XML);

      let suspended = engine.getSuspendedTokens(state, PARALLEL_APPROVAL_XML);
      expect(suspended).toHaveLength(2);

      // 先 resume B
      const approvalB = suspended.find((t) => t.nodeId === 'ApprovalB');
      state = await engine.resume(state, approvalB!.tokenId, PARALLEL_APPROVAL_XML);

      // A 仍在等待
      suspended = engine.getSuspendedTokens(state, PARALLEL_APPROVAL_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('ApprovalA');

      // resume A
      state = await engine.resume(state, suspended[0]!.tokenId, PARALLEL_APPROVAL_XML);

      expect(state.status).toBe('completed');
    });
  });

  describe('复杂流程', () => {
    it('Start → Task1(suspend) → resume → 排他网关(amount>1000) → Task2(suspend) → resume → End', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
      });

      // 1. 启动，金额 2000
      let state = await engine.startProcess(COMPLEX_PROCESS_XML, { amount: 2000 });

      // 2. Task1 suspend
      let suspended = engine.getSuspendedTokens(state, COMPLEX_PROCESS_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('Task1');

      // 3. resume Task1
      state = await engine.resume(state, suspended[0]!.tokenId, COMPLEX_PROCESS_XML);

      // 4. 网关判断 amount=2000 > 1000 → Task2（高额审批）
      suspended = engine.getSuspendedTokens(state, COMPLEX_PROCESS_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('Task2');

      // 5. resume Task2
      state = await engine.resume(state, suspended[0]!.tokenId, COMPLEX_PROCESS_XML);

      // 6. 完成
      expect(state.status).toBe('completed');
      expect(state.variables.amount).toBe(2000);
    });

    it('Start → Task1(suspend) → resume → 排他网关(amount<=1000) → Task3(suspend) → resume → End', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
      });

      // 1. 启动，金额 500
      let state = await engine.startProcess(COMPLEX_PROCESS_XML, { amount: 500 });

      // 2. Task1 suspend
      let suspended = engine.getSuspendedTokens(state, COMPLEX_PROCESS_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('Task1');

      // 3. resume Task1
      state = await engine.resume(state, suspended[0]!.tokenId, COMPLEX_PROCESS_XML);

      // 4. 网关判断 amount=500 <= 1000 → Task3（普通审批，默认分支）
      suspended = engine.getSuspendedTokens(state, COMPLEX_PROCESS_XML);
      expect(suspended).toHaveLength(1);
      expect(suspended[0]!.nodeId).toBe('Task3');

      // 5. resume Task3
      state = await engine.resume(state, suspended[0]!.tokenId, COMPLEX_PROCESS_XML);

      // 6. 完成
      expect(state.status).toBe('completed');
      expect(state.variables.amount).toBe(500);
    });
  });

  describe('端到端钩子验证', () => {
    it('完整流程中钩子调用的完整性', async () => {
      const enterLog: string[] = [];
      const leaveLog: string[] = [];
      const flowLog: string[] = [];

      const HOOK_TEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
</bpmn:definitions>`;

      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          enterLog.push(ctx.node.id);
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
        onNodeLeave: (ctx) => {
          leaveLog.push(ctx.node.id);
        },
        onSequenceFlow: (ctx) => {
          flowLog.push(`${ctx.sourceNode.id}->${ctx.targetNode.id}`);
        },
      });

      // --- start 阶段 ---
      let state = await engine.startProcess(HOOK_TEST_XML);

      // start 阶段的钩子
      expect(enterLog).toContain('Start');
      expect(enterLog).toContain('Task');
      expect(flowLog).toContain('Start->Task');

      // Task onNodeLeave 不应该在 suspend 时触发
      expect(leaveLog).not.toContain('Task');

      // --- resume ---
      const tokenId = state.tokens[0]!.id;
      state = await engine.resume(state, tokenId, HOOK_TEST_XML);

      // resume 后的钩子
      expect(leaveLog).toContain('Task');
      expect(flowLog).toContain('Task->End');
      expect(enterLog).toContain('End');
      expect(state.status).toBe('completed');
    });
  });
});
