/**
 * HookManager 单元测试
 * 测试钩子注册、触发、错误隔离
 */
import { describe, it, expect, vi } from 'vitest';
import { HookManager } from '../../hooks/HookManager';

describe('HookManager', () => {

  // ==================== 构造 ====================
  describe('构造', () => {
    it('无参数构造不报错', () => {
      expect(() => new HookManager()).not.toThrow();
    });

    it('空选项构造不报错', () => {
      expect(() => new HookManager({})).not.toThrow();
    });

    it('传入所有钩子构造不报错', () => {
      expect(() => new HookManager({
        onNodeEnter: vi.fn(),
        onNodeLeave: vi.fn(),
        onSequenceFlow: vi.fn(),
        onProcessStart: vi.fn(),
        onProcessEnd: vi.fn(),
      })).not.toThrow();
    });
  });

  // ==================== emit ====================
  describe('emit()', () => {
    it('触发已注册的钩子', async () => {
      const handler = vi.fn();
      const hm = new HookManager({ onNodeEnter: handler });

      const ctx = { state: {}, token: {}, node: {}, definition: {} } as any;
      await hm.emit('nodeEnter', ctx);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(ctx);
    });

    it('未注册的钩子静默跳过', async () => {
      const hm = new HookManager({});

      // 不应抛错
      await expect(hm.emit('nodeEnter', {} as any)).resolves.not.toThrow();
    });

    it('触发 nodeLeave 钩子', async () => {
      const handler = vi.fn();
      const hm = new HookManager({ onNodeLeave: handler });

      await hm.emit('nodeLeave', {} as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('触发 sequenceFlow 钩子', async () => {
      const handler = vi.fn();
      const hm = new HookManager({ onSequenceFlow: handler });

      await hm.emit('sequenceFlow', {} as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('触发 processStart 钩子', async () => {
      const handler = vi.fn();
      const hm = new HookManager({ onProcessStart: handler });

      await hm.emit('processStart', {} as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('触发 processEnd 钩子', async () => {
      const handler = vi.fn();
      const hm = new HookManager({ onProcessEnd: handler });

      await hm.emit('processEnd', {} as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== 错误隔离 ====================
  describe('错误隔离', () => {
    it('钩子抛同步异常不中断引擎', async () => {
      const handler = vi.fn(() => {
        throw new Error('钩子故意报错');
      });
      const hm = new HookManager({ onNodeEnter: handler });

      // 不应抛异常
      await expect(hm.emit('nodeEnter', {} as any)).resolves.not.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('钩子抛异步异常不中断引擎', async () => {
      const handler = vi.fn(async () => {
        throw new Error('异步钩子报错');
      });
      const hm = new HookManager({ onNodeEnter: handler });

      await expect(hm.emit('nodeEnter', {} as any)).resolves.not.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('钩子 reject 不中断引擎', async () => {
      const handler = vi.fn(() => {
        return Promise.reject(new Error('reject'));
      });
      const hm = new HookManager({ onNodeEnter: handler });

      await expect(hm.emit('nodeEnter', {} as any)).resolves.not.toThrow();
    });
  });

  // ==================== async 钩子 ====================
  describe('async 钩子', () => {
    it('支持 async 钩子函数', async () => {
      let completed = false;
      const handler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        completed = true;
      });
      const hm = new HookManager({ onNodeEnter: handler });

      await hm.emit('nodeEnter', {} as any);

      expect(completed).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('支持返回 Promise 的钩子函数', async () => {
      let completed = false;
      const handler = vi.fn(() => {
        return new Promise<void>(resolve => {
          setTimeout(() => {
            completed = true;
            resolve();
          }, 10);
        });
      });
      const hm = new HookManager({ onNodeEnter: handler });

      await hm.emit('nodeEnter', {} as any);

      expect(completed).toBe(true);
    });
  });
});
