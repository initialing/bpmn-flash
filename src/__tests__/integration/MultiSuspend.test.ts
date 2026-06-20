/**
 * 集成测试：多个并行 suspend 恢复
 * start → fork → userTaskA + userTaskB → join → end
 * 每个分支各自 suspend，逐个 resume
 */
import { describe, it, expect } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine';
import { MULTI_SUSPEND_XML } from '../fixtures/v3-bpmn-samples';

describe('集成测试：多 suspend 并行恢复', () => {

  function createEngine() {
    return new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
    });
  }

  it('fork 后两个分支各自 suspend', async () => {
    const engine = createEngine();
    const state = await engine.startProcess(MULTI_SUSPEND_XML);

    expect(state.status).toBe('running');
    expect(state.tokens).toHaveLength(2);

    const suspended = state.tokens.filter(t => t.status === 'suspended');
    expect(suspended).toHaveLength(2);

    const nodeIds = suspended.map(t => t.elementId).sort();
    expect(nodeIds).toEqual(['userTaskA', 'userTaskB']);
  });

  it('先恢复 A 再恢复 B → 流程完成', async () => {
    const engine = createEngine();
    let state = await engine.startProcess(MULTI_SUSPEND_XML);

    // 恢复 userTaskA
    const tokenA = state.tokens.find(t => t.elementId === 'userTaskA')!;
    state = await engine.resume(state, tokenA.id, MULTI_SUSPEND_XML, { resultA: 'ok' });

    // A 恢复后，流程还没完成
    expect(state.status).toBe('running');

    // B 仍然 suspended
    const tokenB = state.tokens.find(
      t => t.elementId === 'userTaskB' && t.status === 'suspended'
    );
    expect(tokenB).toBeTruthy();

    // 恢复 userTaskB
    state = await engine.resume(state, tokenB!.id, MULTI_SUSPEND_XML, { resultB: 'ok' });

    // 两个都恢复 → join → end → completed
    expect(state.status).toBe('completed');
    expect(state.tokens).toHaveLength(0);
  });

  it('先恢复 B 再恢复 A → 流程完成', async () => {
    const engine = createEngine();
    let state = await engine.startProcess(MULTI_SUSPEND_XML);

    // 恢复 userTaskB 先
    const tokenB = state.tokens.find(t => t.elementId === 'userTaskB')!;
    state = await engine.resume(state, tokenB.id, MULTI_SUSPEND_XML, { resultB: 'ok' });

    expect(state.status).toBe('running');

    // 恢复 userTaskA
    const tokenA = state.tokens.find(
      t => t.elementId === 'userTaskA' && t.status === 'suspended'
    );
    expect(tokenA).toBeTruthy();

    state = await engine.resume(state, tokenA!.id, MULTI_SUSPEND_XML, { resultA: 'ok' });

    expect(state.status).toBe('completed');
  });

  it('只恢复一个分支，流程保持 running', async () => {
    const engine = createEngine();
    let state = await engine.startProcess(MULTI_SUSPEND_XML);

    const tokenA = state.tokens.find(t => t.elementId === 'userTaskA')!;
    state = await engine.resume(state, tokenA.id, MULTI_SUSPEND_XML);

    // 只恢复了 A，B 还在等 → 流程仍然 running
    expect(state.status).toBe('running');
    const stillSuspended = state.tokens.filter(t => t.status === 'suspended');
    expect(stillSuspended.length).toBeGreaterThanOrEqual(1);
  });

  it('getSuspendedTokens 在部分恢复后正确反映', async () => {
    const engine = createEngine();
    let state = await engine.startProcess(MULTI_SUSPEND_XML);

    // 恢复 A
    const tokenA = state.tokens.find(t => t.elementId === 'userTaskA')!;
    state = await engine.resume(state, tokenA.id, MULTI_SUSPEND_XML);

    const suspended = engine.getSuspendedTokens(state, MULTI_SUSPEND_XML);

    // 只剩 B
    expect(suspended).toHaveLength(1);
    expect(suspended[0].nodeId).toBe('userTaskB');
    expect(suspended[0].nodeName).toBe('审批B');
  });

  it('terminate 可以在部分恢复后终止流程', async () => {
    const engine = createEngine();
    let state = await engine.startProcess(MULTI_SUSPEND_XML);

    // 只恢复 A
    const tokenA = state.tokens.find(t => t.elementId === 'userTaskA')!;
    state = await engine.resume(state, tokenA.id, MULTI_SUSPEND_XML);

    // 终止
    state = engine.terminate(state);

    expect(state.status).toBe('terminated');
    expect(state.tokens).toHaveLength(0);
  });

  it('resume 数据在各自分支独立', async () => {
    let tokenAData: any = null;
    let tokenBData: any = null;

    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:userTask') {
          ctx.suspend();
        }
      },
      onNodeLeave: (ctx) => {
        if (ctx.node.id === 'userTaskA') {
          tokenAData = { ...ctx.token.data };
        }
        if (ctx.node.id === 'userTaskB') {
          tokenBData = { ...ctx.token.data };
        }
      },
    });

    let state = await engine.startProcess(MULTI_SUSPEND_XML);

    const tokenA = state.tokens.find(t => t.elementId === 'userTaskA')!;
    state = await engine.resume(state, tokenA.id, MULTI_SUSPEND_XML, {
      reviewer: '张三',
      decision: 'approve',
    });

    const tokenB = state.tokens.find(
      t => t.elementId === 'userTaskB' && t.status === 'suspended'
    )!;
    state = await engine.resume(state, tokenB.id, MULTI_SUSPEND_XML, {
      reviewer: '李四',
      decision: 'reject',
    });

    expect(tokenAData.reviewer).toBe('张三');
    expect(tokenAData.decision).toBe('approve');
    expect(tokenBData.reviewer).toBe('李四');
    expect(tokenBData.decision).toBe('reject');
  });
});
