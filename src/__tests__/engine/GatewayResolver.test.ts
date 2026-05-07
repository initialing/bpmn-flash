/**
 * GatewayResolver 单元测试
 * 测试排他网关、并行网关、包含网关的分支/汇聚逻辑
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GatewayResolver } from '../../engine/GatewayResolver';
import { TokenManager } from '../../engine/TokenManager';
import type { Element, SequenceFlow, ProcessDefinition, Token } from '../../types';

// v3 Token 类型
interface V3Token {
  id: string;
  elementId: string;
  status: 'active' | 'suspended';
  data: Record<string, any>;
  createdAt: Date;
  suspendedAt?: Date;
}

// v3 ProcessState 类型
interface ProcessState {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'terminated';
  definitionId: string;
  variables: Record<string, any>;
  tokens: V3Token[];
  trace: any[];
  _gatewayWait: Record<string, string[]>;
  createdAt: Date;
  startedAt: Date;
  endedAt?: Date;
}

function createState(overrides: Partial<ProcessState> = {}): ProcessState {
  const now = new Date();
  return {
    id: 'test-1',
    name: '测试',
    status: 'running',
    definitionId: 'def-1',
    variables: {},
    tokens: [],
    trace: [],
    _gatewayWait: {},
    createdAt: now,
    startedAt: now,
    ...overrides,
  };
}

function createToken(elementId: string, data: Record<string, any> = {}): V3Token {
  return {
    id: `token-${elementId}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    elementId,
    status: 'active',
    data,
    createdAt: new Date(),
  };
}

function buildDefinition(
  elements: Element[],
  flows: SequenceFlow[]
): ProcessDefinition {
  const elMap = new Map<string, Element>();
  elements.forEach(e => elMap.set(e.id, e));
  const flowMap = new Map<string, SequenceFlow>();
  flows.forEach(f => flowMap.set(f.id, f));
  return { id: 'def-1', name: '测试', elements: elMap, sequenceFlows: flowMap };
}

describe('GatewayResolver', () => {
  let resolver: GatewayResolver;
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager();
    resolver = new GatewayResolver(tokenManager);
  });

  // ==================== 排他网关 ====================
  describe('排他网关（Exclusive Gateway）', () => {
    it('条件为 true 时选择对应分支', () => {
      const gateway: Element = {
        id: 'gw',
        type: 'bpmn:exclusiveGateway',
        name: '排他网关',
        incoming: ['f0'],
        outgoing: ['f1', 'f2'],
        properties: { default: 'f2' },
      };
      const flows: SequenceFlow[] = [
        { id: 'f1', sourceRef: 'gw', targetRef: 'taskA', conditionExpression: '${approved === true}' },
        { id: 'f2', sourceRef: 'gw', targetRef: 'taskB', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway, { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['f1'], outgoing: [], properties: {} },
         { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['f2'], outgoing: [], properties: {} }],
        flows
      );

      const token = createToken('gw', { approved: true });
      const state = createState({
        tokens: [token],
        variables: {},
      });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      // 应选择 f1 → taskA
      expect(newState.tokens).toHaveLength(1);
      expect(newState.tokens[0].elementId).toBe('taskA');
    });

    it('条件都不满足时走 default flow', () => {
      const gateway: Element = {
        id: 'gw',
        type: 'bpmn:exclusiveGateway',
        name: '排他网关',
        incoming: ['f0'],
        outgoing: ['f1', 'f2'],
        properties: { default: 'f2' },
      };
      const flows: SequenceFlow[] = [
        { id: 'f1', sourceRef: 'gw', targetRef: 'taskA', conditionExpression: '${approved === true}' },
        { id: 'f2', sourceRef: 'gw', targetRef: 'taskB', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway, { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['f1'], outgoing: [], properties: {} },
         { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['f2'], outgoing: [], properties: {} }],
        flows
      );

      const token = createToken('gw', { approved: false });
      const state = createState({
        tokens: [token],
        variables: {},
      });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      // 应走 default → taskB
      expect(newState.tokens).toHaveLength(1);
      expect(newState.tokens[0].elementId).toBe('taskB');
    });

    it('单出口时无条件通过', () => {
      const gateway: Element = {
        id: 'gw',
        type: 'bpmn:exclusiveGateway',
        name: '网关',
        incoming: ['f0'],
        outgoing: ['f1'],
        properties: {},
      };
      const flows: SequenceFlow[] = [
        { id: 'f1', sourceRef: 'gw', targetRef: 'end', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway, { id: 'end', type: 'bpmn:endEvent', name: '结束', incoming: ['f1'], outgoing: [], properties: {} }],
        flows
      );

      const token = createToken('gw');
      const state = createState({ tokens: [token] });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      expect(newState.tokens).toHaveLength(1);
      expect(newState.tokens[0].elementId).toBe('end');
    });

    it('无条件的 flow 视为 true', () => {
      const gateway: Element = {
        id: 'gw',
        type: 'bpmn:exclusiveGateway',
        name: '网关',
        incoming: ['f0'],
        outgoing: ['f1', 'f2'],
        properties: {},
      };
      const flows: SequenceFlow[] = [
        { id: 'f1', sourceRef: 'gw', targetRef: 'taskA', conditionExpression: null },
        { id: 'f2', sourceRef: 'gw', targetRef: 'taskB', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway,
         { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['f1'], outgoing: [], properties: {} },
         { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['f2'], outgoing: [], properties: {} }],
        flows
      );

      const token = createToken('gw');
      const state = createState({ tokens: [token] });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      // 应选第一条无条件 flow → taskA
      expect(newState.tokens).toHaveLength(1);
      expect(newState.tokens[0].elementId).toBe('taskA');
    });

    it('销毁原令牌', () => {
      const gateway: Element = {
        id: 'gw',
        type: 'bpmn:exclusiveGateway',
        name: '网关',
        incoming: ['f0'],
        outgoing: ['f1'],
        properties: {},
      };
      const flows: SequenceFlow[] = [
        { id: 'f1', sourceRef: 'gw', targetRef: 'end', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway, { id: 'end', type: 'bpmn:endEvent', name: '结束', incoming: ['f1'], outgoing: [], properties: {} }],
        flows
      );

      const token = createToken('gw');
      const state = createState({ tokens: [token] });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      // 新令牌 id 不同于原令牌
      expect(newState.tokens[0].id).not.toBe(token.id);
    });
  });

  // ==================== 并行网关 ====================
  describe('并行网关（Parallel Gateway）', () => {
    it('分裂模式：向所有出边创建令牌', () => {
      const gateway: Element = {
        id: 'fork',
        type: 'bpmn:parallelGateway',
        name: '分叉',
        incoming: ['f0'],
        outgoing: ['f1', 'f2'],
        properties: {},
      };
      const flows: SequenceFlow[] = [
        { id: 'f1', sourceRef: 'fork', targetRef: 'taskA', conditionExpression: null },
        { id: 'f2', sourceRef: 'fork', targetRef: 'taskB', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway,
         { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['f1'], outgoing: [], properties: {} },
         { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['f2'], outgoing: [], properties: {} }],
        flows
      );

      const token = createToken('fork', { shared: true });
      const state = createState({ tokens: [token] });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      expect(newState.tokens).toHaveLength(2);
      const elementIds = newState.tokens.map(t => t.elementId).sort();
      expect(elementIds).toEqual(['taskA', 'taskB']);
      // 每个新令牌携带原数据
      expect(newState.tokens[0].data).toEqual({ shared: true });
      expect(newState.tokens[1].data).toEqual({ shared: true });
    });

    it('汇聚模式：等待所有入边令牌到达', () => {
      const gateway: Element = {
        id: 'join',
        type: 'bpmn:parallelGateway',
        name: '汇聚',
        incoming: ['f1', 'f2'],
        outgoing: ['f3'],
        properties: {},
      };
      const flows: SequenceFlow[] = [
        { id: 'f3', sourceRef: 'join', targetRef: 'end', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway, { id: 'end', type: 'bpmn:endEvent', name: '结束', incoming: ['f3'], outgoing: [], properties: {} }],
        flows
      );

      // 第一个令牌到达
      const token1 = createToken('join');
      const state1 = createState({ tokens: [token1] });

      const afterFirst = resolver.resolve(state1, token1 as any, gateway, definition as any);

      // 只有一个到达，不应产生新令牌（出口方向）
      expect(afterFirst.tokens).toHaveLength(0);
      // 但 _gatewayWait 应有记录
      expect(afterFirst._gatewayWait['join']).toBeTruthy();
    });

    it('汇聚模式：所有令牌到达后向下游发令牌', () => {
      const gateway: Element = {
        id: 'join',
        type: 'bpmn:parallelGateway',
        name: '汇聚',
        incoming: ['f1', 'f2'],
        outgoing: ['f3'],
        properties: {},
      };
      const flows: SequenceFlow[] = [
        { id: 'f3', sourceRef: 'join', targetRef: 'end', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway, { id: 'end', type: 'bpmn:endEvent', name: '结束', incoming: ['f3'], outgoing: [], properties: {} }],
        flows
      );

      // 第一个令牌到达
      const token1 = createToken('join');
      let state = createState({ tokens: [token1] });
      state = resolver.resolve(state, token1 as any, gateway, definition as any);

      // 第二个令牌到达
      const token2 = createToken('join');
      state = { ...state, tokens: [...state.tokens, token2] };
      state = resolver.resolve(state, token2 as any, gateway, definition as any);

      // 两个都到达，应向 end 创建令牌
      expect(state.tokens).toHaveLength(1);
      expect(state.tokens[0].elementId).toBe('end');
      // _gatewayWait 应被清空
      expect(state._gatewayWait['join']).toBeUndefined();
    });
  });

  // ==================== 包含网关 ====================
  describe('包含网关（Inclusive Gateway）', () => {
    it('分裂模式：所有满足条件的分支都走', () => {
      const gateway: Element = {
        id: 'igw',
        type: 'bpmn:inclusiveGateway',
        name: '包含网关',
        incoming: ['f0'],
        outgoing: ['fA', 'fB', 'fC'],
        properties: { default: 'fC' },
      };
      const flows: SequenceFlow[] = [
        { id: 'fA', sourceRef: 'igw', targetRef: 'taskA', conditionExpression: '${amount > 100}' },
        { id: 'fB', sourceRef: 'igw', targetRef: 'taskB', conditionExpression: '${amount > 500}' },
        { id: 'fC', sourceRef: 'igw', targetRef: 'taskC', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway,
         { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['fA'], outgoing: [], properties: {} },
         { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['fB'], outgoing: [], properties: {} },
         { id: 'taskC', type: 'bpmn:userTask', name: 'C', incoming: ['fC'], outgoing: [], properties: {} }],
        flows
      );

      // amount = 1000 → A 和 B 都满足
      const token = createToken('igw', { amount: 1000 });
      const state = createState({
        tokens: [token],
        variables: {},
      });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      const elementIds = newState.tokens.map(t => t.elementId).sort();
      expect(elementIds).toEqual(['taskA', 'taskB']);
    });

    it('分裂模式：只有部分条件满足', () => {
      const gateway: Element = {
        id: 'igw',
        type: 'bpmn:inclusiveGateway',
        name: '包含网关',
        incoming: ['f0'],
        outgoing: ['fA', 'fB', 'fC'],
        properties: { default: 'fC' },
      };
      const flows: SequenceFlow[] = [
        { id: 'fA', sourceRef: 'igw', targetRef: 'taskA', conditionExpression: '${amount > 100}' },
        { id: 'fB', sourceRef: 'igw', targetRef: 'taskB', conditionExpression: '${amount > 500}' },
        { id: 'fC', sourceRef: 'igw', targetRef: 'taskC', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway,
         { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['fA'], outgoing: [], properties: {} },
         { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['fB'], outgoing: [], properties: {} },
         { id: 'taskC', type: 'bpmn:userTask', name: 'C', incoming: ['fC'], outgoing: [], properties: {} }],
        flows
      );

      // amount = 200 → 只有 A 满足
      const token = createToken('igw', { amount: 200 });
      const state = createState({
        tokens: [token],
        variables: {},
      });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      expect(newState.tokens).toHaveLength(1);
      expect(newState.tokens[0].elementId).toBe('taskA');
    });

    it('分裂模式：无条件满足时走 default', () => {
      const gateway: Element = {
        id: 'igw',
        type: 'bpmn:inclusiveGateway',
        name: '包含网关',
        incoming: ['f0'],
        outgoing: ['fA', 'fB', 'fC'],
        properties: { default: 'fC' },
      };
      const flows: SequenceFlow[] = [
        { id: 'fA', sourceRef: 'igw', targetRef: 'taskA', conditionExpression: '${amount > 100}' },
        { id: 'fB', sourceRef: 'igw', targetRef: 'taskB', conditionExpression: '${amount > 500}' },
        { id: 'fC', sourceRef: 'igw', targetRef: 'taskC', conditionExpression: null },
      ];
      const definition = buildDefinition(
        [gateway,
         { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['fA'], outgoing: [], properties: {} },
         { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['fB'], outgoing: [], properties: {} },
         { id: 'taskC', type: 'bpmn:userTask', name: 'C', incoming: ['fC'], outgoing: [], properties: {} }],
        flows
      );

      // amount = 50 → A 和 B 都不满足 → 走 default fC
      const token = createToken('igw', { amount: 50 });
      const state = createState({
        tokens: [token],
        variables: {},
      });

      const newState = resolver.resolve(state, token as any, gateway, definition as any);

      expect(newState.tokens).toHaveLength(1);
      expect(newState.tokens[0].elementId).toBe('taskC');
    });
  });
});
