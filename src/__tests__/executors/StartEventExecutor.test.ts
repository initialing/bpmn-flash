import { describe, it, expect, beforeEach } from 'vitest';
import { StartEventExecutor } from '../../executors/StartEventExecutor';
import { ProcessState } from '../../state/WorkflowState';
import { createTestState, createTestDefinition } from '../../test-utils';
import { ProcessDefinition } from '../../types';

// 辅助函数：创建基础测试状态
function createTestState(overrides: Partial<ProcessState> = {}): ProcessState {
  return {
    id: 'test-instance-1',
    name: '测试流程',
    status: 'running',
    createdAt: new Date(),
    definitionId: 'test-process',
    data: {},
    tokens: [],
    items: [],
    variables: {},
    history: [],
    ...overrides,
  };
}

describe('StartEventExecutor', () => {
  let executor: StartEventExecutor;
  let mockDefinition: ProcessDefinition;

  beforeEach(() => {
    executor = new StartEventExecutor();
    mockDefinition = {
      id: 'test-process',
      name: '测试流程',
      elements: new Map(),
      sequenceFlows: [],
      properties: {},
      variables: [],
    } as ProcessDefinition;
  });

  it('应返回支持的元素类型', async () => {
    const types = executor.getSupportedTypes();
    expect(types).toContain('bpmn:startEvent');
  });

  it('应执行开始事件并创建初始令牌', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.tokens).toHaveLength(1);
    expect(newState.tokens[0].elementId).toBe('flow1');
  });

  it('应处理多个外出序列流', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1', 'flow2'],
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.tokens).toHaveLength(2);
  });

  it('应处理没有外出序列流的开始事件', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: [],
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.tokens).toHaveLength(0);
  });

  it('应初始化流程变量', async () => {
    const state = createTestState({ tokens: [], variables: { applicant: '张三' } });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.variables).toEqual({ applicant: '张三' });
  });

  it('应设置流程启动时间', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.startedAt).toBeDefined();
  });

  it('应保持流程状态为 running', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.status).toBe('running');
  });

  it('应生成唯一的令牌 ID', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.tokens[0].id).toBeDefined();
    expect(typeof newState.tokens[0].id).toBe('string');
  });

  it('应处理带有文档信息的开始事件', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
      documentation: '这是开始节点的文档',
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.tokens).toHaveLength(1);
  });

  it('应处理带有扩展元素的开始事件', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
      extensionElements: {
        customProperty: 'customValue',
      },
    };

    const token = { id: 'token1', elementId: element.id, data: state.variables }; const newState = await executor.execute(state, element, token);

    expect(newState.tokens).toHaveLength(1);
  });

  it('连续执行应生成不同的令牌 ID', async () => {
    const state = createTestState({ tokens: [], variables: {} });

    const element = {
      id: 'start1',
      type: 'bpmn:startEvent',
      outgoing: ['flow1'],
    };

    const token1 = { id: 'token1', elementId: element.id, data: state.variables || {} }; const newState1 = await executor.execute(state, element, token1);
    const token2 = { id: 'token2', elementId: element.id, data: state.variables || {} }; const newState2 = await executor.execute(state, element, token2);

    expect(newState1.tokens[0].id).not.toBe(newState2.tokens[0].id);
  });
});
