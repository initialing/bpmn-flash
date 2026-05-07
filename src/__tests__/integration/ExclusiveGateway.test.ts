/**
 * 集成测试：排他网关分支
 * start → gateway → branchA/branchB → end
 */
import { describe, it, expect } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine';
import {
  EXCLUSIVE_GATEWAY_XML,
  EXCLUSIVE_SINGLE_OUT_XML,
  EXCLUSIVE_AFTER_TASK_XML,
} from '../fixtures/v3-bpmn-samples';

describe('集成测试：排他网关', () => {

  it('条件为 true 走审批通过分支', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    // approved = true → 走 approvedTask 分支
    const state = await engine.startProcess(EXCLUSIVE_GATEWAY_XML, {
      approved: true,
    });

    expect(state.status).toBe('running');
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('approvedTask');
    expect(state.tokens[0].status).toBe('suspended');
  });

  it('条件为 false 走默认（拒绝）分支', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    // approved = false → 走 defaultFlow → rejectedTask
    const state = await engine.startProcess(EXCLUSIVE_GATEWAY_XML, {
      approved: false,
    });

    expect(state.status).toBe('running');
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('rejectedTask');
  });

  it('未提供条件变量走默认分支', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    // 没有 approved 变量 → 条件不满足 → 走 default
    const state = await engine.startProcess(EXCLUSIVE_GATEWAY_XML, {});

    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('rejectedTask');
  });

  it('单出口排他网关直接通过', async () => {
    const engine = new FlowEngine();

    const state = await engine.startProcess(EXCLUSIVE_SINGLE_OUT_XML);

    // 单出口，应该直接走到 end 并完成
    expect(state.status).toBe('completed');
  });

  it('审批后走排他网关完整流程', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask' || ctx.node.type === 'bpmn:serviceTask') {
          ctx.suspend();
        }
      },
    });

    // 1. 启动 → 停在 userTask1
    let state = await engine.startProcess(EXCLUSIVE_AFTER_TASK_XML);

    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('userTask1');

    // 2. 审批通过 → 经过排他网关 → 停在 taskA
    const tokenId = state.tokens[0].id;
    state = await engine.resume(state, tokenId, EXCLUSIVE_AFTER_TASK_XML, {
      approved: true,
    });

    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('taskA');

    // 3. 完成 taskA → 流程结束
    const taskATokenId = state.tokens[0].id;
    state = await engine.resume(state, taskATokenId, EXCLUSIVE_AFTER_TASK_XML);

    expect(state.status).toBe('completed');
  });

  it('审批拒绝走另一分支', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask' || ctx.node.type === 'bpmn:serviceTask') {
          ctx.suspend();
        }
      },
    });

    let state = await engine.startProcess(EXCLUSIVE_AFTER_TASK_XML);
    const tokenId = state.tokens[0].id;

    // 审批拒绝
    state = await engine.resume(state, tokenId, EXCLUSIVE_AFTER_TASK_XML, {
      approved: false,
    });

    // 应走 defaultFlow → taskB
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('taskB');
  });

  it('网关选择应记录在 trace 中', async () => {
    const engine = new FlowEngine();

    const state = await engine.startProcess(EXCLUSIVE_GATEWAY_XML, {
      approved: true,
    });

    // 应有 gateway-resolve 或 node-enter(gateway) 记录
    const gwTraces = state.trace.filter(
      (t: any) => t.elementId === 'gateway'
    );
    expect(gwTraces.length).toBeGreaterThan(0);
  });
});
