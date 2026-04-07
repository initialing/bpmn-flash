import { describe, it, expect, beforeEach } from 'vitest';
import { ParallelGatewayExecutor } from '../../executors/ParallelGatewayExecutor';
import { ProcessState } from '../../state/WorkflowState';
import { createTestState, createTestDefinition } from '../../test-utils';
import { ProcessDefinition } from '../../types';

describe('ParallelGatewayExecutor', () => {
  let executor: ParallelGatewayExecutor;
  let mockDefinition: ProcessDefinition;

  beforeEach(() => {
    executor = new ParallelGatewayExecutor();
    mockDefinition = {
      id: 'test-process',
      name: '测试流程',
      elements: new Map(),
      sequenceFlows: [],
      properties: {},
      variables: [],
    } as ProcessDefinition;
  });

  it('应返回支持的元素类型', () => {
    const types = executor.getSupportedTypes();
    expect(types).toContain('bpmn:parallelGateway');
  });

  it('应在分叉时创建多个令牌', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(2);
    expect(newState.tokens.map(t => t.elementId)).toEqual(['flow2', 'flow3']);
  });

  it('应在汇聚时等待所有输入令牌', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [
        { id: 'token1', elementId: 'gateway1' },
        { id: 'token2', elementId: 'gateway1' },
      ],
      items: [],
      variables: {},
      startedAt: new Date(),
      activeTokens: 2,
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow2', 'flow3'],
      outgoing: ['flow4'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(1);
    expect(newState.tokens[0].elementId).toBe('flow4');
  });

  it('应处理单个外出路径的分叉', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(1);
    expect(newState.tokens[0].elementId).toBe('flow2');
  });

  it('应处理三个外出路径的分叉', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3', 'flow4'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(3);
  });

  it('应移除输入令牌', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens.filter(t => t.elementId === 'gateway1')).toHaveLength(0);
  });

  it('应保持变量不变', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: { test: 'value' },
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.variables).toEqual({ test: 'value' });
  });

  it('应处理没有外出路径的网关', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: [],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(0);
  });

  it('应处理空令牌数组', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(0);
  });

  it('应为每个新令牌生成唯一 ID', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    const tokenIds = newState.tokens.map(t => t.id);
    expect(new Set(tokenIds).size).toBe(tokenIds.length);
  });

  it('应保持流程状态为 running', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.status).toBe('running');
  });

  it('应处理带有文档的网关', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3'],
      documentation: '并行网关文档',
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(2);
  });

  it('应处理带有扩展元素的网关', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3'],
      extensionElements: {
        customProperty: 'customValue',
      },
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(2);
  });

  it('应处理复杂并行网关场景', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'gateway1' }],
      items: [],
      variables: { applicant: '张三', amount: 1000 },
      startedAt: new Date(),
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow1'],
      outgoing: ['flow2', 'flow3', 'flow4', 'flow5'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(4);
    expect(newState.variables).toEqual({ applicant: '张三', amount: 1000 });
  });

  it('汇聚时应只消耗一个令牌当还有未完成路径', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [
        { id: 'token1', elementId: 'gateway1' },
        { id: 'token2', elementId: 'task1' },
      ],
      items: [],
      variables: {},
      startedAt: new Date(),
      activeTokens: 2,
    };

    const element = {
      id: 'gateway1',
      type: 'bpmn:parallelGateway',
      incoming: ['flow2', 'flow3'],
      outgoing: ['flow4'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens.length).toBeLessThan(2);
  });
});
