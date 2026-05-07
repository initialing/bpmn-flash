/**
 * ProcessState 序列化/反序列化测试（v3 版本）
 * 测试 serialize / deserialize 函数
 */
import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from '../../state/ProcessState';

// v3 ProcessState 类型
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
  trace: Array<{
    type: string;
    elementId: string;
    elementType: string;
    elementName?: string;
    tokenId: string;
    timestamp: Date;
    sourceRef?: string;
    targetRef?: string;
    flowId?: string;
  }>;
  _gatewayWait: Record<string, string[]>;
  createdAt: Date;
  startedAt: Date;
  endedAt?: Date;
}

function createSampleState(): ProcessState {
  const now = new Date('2026-05-07T12:00:00Z');
  return {
    id: 'proc-1',
    name: '测试流程',
    status: 'running',
    definitionId: 'def-1',
    variables: { applicant: '张三', days: 5 },
    tokens: [
      {
        id: 'tok-1',
        elementId: 'task1',
        status: 'suspended',
        data: { approved: true },
        createdAt: now,
        suspendedAt: new Date('2026-05-07T12:01:00Z'),
      },
      {
        id: 'tok-2',
        elementId: 'task2',
        status: 'active',
        data: {},
        createdAt: now,
      },
    ],
    trace: [
      {
        type: 'node-enter',
        elementId: 'start',
        elementType: 'bpmn:startEvent',
        elementName: '开始',
        tokenId: 'tok-0',
        timestamp: now,
      },
      {
        type: 'sequence-flow',
        elementId: 'f1',
        elementType: 'sequenceFlow',
        tokenId: 'tok-0',
        timestamp: now,
        sourceRef: 'start',
        targetRef: 'task1',
        flowId: 'f1',
      },
    ],
    _gatewayWait: { 'join-gw': ['tok-1'] },
    createdAt: now,
    startedAt: now,
  };
}

describe('ProcessState 序列化/反序列化', () => {

  describe('serialize()', () => {
    it('应该返回有效的 JSON 字符串', () => {
      const state = createSampleState();
      const json = serialize(state);

      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('Date 应该转换为 ISO 字符串', () => {
      const state = createSampleState();
      const json = serialize(state);
      const parsed = JSON.parse(json);

      expect(typeof parsed.createdAt).toBe('string');
      expect(typeof parsed.startedAt).toBe('string');
      expect(parsed.tokens[0].createdAt).toContain('2026');
      expect(parsed.tokens[0].suspendedAt).toContain('2026');
      expect(parsed.trace[0].timestamp).toContain('2026');
    });

    it('保留所有字段', () => {
      const state = createSampleState();
      const json = serialize(state);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe('proc-1');
      expect(parsed.name).toBe('测试流程');
      expect(parsed.status).toBe('running');
      expect(parsed.definitionId).toBe('def-1');
      expect(parsed.variables.applicant).toBe('张三');
      expect(parsed.tokens).toHaveLength(2);
      expect(parsed.trace).toHaveLength(2);
      expect(parsed._gatewayWait['join-gw']).toEqual(['tok-1']);
    });
  });

  describe('deserialize()', () => {
    it('应该还原所有 Date 字段', () => {
      const state = createSampleState();
      const json = serialize(state);
      const restored = deserialize(json);

      expect(restored.createdAt).toBeInstanceOf(Date);
      expect(restored.startedAt).toBeInstanceOf(Date);
      expect(restored.tokens[0].createdAt).toBeInstanceOf(Date);
      expect(restored.tokens[0].suspendedAt).toBeInstanceOf(Date);
      expect(restored.trace[0].timestamp).toBeInstanceOf(Date);
    });

    it('不带 suspendedAt 的令牌应为 undefined', () => {
      const state = createSampleState();
      const json = serialize(state);
      const restored = deserialize(json);

      expect(restored.tokens[1].suspendedAt).toBeUndefined();
    });

    it('endedAt 为 undefined 时应还原为 undefined', () => {
      const state = createSampleState();
      const json = serialize(state);
      const restored = deserialize(json);

      expect(restored.endedAt).toBeUndefined();
    });

    it('endedAt 有值时应还原为 Date', () => {
      const state = createSampleState();
      state.endedAt = new Date('2026-05-07T13:00:00Z');
      const json = serialize(state);
      const restored = deserialize(json);

      expect(restored.endedAt).toBeInstanceOf(Date);
      expect(restored.endedAt!.toISOString()).toBe('2026-05-07T13:00:00.000Z');
    });
  });

  describe('往返一致性', () => {
    it('serialize → deserialize 后数据应一致', () => {
      const original = createSampleState();
      const json = serialize(original);
      const restored = deserialize(json);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.status).toBe(original.status);
      expect(restored.definitionId).toBe(original.definitionId);
      expect(restored.variables).toEqual(original.variables);
      expect(restored.tokens).toHaveLength(original.tokens.length);
      expect(restored.trace).toHaveLength(original.trace.length);
      expect(restored._gatewayWait).toEqual(original._gatewayWait);

      // Date 值一致
      expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime());
      expect(restored.startedAt.getTime()).toBe(original.startedAt.getTime());
      expect(restored.tokens[0].createdAt.getTime()).toBe(
        original.tokens[0].createdAt.getTime()
      );
    });

    it('多次往返不丢失数据', () => {
      const original = createSampleState();

      let json = serialize(original);
      let restored = deserialize(json);
      json = serialize(restored);
      restored = deserialize(json);

      expect(restored.id).toBe(original.id);
      expect(restored.tokens).toHaveLength(2);
      expect(restored.trace).toHaveLength(2);
    });
  });
});
