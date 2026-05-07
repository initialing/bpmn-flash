/**
 * 集成测试：scriptTask + ScriptExecutorPlugin
 * start → scriptTask(executeScript) → end
 */
import { describe, it, expect, vi } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine';
import { SCRIPT_TASK_XML } from '../fixtures/v3-bpmn-samples';

describe('集成测试：ScriptTask', () => {

  it('使用 ScriptExecutorPlugin 执行脚本', async () => {
    const executeSpy = vi.fn((state, script, cb) => {
      cb(null, { computed: 42 });
    });

    const engine = new FlowEngine({
      scriptExecutor: {
        execute: executeSpy,
      },
      onNodeEnter: async (ctx) => {
        if (ctx.node.type === 'bpmn:scriptTask') {
          const result = await ctx.executeScript('compute()');
          ctx.setTokenData(result);
        }
      },
    });

    const state = await engine.startProcess(SCRIPT_TASK_XML);

    // 脚本应被执行
    expect(executeSpy).toHaveBeenCalledTimes(1);
    // 流程应完成（scriptTask 未 suspend）
    expect(state.status).toBe('completed');
  });

  it('脚本执行结果通过 setTokenData 合并', async () => {
    let finalTokenData: any = null;

    const engine = new FlowEngine({
      scriptExecutor: {
        execute: (state, script, cb) => {
          cb(null, { result: 100, message: '计算完成' });
        },
      },
      onNodeEnter: async (ctx) => {
        if (ctx.node.type === 'bpmn:scriptTask') {
          const result = await ctx.executeScript('calc');
          ctx.setTokenData(result);
        }
      },
      onNodeLeave: (ctx) => {
        if (ctx.node.type === 'bpmn:scriptTask') {
          finalTokenData = { ...ctx.token.data };
        }
      },
    });

    await engine.startProcess(SCRIPT_TASK_XML);

    expect(finalTokenData).toBeDefined();
    expect(finalTokenData.result).toBe(100);
    expect(finalTokenData.message).toBe('计算完成');
  });

  it('脚本执行失败时钩子可以捕获错误', async () => {
    let errorCaught = false;

    const engine = new FlowEngine({
      scriptExecutor: {
        execute: (state, script, cb) => {
          cb(new Error('脚本执行失败'));
        },
      },
      onNodeEnter: async (ctx) => {
        if (ctx.node.type === 'bpmn:scriptTask') {
          try {
            await ctx.executeScript('bad script');
          } catch (e: any) {
            errorCaught = true;
            ctx.setTokenData({ error: e.message });
          }
        }
      },
    });

    const state = await engine.startProcess(SCRIPT_TASK_XML);

    expect(errorCaught).toBe(true);
    // 流程应该继续（钩子捕获了错误）
    expect(state.status).toBe('completed');
  });

  it('未注册 ScriptExecutorPlugin 时 executeScript 抛错', async () => {
    let errorMessage = '';

    const engine = new FlowEngine({
      // 没有注册 scriptExecutor
      onNodeEnter: async (ctx) => {
        if (ctx.node.type === 'bpmn:scriptTask') {
          try {
            await ctx.executeScript('test');
          } catch (e: any) {
            errorMessage = e.message;
          }
        }
      },
    });

    await engine.startProcess(SCRIPT_TASK_XML);

    expect(errorMessage).toContain('ScriptExecutorPlugin');
  });

  it('scriptTask 不调 suspend 时自动推进', async () => {
    const engine = new FlowEngine({
      scriptExecutor: {
        execute: (state, script, cb) => {
          cb(null, {});
        },
      },
      onNodeEnter: async (ctx) => {
        if (ctx.node.type === 'bpmn:scriptTask') {
          await ctx.executeScript('run');
          // 不调用 suspend()，自动推进
        }
      },
    });

    const state = await engine.startProcess(SCRIPT_TASK_XML);

    expect(state.status).toBe('completed');
    expect(state.tokens).toHaveLength(0);
  });

  it('scriptTask 也可以 suspend 然后 resume', async () => {
    const engine = new FlowEngine({
      onNodeEnter: (ctx) => {
        if (ctx.node.type === 'bpmn:scriptTask') {
          ctx.suspend(); // 挂起等待外部执行
        }
      },
    });

    let state = await engine.startProcess(SCRIPT_TASK_XML);

    expect(state.status).toBe('running');
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0].elementId).toBe('script1');

    // 外部执行完毕后恢复
    const tokenId = state.tokens[0].id;
    state = await engine.resume(state, tokenId, SCRIPT_TASK_XML, {
      scriptResult: 'done',
    });

    expect(state.status).toBe('completed');
  });
});
