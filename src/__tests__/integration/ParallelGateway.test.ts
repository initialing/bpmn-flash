/**
 * 集成测试：并行网关 fork/join
 * start → fork → taskA + taskB → join → end
 */
import { describe, it, expect } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine';
import { PARALLEL_GATEWAY_XML } from '../fixtures/v3-bpmn-samples';

describe('集成测试：并行网关', () => {

  it('fork 后创建两个并行令牌', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    const state = await engine.startProcess(PARALLEL_GATEWAY_XML);

    // fork 后应有 2 个 suspended 令牌
    expect(state.tokens).toHaveLength(2);
    const elementIds = state.tokens.map(t => t.elementId).sort();
    expect(elementIds).toEqual(['taskA', 'taskB']);
    expect(state.tokens[0].status).toBe('suspended');
    expect(state.tokens[1].status).toBe('suspended');
  });

  it('两个分支都恢复后汇聚并完成', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    let state = await engine.startProcess(PARALLEL_GATEWAY_XML);

    // 找到 taskA 和 taskB 的令牌
    const tokenA = state.tokens.find(t => t.elementId === 'taskA')!;
    const tokenB = state.tokens.find(t => t.elementId === 'taskB')!;

    // 先恢复 taskA
    state = await engine.resume(state, tokenA.id, PARALLEL_GATEWAY_XML, { resultA: 'done' });

    // taskA 恢复后，流程还没完成（等 taskB）
    expect(state.status).toBe('running');
    // taskB 仍然 suspended
    const remainingTokens = state.tokens.filter(t => t.status === 'suspended');
    expect(remainingTokens.length).toBeGreaterThanOrEqual(1);

    // 找到 taskB 的令牌（可能 id 不变）
    const taskBToken = state.tokens.find(
      t => t.elementId === 'taskB' && t.status === 'suspended'
    );
    expect(taskBToken).toBeTruthy();

    // 恢复 taskB
    state = await engine.resume(state, taskBToken!.id, PARALLEL_GATEWAY_XML, { resultB: 'done' });

    // 两个都恢复 → join → end → 完成
    expect(state.status).toBe('completed');
    expect(state.tokens).toHaveLength(0);
  });

  it('恢复顺序不影响结果（先B后A）', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    let state = await engine.startProcess(PARALLEL_GATEWAY_XML);

    const tokenA = state.tokens.find(t => t.elementId === 'taskA')!;
    const tokenB = state.tokens.find(t => t.elementId === 'taskB')!;

    // 先恢复 taskB
    state = await engine.resume(state, tokenB.id, PARALLEL_GATEWAY_XML);
    expect(state.status).toBe('running');

    // 再恢复 taskA
    const remainingA = state.tokens.find(
      t => t.elementId === 'taskA' && t.status === 'suspended'
    );
    expect(remainingA).toBeTruthy();

    state = await engine.resume(state, remainingA!.id, PARALLEL_GATEWAY_XML);

    expect(state.status).toBe('completed');
  });

  it('不挂起时并行流程自动完成', async () => {
    const engine = new FlowEngine();

    // 无钩子 → 所有任务自动通过
    const state = await engine.startProcess(PARALLEL_GATEWAY_XML);

    expect(state.status).toBe('completed');
    expect(state.tokens).toHaveLength(0);
  });

  it('fork 令牌携带原数据', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    const state = await engine.startProcess(PARALLEL_GATEWAY_XML, {
      applicant: '张三',
    });

    // 两个令牌都应继承流程变量
    expect(state.variables.applicant).toBe('张三');
  });

  it('getSuspendedTokens 返回两个并行挂起', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });

    const state = await engine.startProcess(PARALLEL_GATEWAY_XML);
    const suspended = engine.getSuspendedTokens(state, PARALLEL_GATEWAY_XML);

    expect(suspended).toHaveLength(2);
    const names = suspended.map(s => s.nodeName).sort();
    expect(names).toEqual(['任务A', '任务B']);
  });
});
