/**
 * 集成测试：suspend + resume 完整流程
 * start → userTask → serviceTask → end
 */
import { describe, it, expect, vi } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine';
import { SUSPEND_RESUME_XML, SIMPLE_PROCESS_XML } from '../fixtures/v3-bpmn-samples';

describe('集成测试：suspend + resume', () => {

  it('两个连续挂起节点的完整流程', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask' || ctx.node.type === 'bpmn:serviceTask') {
          ctx.suspend();
        }
      },
    });

    // 1. 启动 → 停在 userTask1
    let state = await engine.startProcess(SUSPEND_RESUME_XML);

    expect(state.status).toBe('running');
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('userTask1');

    // 2. 恢复 userTask1 → 推进到 serviceTask1 → 再次挂起
    const userTaskTokenId = state.tokens[0].id;
    state = await engine.resume(state, userTaskTokenId, SUSPEND_RESUME_XML, {
      approved: true,
    });

    expect(state.status).toBe('running');
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('serviceTask1');
    expect(state.tokens[0].status).toBe('suspended');

    // 3. 恢复 serviceTask1 → 走到 end → 流程完成
    const serviceTaskTokenId = state.tokens[0].id;
    state = await engine.resume(state, serviceTaskTokenId, SUSPEND_RESUME_XML, {
      serviceResult: 'ok',
    });

    expect(state.status).toBe('completed');
    expect(state.tokens).toHaveLength(0);
  });

  it('resume 合并数据到令牌', async () => {
    let tokenDataAtLeave: any = null;

    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
      onNodeLeave: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          tokenDataAtLeave = { ...ctx.token.data };
        }
      },
    });

    let state = await engine.startProcess(SIMPLE_PROCESS_XML);
    const tokenId = state.tokens[0].id;

    state = await engine.resume(state, tokenId, SIMPLE_PROCESS_XML, {
      approved: true,
      comment: '同意',
    });

    expect(tokenDataAtLeave).toBeDefined();
    expect(tokenDataAtLeave.approved).toBe(true);
    expect(tokenDataAtLeave.comment).toBe('同意');
  });

  it('resume 触发 nodeLeave 钩子', async () => {
    const leaveNodes: string[] = [];

    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
      onNodeLeave: (ctx) => {
        leaveNodes.push(ctx.node.id);
      },
    });

    let state = await engine.startProcess(SIMPLE_PROCESS_XML);
    const tokenId = state.tokens[0].id;

    state = await engine.resume(state, tokenId, SIMPLE_PROCESS_XML);

    // task1 的 nodeLeave 应被触发
    expect(leaveNodes).toContain('task1');
  });

  it('suspend 后 terminate 终止流程', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    let state = await engine.startProcess(SIMPLE_PROCESS_XML);
    expect(state.tokens).toHaveLength(1);

    state = engine.terminate(state);

    expect(state.status).toBe('terminated');
    expect(state.tokens).toHaveLength(0);
  });

  it('setTokenData 在 onNodeEnter 中生效', async () => {
    let dataAtLeave: any = null;

    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.setTokenData({ enriched: true });
          ctx.suspend();
        }
      },
      onNodeLeave: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          dataAtLeave = { ...ctx.token.data };
        }
      },
    });

    let state = await engine.startProcess(SIMPLE_PROCESS_XML);
    const tokenId = state.tokens[0].id;

    state = await engine.resume(state, tokenId, SIMPLE_PROCESS_XML);

    // enriched 应在令牌数据中
    expect(dataAtLeave).toBeDefined();
    expect(dataAtLeave.enriched).toBe(true);
  });

  it('setVariables 在 onNodeEnter 中生效', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.setVariables({ step: 'approval' });
          ctx.suspend();
        }
      },
    });

    const state = await engine.startProcess(SIMPLE_PROCESS_XML);

    expect(state.variables.step).toBe('approval');
  });
});
