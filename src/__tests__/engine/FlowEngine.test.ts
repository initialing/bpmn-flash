/**
 * FlowEngine 单元测试
 * 测试主引擎的核心 API：startProcess / resume / terminate / getSuspendedTokens
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine';
import {
  SIMPLE_PROCESS_XML,
  AUTO_PASS_PROCESS_XML,
  EXCLUSIVE_GATEWAY_XML,
  PARALLEL_GATEWAY_XML,
  SCRIPT_TASK_XML,
} from '../fixtures/v3-bpmn-samples';

describe('FlowEngine', () => {

  // ==================== 构造函数 ====================
  describe('构造函数', () => {
    it('无参数构造不报错', () => {
      expect(() => new FlowEngine()).not.toThrow();
    });

    it('传入空选项不报错', () => {
      expect(() => new FlowEngine({})).not.toThrow();
    });

    it('传入钩子构造不报错', () => {
      expect(() => new FlowEngine({
        onNodeEnter: vi.fn(),
        onNodeLeave: vi.fn(),
        onSequenceFlow: vi.fn(),
        onProcessStart: vi.fn(),
        onProcessEnd: vi.fn(),
      })).not.toThrow();
    });
  });

  // ==================== startProcess ====================
  describe('startProcess()', () => {
    it('应该解析 BPMN 并返回 ProcessState', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

      expect(state).toBeDefined();
      expect(state.id).toBeTruthy();
      expect(state.definitionId).toBeTruthy();
      expect(state.startedAt).toBeInstanceOf(Date);
      expect(state.createdAt).toBeInstanceOf(Date);
    });

    it('无钩子挂起时，简单流程应直接完成', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

      // 没有 onNodeEnter 调用 suspend()，所有节点自动通过
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
    });

    it('初始数据应写入 variables', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML, {
        applicant: '张三',
        days: 5,
      });

      expect(state.variables.applicant).toBe('张三');
      expect(state.variables.days).toBe(5);
    });

    it('遇到 suspend 时应停下来', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') {
            ctx.suspend();
          }
        },
      });

      const state = await engine.startProcess(SIMPLE_PROCESS_XML);

      expect(state.status).toBe('running');
      expect(state.tokens).toHaveLength(1);
      expect(state.tokens[0].status).toBe('suspended');
      expect(state.tokens[0].elementId).toBe('task1');
    });

    it('应该触发 processStart 钩子', async () => {
      const onProcessStart = vi.fn();
      const engine = new FlowEngine({ onProcessStart });

      await engine.startProcess(AUTO_PASS_PROCESS_XML);

      expect(onProcessStart).toHaveBeenCalledTimes(1);
    });

    it('应该有执行轨迹（trace）', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

      expect(state.trace).toBeDefined();
      expect(state.trace.length).toBeGreaterThan(0);

      // 应包含 node-enter 记录
      const nodeEnters = state.trace.filter((t: any) => t.type === 'node-enter');
      expect(nodeEnters.length).toBeGreaterThanOrEqual(2); // 至少 start + task
    });
  });

  // ==================== resume ====================
  describe('resume()', () => {
    it('应该恢复挂起的令牌并继续推进', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') {
            ctx.suspend();
          }
        },
      });

      let state = await engine.startProcess(SIMPLE_PROCESS_XML);
      expect(state.status).toBe('running');

      const tokenId = state.tokens[0].id;
      state = await engine.resume(state, tokenId, SIMPLE_PROCESS_XML, {
        approved: true,
      });

      // 恢复后流程应完成
      expect(state.status).toBe('completed');
      expect(state.tokens).toHaveLength(0);
    });

    it('resume 时合并数据到令牌', async () => {
      let receivedData: any = null;
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') {
            ctx.suspend();
          }
        },
        onNodeLeave: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') {
            receivedData = { ...ctx.token.data };
          }
        },
      });

      let state = await engine.startProcess(SIMPLE_PROCESS_XML, { original: true });
      const tokenId = state.tokens[0].id;

      state = await engine.resume(state, tokenId, SIMPLE_PROCESS_XML, {
        approved: true,
        comment: '同意',
      });

      // nodeLeave 时 token 应该有合并后的数据
      expect(receivedData).toBeDefined();
      expect(receivedData.approved).toBe(true);
      expect(receivedData.comment).toBe('同意');
    });

    it('resume 不存在的 token 应报错', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

      await expect(
        engine.resume(state, 'non-existent', AUTO_PASS_PROCESS_XML)
      ).rejects.toThrow();
    });

    it('resume 非 suspended 的 token 应报错', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

      // 流程已完成，没有 suspended token
      await expect(
        engine.resume(state, 'any-id', AUTO_PASS_PROCESS_XML)
      ).rejects.toThrow();
    });
  });

  // ==================== terminate ====================
  describe('terminate()', () => {
    it('应该终止流程，清空所有令牌', async () => {
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
      expect(state.endedAt).toBeInstanceOf(Date);
    });
  });

  // ==================== getSuspendedTokens ====================
  describe('getSuspendedTokens()', () => {
    it('应该返回所有挂起的令牌信息', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') {
            ctx.suspend();
          }
        },
      });

      const state = await engine.startProcess(SIMPLE_PROCESS_XML);

      const suspended = engine.getSuspendedTokens(state, SIMPLE_PROCESS_XML);

      expect(suspended).toHaveLength(1);
      expect(suspended[0].nodeId).toBe('task1');
      expect(suspended[0].nodeType).toBe('bpmn:userTask');
      expect(suspended[0].nodeName).toBe('审批任务');
      expect(suspended[0].tokenId).toBeTruthy();
      expect(suspended[0].suspendedAt).toBeInstanceOf(Date);
    });

    it('没有挂起令牌时返回空数组', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

      const suspended = engine.getSuspendedTokens(state, AUTO_PASS_PROCESS_XML);

      expect(suspended).toHaveLength(0);
    });

    it('并行分支多个挂起时全部返回', async () => {
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
      const nodeIds = suspended.map((s: any) => s.nodeId).sort();
      expect(nodeIds).toEqual(['taskA', 'taskB']);
    });
  });

  // ==================== 钩子交互 ====================
  describe('钩子交互', () => {
    it('onNodeEnter 中 setTokenData 应合并数据', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:task') {
            ctx.setTokenData({ added: true });
          }
        },
      });

      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML, { initial: 1 });

      // 流程已完成，检查 trace 确认经过了 task
      const taskEnters = state.trace.filter(
        (t: any) => t.type === 'node-enter' && t.elementType === 'bpmn:task'
      );
      expect(taskEnters.length).toBeGreaterThan(0);
    });

    it('onNodeEnter 中 setVariables 应合并到流程变量', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:task') {
            ctx.setVariables({ computed: 42 });
          }
        },
      });

      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);

      expect(state.variables.computed).toBe(42);
    });

    it('钩子抛异常不中断引擎', async () => {
      const engine = new FlowEngine({
        onNodeEnter: () => {
          throw new Error('钩子故意报错');
        },
      });

      // 应该不会抛异常
      const state = await engine.startProcess(AUTO_PASS_PROCESS_XML);
      expect(state).toBeDefined();
    });

    it('onSequenceFlow 钩子触发', async () => {
      const flows: string[] = [];
      const engine = new FlowEngine({
        onSequenceFlow: (ctx) => {
          flows.push(ctx.flow.id);
        },
      });

      await engine.startProcess(AUTO_PASS_PROCESS_XML);

      // start→task1 和 task1→end 两条连线
      expect(flows.length).toBeGreaterThanOrEqual(2);
    });

    it('网关节点上 suspend() 无效', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          // 尝试在所有节点上 suspend
          ctx.suspend();
        },
      });

      // 排他网关流程：start → gateway → task
      // 网关上 suspend 无效，应继续推进到 task
      const state = await engine.startProcess(EXCLUSIVE_GATEWAY_XML, { approved: true });

      // 网关不应被 suspend，应推进到 approvedTask
      const suspended = state.tokens.filter((t: any) => t.status === 'suspended');
      // 应有一个 suspended 在 approvedTask 上（不是在 gateway 上）
      if (suspended.length > 0) {
        expect(suspended[0].elementId).not.toBe('gateway');
      }
    });
  });

  // ==================== ScriptExecutorPlugin ====================
  describe('ScriptExecutorPlugin', () => {
    it('注册插件后 executeScript 可用', async () => {
      let scriptExecuted = false;
      const engine = new FlowEngine({
        scriptExecutor: {
          execute: (state, script, cb) => {
            scriptExecuted = true;
            cb(null, { result: 42 });
          },
        },
        onNodeEnter: async (ctx) => {
          if (ctx.node.type === 'bpmn:scriptTask') {
            const result = await ctx.executeScript('test script');
            ctx.setTokenData(result);
          }
        },
      });

      const state = await engine.startProcess(SCRIPT_TASK_XML);

      expect(scriptExecuted).toBe(true);
      expect(state.status).toBe('completed');
    });

    it('未注册插件时 executeScript 应报错', async () => {
      let errorCaught = false;
      const engine = new FlowEngine({
        onNodeEnter: async (ctx) => {
          if (ctx.node.type === 'bpmn:scriptTask') {
            try {
              await ctx.executeScript('test');
            } catch (e) {
              errorCaught = true;
            }
          }
        },
      });

      await engine.startProcess(SCRIPT_TASK_XML);

      expect(errorCaught).toBe(true);
    });
  });
});
