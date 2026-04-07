import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceTaskExecutor } from '../../executors/ServiceTaskExecutor';
import { ProcessState } from '../../state/WorkflowState';
import { createTestState, createTestDefinition } from '../../test-utils';
import { ProcessDefinition } from '../../types';

describe('ServiceTaskExecutor', () => {
  let executor: ServiceTaskExecutor;
  let mockDefinition: ProcessDefinition;

  beforeEach(() => {
    executor = new ServiceTaskExecutor();
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
    expect(types).toContain('bpmn:serviceTask');
  });

  it('应执行服务任务并继续流转', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(1);
    expect(newState.tokens[0].elementId).toBe('flow2');
  });

  it('应移除输入令牌', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens.filter(t => t.elementId === 'service1')).toHaveLength(0);
  });

  it('应保持变量不变', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: { data: 'test' },
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.variables).toEqual({ data: 'test' });
  });

  it('应处理没有外出路径的服务任务', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: [],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(0);
  });

  it('应处理带有实现定义的服务任务', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      implementation: 'java:com.example.Service',
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(1);
  });

  it('应处理带有操作定义的服务任务', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      operationRef: 'operation1',
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(1);
  });

  it('应保持流程状态为 running', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.status).toBe('running');
  });

  it('应为新令牌生成唯一 ID', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState1 = executor.execute(state, element, mockDefinition);
    const newState2 = executor.execute(state, element, mockDefinition);

    expect(newState1.tokens[0].id).not.toBe(newState2.tokens[0].id);
  });

  it('应处理带有文档的服务任务', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      documentation: '服务任务文档',
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(1);
  });

  it('应处理带有扩展元素的服务任务', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      extensionElements: {
        customProperty: 'customValue',
      },
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(1);
  });

  it('应处理多个并发服务任务', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [
        { id: 'token1', elementId: 'service1' },
        { id: 'token2', elementId: 'service2' },
      ],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务 1',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens.length).toBeLessThanOrEqual(2);
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
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.tokens).toHaveLength(0);
  });

  it('应处理带有结果变量的服务任务', () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'service1' }],
      items: [],
      variables: { input: 'data' },
      startedAt: new Date(),
    };

    const element = {
      id: 'service1',
      type: 'bpmn:serviceTask',
      name: '调用服务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      resultVariable: 'output',
    };

    const newState = executor.execute(state, element, mockDefinition);

    expect(newState.variables).toEqual({ input: 'data' });
  });
});
