/**
 * 集成测试：简单流程 start → userTask(suspend) → resume → end
 */
import { describe, it, expect, vi } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine';
import { SIMPLE_PROCESS_XML, AUTO_PASS_PROCESS_XML } from '../fixtures/v3-bpmn-samples';

describe('集成测试：简单流程', () => {

  it('start → userTask(suspend) → resume → end 完整流程', async () => {
    const enterOrder: string[] = [];
    const leaveOrder: string[] = [];
    const flowOrder: string[] = [];

    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        enterOrder.push(ctx.node.id);
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
      onNodeLeave: (ctx) => {
        leaveOrder.push(ctx.node.id);
      },
      onSequenceFlow: (ctx) => {
        flowOrder.push(`${ctx.sourceNode.id}→${ctx.targetNode.id}`);
      },
    });

    // 1. 启动
    let state = await engine.startProcess(SIMPLE_PROCESS_XML, { applicant: '张三' });

    expect(state.status).toBe('running');
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].status).toBe('suspended');
    expect(state.tokens[0].elementId).toBe('task1');

    // 2. 恢复
    const tokenId = state.tokens[0].id;
    state = await engine.resume(state, tokenId, SIMPLE_PROCESS_XML, {
      approved: true,
      comment: '同意',
    });

    // 3. 验证流程完成
    expect(state.status).toBe('completed');
    expect(state.tokens).toHaveLength(0);
    expect(state.endedAt).toBeInstanceOf(Date);

    // 4. 验证钩子触发顺序
    expect(enterOrder).toContain('start');
    expect(enterOrder).toContain('task1');
    expect(enterOrder).toContain('end');

    // 5. 验证变量
    expect(state.variables.applicant).toBe('张三');
  });

  it('无 suspend 的流程自动完成', async () => {
    const engine = new FlowEngine();

    const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

    expect(state.status).toBe('completed');
    expect(state.tokens).toHaveLength(0);
  });

  it('start → end 最小流程', async () => {
    const minimalXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_min">
  <bpmn:process id="min-process" name="最小流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow1</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

    const engine = new FlowEngine();
    const state = await engine.startProcess(minimalXML);

    expect(state.status).toBe('completed');
  });

  it('trace 记录完整的执行路径', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    let state = await engine.startProcess(SIMPLE_PROCESS_XML);
    const tokenId = state.tokens[0].id;
    state = await engine.resume(state, tokenId, SIMPLE_PROCESS_XML);

    // 验证 trace 包含关键步骤
    const nodeEnters = state.trace.filter((t: any) => t.type === 'node-enter');
    const nodeLeaves = state.trace.filter((t: any) => t.type === 'node-leave');
    const seqFlows = state.trace.filter((t: any) => t.type === 'sequence-flow');

    // 至少 3 个 node-enter：start, task1, end
    expect(nodeEnters.length).toBeGreaterThanOrEqual(3);
    // 至少 2 条 sequence-flow：start→task1, task1→end
    expect(seqFlows.length).toBeGreaterThanOrEqual(2);
  });

  it('processEnd 钩子在流程完成时触发', async () => {
    const onProcessEnd = vi.fn();
    const engine = new FlowEngine({
      onProcessEnd,
    });

    await engine.startProcess(AUTO_PASS_PROCESS_XML);

    // processEnd 应被触发
    expect(onProcessEnd).toHaveBeenCalled();
  });
});
