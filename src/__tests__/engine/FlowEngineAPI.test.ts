/**
 * FlowEngine API 测试
 * 测试 on() / off() / use() 以及边缘场景
 */
import { describe, it, expect, vi } from 'vitest';
import { FlowEngine } from '../../engine/FlowEngine.js';
import type { NodeHookContext, FlowHookContext } from '../../hooks/types.js';

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:process id="p" name="test" isExecutable="true">
    <bpmn:startEvent id="start"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="end" />
    <bpmn:endEvent id="end"><bpmn:incoming>f1</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

describe('FlowEngine API 扩展', () => {

  describe('on() — 动态注册钩子', () => {
    it('通过 on() 注册的 nodeEnter 钩子被触发', async () => {
      const fn = vi.fn();
      const engine = new FlowEngine().on('nodeEnter', fn);
      await engine.startProcess(SIMPLE_XML);
      expect(fn).toHaveBeenCalled();
      expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('支持多个 handler 同时注册', async () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const engine = new FlowEngine()
        .on('nodeEnter', fn1)
        .on('nodeEnter', fn2);
      await engine.startProcess(SIMPLE_XML);
      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });
  });

  describe('off() — 动态注销钩子', () => {
    it('注销后钩子不再被触发', async () => {
      const fn = vi.fn();
      const engine = new FlowEngine().on('nodeEnter', fn);
      engine.off('nodeEnter', fn);
      await engine.startProcess(SIMPLE_XML);
      expect(fn).not.toHaveBeenCalled();
    });

    it('只移除指定 handler，不影响其他', async () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const engine = new FlowEngine()
        .on('nodeEnter', fn1)
        .on('nodeEnter', fn2);
      engine.off('nodeEnter', fn1);
      await engine.startProcess(SIMPLE_XML);
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });
  });

  describe('use() — 插件注册', () => {
    it('插件通过 install 注册钩子并正常触发', async () => {
      const fn = vi.fn();
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        install(engine: FlowEngine) {
          engine.on('nodeEnter', fn);
        },
      };
      const engine = new FlowEngine().use(plugin);
      await engine.startProcess(SIMPLE_XML);
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('terminate() — 终止流程', () => {
    it('终止后状态为 terminated，令牌清零', async () => {
      const engine = new FlowEngine({
        onNodeEnter: (ctx) => {
          if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
        },
      });

      const USER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:process id="p2" name="user" isExecutable="true">
    <bpmn:startEvent id="start"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="task" />
    <bpmn:userTask id="task" name="审批"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="f2" sourceRef="task" targetRef="end" />
    <bpmn:endEvent id="end"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

      let state = await engine.startProcess(USER_XML);
      expect(state.status).toBe('running');
      expect(state.tokens.some(t => t.status === 'suspended')).toBe(true);

      state = engine.terminate(state);
      expect(state.status).toBe('terminated');
      expect(state.tokens).toHaveLength(0);
      expect(state.endedAt).toBeInstanceOf(Date);
    });
  });

  describe('resume — 错误处理', () => {
    it('恢复不存在的令牌抛出错误', async () => {
      const engine = new FlowEngine();
      const state = await engine.startProcess(SIMPLE_XML);

      await expect(
        engine.resume(state, 'non-existent-token', SIMPLE_XML)
      ).rejects.toThrow('not found');
    });
  });

  describe('constructor + on() 混合使用', () => {
    it('构造器注入和 on() 注册的钩子都触发', async () => {
      const ctorFn = vi.fn();
      const dynamicFn = vi.fn();

      const engine = new FlowEngine({ onNodeEnter: ctorFn })
        .on('nodeEnter', dynamicFn);

      await engine.startProcess(SIMPLE_XML);

      expect(ctorFn).toHaveBeenCalled();
      expect(dynamicFn).toHaveBeenCalled();
    });
  });
});
