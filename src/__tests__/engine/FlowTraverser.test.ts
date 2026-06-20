/**
 * FlowTraverser 单元测试
 * 测试连线遍历：令牌沿 SequenceFlow 移动 + 触发 onSequenceFlow 钩子
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlowTraverser } from '../../engine/FlowTraverser';
import { TokenManager } from '../../engine/TokenManager';
import { HookManager } from '../../hooks/HookManager';
import type { Element, SequenceFlow, ProcessDefinition } from '../../types';

// v3 类型
interface V3Token {
  id: string;
  elementId: string;
  status: 'active' | 'suspended';
  data: Record<string, any>;
  createdAt: Date;
  suspendedAt?: Date;
}

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

function createState(tokens: V3Token[] = []): ProcessState {
  const now = new Date();
  return {
    id: 'test-1',
    name: '测试',
    status: 'running',
    definitionId: 'def-1',
    variables: {},
    tokens,
    trace: [],
    _gatewayWait: {},
    createdAt: now,
    startedAt: now,
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

describe('FlowTraverser', () => {
  let traverser: FlowTraverser;
  let tokenManager: TokenManager;
  let hooks: HookManager;

  beforeEach(() => {
    tokenManager = new TokenManager();
    hooks = new HookManager({});
    traverser = new FlowTraverser(tokenManager, hooks);
  });

  it('应该销毁当前令牌并在目标节点创建新令牌', async () => {
    const startNode: Element = {
      id: 'start',
      type: 'bpmn:startEvent',
      name: '开始',
      incoming: [],
      outgoing: ['f1'],
      properties: {},
    };
    const taskNode: Element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '任务',
      incoming: ['f1'],
      outgoing: [],
      properties: {},
    };
    const flow: SequenceFlow = {
      id: 'f1',
      sourceRef: 'start',
      targetRef: 'task1',
      conditionExpression: null,
    };

    const definition = buildDefinition([startNode, taskNode], [flow]);

    const token: V3Token = {
      id: 'tok-1',
      elementId: 'start',
      status: 'active',
      data: { key: 'val' },
      createdAt: new Date(),
    };
    const state = createState([token]);

    const newState = await traverser.traverse(
      state as any, token as any, startNode, definition as any
    );

    // 原令牌被销毁，新令牌在 task1
    expect(newState.tokens.some((t: any) => t.id === 'tok-1')).toBe(false);
    expect(newState.tokens).toHaveLength(1);
    expect(newState.tokens[0].elementId).toBe('task1');
    // 数据被传递
    expect(newState.tokens[0].data).toEqual({ key: 'val' });
  });

  it('多条出边时为每条创建新令牌', async () => {
    const node: Element = {
      id: 'node1',
      type: 'bpmn:task',
      name: '任务',
      incoming: [],
      outgoing: ['f1', 'f2'],
      properties: {},
    };
    const flows: SequenceFlow[] = [
      { id: 'f1', sourceRef: 'node1', targetRef: 'taskA', conditionExpression: null },
      { id: 'f2', sourceRef: 'node1', targetRef: 'taskB', conditionExpression: null },
    ];
    const definition = buildDefinition(
      [node,
       { id: 'taskA', type: 'bpmn:userTask', name: 'A', incoming: ['f1'], outgoing: [], properties: {} },
       { id: 'taskB', type: 'bpmn:userTask', name: 'B', incoming: ['f2'], outgoing: [], properties: {} }],
      flows
    );

    const token: V3Token = {
      id: 'tok-1',
      elementId: 'node1',
      status: 'active',
      data: {},
      createdAt: new Date(),
    };
    const state = createState([token]);

    const newState = await traverser.traverse(
      state as any, token as any, node, definition as any
    );

    expect(newState.tokens).toHaveLength(2);
    const ids = newState.tokens.map((t: any) => t.elementId).sort();
    expect(ids).toEqual(['taskA', 'taskB']);
  });

  it('没有出边时只销毁令牌', async () => {
    const node: Element = {
      id: 'deadEnd',
      type: 'bpmn:task',
      name: '死路',
      incoming: ['f0'],
      outgoing: [],
      properties: {},
    };
    const definition = buildDefinition([node], []);

    const token: V3Token = {
      id: 'tok-1',
      elementId: 'deadEnd',
      status: 'active',
      data: {},
      createdAt: new Date(),
    };
    const state = createState([token]);

    const newState = await traverser.traverse(
      state as any, token as any, node, definition as any
    );

    expect(newState.tokens).toHaveLength(0);
  });

  it('应该触发 onSequenceFlow 钩子', async () => {
    const sequenceFlowHandler = vi.fn();
    hooks = new HookManager({ onSequenceFlow: sequenceFlowHandler });
    traverser = new FlowTraverser(tokenManager, hooks);

    const startNode: Element = {
      id: 'start',
      type: 'bpmn:startEvent',
      name: '开始',
      incoming: [],
      outgoing: ['f1'],
      properties: {},
    };
    const taskNode: Element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '任务',
      incoming: ['f1'],
      outgoing: [],
      properties: {},
    };
    const flow: SequenceFlow = {
      id: 'f1',
      sourceRef: 'start',
      targetRef: 'task1',
      conditionExpression: null,
    };

    const definition = buildDefinition([startNode, taskNode], [flow]);

    const token: V3Token = {
      id: 'tok-1',
      elementId: 'start',
      status: 'active',
      data: {},
      createdAt: new Date(),
    };
    const state = createState([token]);

    await traverser.traverse(state as any, token as any, startNode, definition as any);

    expect(sequenceFlowHandler).toHaveBeenCalledTimes(1);
    const ctx = sequenceFlowHandler.mock.calls[0][0];
    expect(ctx.flow.id).toBe('f1');
    expect(ctx.sourceNode.id).toBe('start');
    expect(ctx.targetNode.id).toBe('task1');
  });

  it('应该记录 trace', async () => {
    const startNode: Element = {
      id: 'start',
      type: 'bpmn:startEvent',
      name: '开始',
      incoming: [],
      outgoing: ['f1'],
      properties: {},
    };
    const taskNode: Element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '任务',
      incoming: ['f1'],
      outgoing: [],
      properties: {},
    };
    const flow: SequenceFlow = {
      id: 'f1',
      sourceRef: 'start',
      targetRef: 'task1',
      conditionExpression: null,
    };

    const definition = buildDefinition([startNode, taskNode], [flow]);

    const token: V3Token = {
      id: 'tok-1',
      elementId: 'start',
      status: 'active',
      data: {},
      createdAt: new Date(),
    };
    const state = createState([token]);

    const newState = await traverser.traverse(
      state as any, token as any, startNode, definition as any
    );

    // 应有 sequence-flow trace
    const flowTraces = newState.trace.filter((t: any) => t.type === 'sequence-flow');
    expect(flowTraces).toHaveLength(1);
    expect(flowTraces[0].elementId).toBe('f1');
    expect(flowTraces[0].sourceRef).toBe('start');
    expect(flowTraces[0].targetRef).toBe('task1');
  });
});
