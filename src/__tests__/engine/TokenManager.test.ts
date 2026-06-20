/**
 * TokenManager 单元测试
 * 测试令牌的创建、挂起、恢复、销毁、移动、更新数据
 * 重点验证不可变性：每个操作返回新 state，不修改原 state
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenManager } from '../../engine/TokenManager';

// v3 ProcessState 类型（按设计文档定义）
interface ProcessState {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'terminated';
  definitionId: string;
  variables: Record<string, any>;
  tokens: Array<{
    id: string;
    elementId: string;
    status: 'active' | 'suspended';
    data: Record<string, any>;
    createdAt: Date;
    suspendedAt?: Date;
  }>;
  trace: any[];
  _gatewayWait: Record<string, string[]>;
  createdAt: Date;
  startedAt: Date;
  endedAt?: Date;
}

function createEmptyState(): ProcessState {
  const now = new Date();
  return {
    id: 'test-1',
    name: '测试流程',
    status: 'running',
    definitionId: 'def-1',
    variables: {},
    tokens: [],
    trace: [],
    _gatewayWait: {},
    createdAt: now,
    startedAt: now,
  };
}

describe('TokenManager', () => {
  let tm: TokenManager;
  let state: ProcessState;

  beforeEach(() => {
    tm = new TokenManager();
    state = createEmptyState();
  });

  // ==================== createToken ====================
  describe('createToken', () => {
    it('应该在指定节点创建一个 active 令牌', () => {
      const newState = tm.createToken(state, 'start', { key: 'value' });

      expect(newState.tokens).toHaveLength(1);
      expect(newState.tokens[0].elementId).toBe('start');
      expect(newState.tokens[0].status).toBe('active');
      expect(newState.tokens[0].data).toEqual({ key: 'value' });
      expect(newState.tokens[0].id).toBeTruthy();
      expect(newState.tokens[0].createdAt).toBeInstanceOf(Date);
    });

    it('不传 data 时默认为空对象', () => {
      const newState = tm.createToken(state, 'start');

      expect(newState.tokens[0].data).toEqual({});
    });

    it('不可变性：不修改原 state', () => {
      const originalTokens = [...state.tokens];
      const newState = tm.createToken(state, 'start', {});

      expect(state.tokens).toEqual(originalTokens);
      expect(state.tokens).toHaveLength(0);
      expect(newState.tokens).toHaveLength(1);
      expect(newState).not.toBe(state);
    });

    it('连续创建多个令牌', () => {
      let s = tm.createToken(state, 'nodeA', { a: 1 });
      s = tm.createToken(s, 'nodeB', { b: 2 });

      expect(s.tokens).toHaveLength(2);
      expect(s.tokens[0].elementId).toBe('nodeA');
      expect(s.tokens[1].elementId).toBe('nodeB');
    });

    it('每个令牌有唯一的 id', () => {
      let s = tm.createToken(state, 'nodeA');
      s = tm.createToken(s, 'nodeB');

      expect(s.tokens[0].id).not.toBe(s.tokens[1].id);
    });
  });

  // ==================== suspendToken ====================
  describe('suspendToken', () => {
    it('应该将 active 令牌变为 suspended', () => {
      let s = tm.createToken(state, 'task1');
      const tokenId = s.tokens[0].id;

      s = tm.suspendToken(s, tokenId);

      expect(s.tokens[0].status).toBe('suspended');
      expect(s.tokens[0].suspendedAt).toBeInstanceOf(Date);
    });

    it('不可变性：不修改原 state', () => {
      let s = tm.createToken(state, 'task1');
      const tokenId = s.tokens[0].id;
      const beforeSuspend = { ...s };

      const afterSuspend = tm.suspendToken(s, tokenId);

      // 原 state 的 token 仍为 active
      expect(s.tokens[0].status).toBe('active');
      expect(afterSuspend.tokens[0].status).toBe('suspended');
      expect(afterSuspend).not.toBe(s);
    });

    it('不影响其他令牌', () => {
      let s = tm.createToken(state, 'taskA');
      s = tm.createToken(s, 'taskB');
      const tokenAId = s.tokens[0].id;

      s = tm.suspendToken(s, tokenAId);

      expect(s.tokens[0].status).toBe('suspended');
      expect(s.tokens[1].status).toBe('active');
    });
  });

  // ==================== resumeToken ====================
  describe('resumeToken', () => {
    it('应该将 suspended 令牌恢复为 active', () => {
      let s = tm.createToken(state, 'task1');
      const tokenId = s.tokens[0].id;
      s = tm.suspendToken(s, tokenId);

      s = tm.resumeToken(s, tokenId);

      expect(s.tokens[0].status).toBe('active');
      expect(s.tokens[0].suspendedAt).toBeUndefined();
    });

    it('恢复时合并数据', () => {
      let s = tm.createToken(state, 'task1', { original: true });
      const tokenId = s.tokens[0].id;
      s = tm.suspendToken(s, tokenId);

      s = tm.resumeToken(s, tokenId, { approved: true, comment: '同意' });

      expect(s.tokens[0].data).toEqual({
        original: true,
        approved: true,
        comment: '同意',
      });
    });

    it('不传 data 时保留原有数据', () => {
      let s = tm.createToken(state, 'task1', { key: 'val' });
      const tokenId = s.tokens[0].id;
      s = tm.suspendToken(s, tokenId);

      s = tm.resumeToken(s, tokenId);

      expect(s.tokens[0].data).toEqual({ key: 'val' });
    });

    it('不可变性：不修改原 state', () => {
      let s = tm.createToken(state, 'task1');
      const tokenId = s.tokens[0].id;
      s = tm.suspendToken(s, tokenId);
      const suspendedState = s;

      const resumed = tm.resumeToken(s, tokenId, { x: 1 });

      expect(suspendedState.tokens[0].status).toBe('suspended');
      expect(resumed.tokens[0].status).toBe('active');
    });
  });

  // ==================== destroyToken ====================
  describe('destroyToken', () => {
    it('应该从列表中移除令牌', () => {
      let s = tm.createToken(state, 'task1');
      const tokenId = s.tokens[0].id;

      s = tm.destroyToken(s, tokenId);

      expect(s.tokens).toHaveLength(0);
    });

    it('只移除指定令牌，不影响其他', () => {
      let s = tm.createToken(state, 'taskA');
      s = tm.createToken(s, 'taskB');
      const tokenAId = s.tokens[0].id;

      s = tm.destroyToken(s, tokenAId);

      expect(s.tokens).toHaveLength(1);
      expect(s.tokens[0].elementId).toBe('taskB');
    });

    it('不可变性：不修改原 state', () => {
      let s = tm.createToken(state, 'task1');
      const tokenId = s.tokens[0].id;
      const before = s;

      const after = tm.destroyToken(s, tokenId);

      expect(before.tokens).toHaveLength(1);
      expect(after.tokens).toHaveLength(0);
    });
  });

  // ==================== moveToken ====================
  describe('moveToken', () => {
    it('应该将令牌移动到另一个节点', () => {
      let s = tm.createToken(state, 'nodeA');
      const tokenId = s.tokens[0].id;

      s = tm.moveToken(s, tokenId, 'nodeB');

      expect(s.tokens[0].elementId).toBe('nodeB');
    });

    it('不可变性：不修改原 state', () => {
      let s = tm.createToken(state, 'nodeA');
      const tokenId = s.tokens[0].id;
      const before = s;

      const after = tm.moveToken(s, tokenId, 'nodeB');

      expect(before.tokens[0].elementId).toBe('nodeA');
      expect(after.tokens[0].elementId).toBe('nodeB');
    });

    it('保留令牌的其他属性', () => {
      let s = tm.createToken(state, 'nodeA', { key: 'val' });
      const tokenId = s.tokens[0].id;

      s = tm.moveToken(s, tokenId, 'nodeB');

      expect(s.tokens[0].data).toEqual({ key: 'val' });
      expect(s.tokens[0].status).toBe('active');
      expect(s.tokens[0].id).toBe(tokenId);
    });
  });

  // ==================== updateTokenData ====================
  describe('updateTokenData', () => {
    it('应该合并数据到令牌的 data 字段', () => {
      let s = tm.createToken(state, 'task1', { a: 1 });
      const tokenId = s.tokens[0].id;

      s = tm.updateTokenData(s, tokenId, { b: 2 });

      expect(s.tokens[0].data).toEqual({ a: 1, b: 2 });
    });

    it('新数据覆盖同名旧数据', () => {
      let s = tm.createToken(state, 'task1', { a: 1, b: 'old' });
      const tokenId = s.tokens[0].id;

      s = tm.updateTokenData(s, tokenId, { b: 'new', c: 3 });

      expect(s.tokens[0].data).toEqual({ a: 1, b: 'new', c: 3 });
    });

    it('不可变性：不修改原 state', () => {
      let s = tm.createToken(state, 'task1', { a: 1 });
      const tokenId = s.tokens[0].id;
      const before = s;

      const after = tm.updateTokenData(s, tokenId, { b: 2 });

      expect(before.tokens[0].data).toEqual({ a: 1 });
      expect(after.tokens[0].data).toEqual({ a: 1, b: 2 });
    });
  });
});
