import { describe, it, expect, beforeEach } from 'vitest';
import { UserTaskExecutor } from '../../executors/UserTaskExecutor';
import { ProcessState } from '../../state/WorkflowState';
import { createTestState, createTestDefinition } from '../../test-utils';
import { ProcessDefinition } from '../../types';

describe('UserTaskExecutor', () => {
  let executor: UserTaskExecutor;
  let mockDefinition: ProcessDefinition;

  beforeEach(() => {
    executor = new UserTaskExecutor();
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
    expect(types).toContain('bpmn:userTask');
  });

  it('应创建用户任务项', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items).toHaveLength(1);
    expect(newState.items[0].elementId).toBe('task1');
    expect(newState.items[0].type).toBe('bpmn:userTask');
  });

  it('应设置任务状态为 waiting', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items[0].status).toBe('waiting');
  });

  it('应移除输入令牌', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.tokens.filter(t => t.elementId === 'task1')).toHaveLength(0);
  });

  it('应保持变量不变', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: { applicant: '张三' },
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.variables).toEqual({ applicant: '张三' });
  });

  it('应处理带有分配者的任务', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      assignmentDefinition: {
        assignee: '李四',
      },
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items).toHaveLength(1);
    expect(newState.items[0].assignee).toBe('李四');
  });

  it('应处理带有候选用户的任务', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      assignmentDefinition: {
        candidateUsers: ['张三', '李四'],
      },
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items[0].candidateUsers).toEqual(['张三', '李四']);
  });

  it('应处理带有候选组的任务', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      assignmentDefinition: {
        candidateGroups: ['manager', 'admin'],
      },
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items[0].candidateGroups).toEqual(['manager', 'admin']);
  });

  it('应处理带有优先级的任务', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      priority: 80,
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items[0].priority).toBe(80);
  });

  it('应处理带有文档的任务', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
      documentation: '请仔细审核',
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items[0].elementId).toBe('task1');
  });

  it('应处理没有外出路径的任务', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: [],
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items).toHaveLength(1);
    expect(newState.tokens).toHaveLength(0);
  });

  it('应生成唯一的任务 ID', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const token = state.tokens[0]; const newState1 = await executor.execute(state, element, token);
    const newState2 = await executor.execute(state, element, token);

    expect(newState1.items[0].id).not.toBe(newState2.items[0].id);
  });

  it('应设置任务创建时间', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [{ id: 'token1', elementId: 'task1' }],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items[0].createdAt).toBeDefined();
  });

  it('应处理多个并发用户任务', async () => {
    const state: ProcessState = {
      status: 'running',
      tokens: [
        { id: 'token1', elementId: 'task1' },
        { id: 'token2', elementId: 'task2' },
      ],
      items: [],
      variables: {},
      startedAt: new Date(),
    };

    const element = {
      id: 'task1',
      type: 'bpmn:userTask',
      name: '审批任务 1',
      incoming: ['flow1'],
      outgoing: ['flow2'],
    };

    const token = state.tokens[0]; const newState = await executor.execute(state, element, token);

    expect(newState.items).toHaveLength(1);
    expect(newState.tokens).toHaveLength(1);
  });
});
