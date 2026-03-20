/**
 * WorkflowValidators 单元测试
 * 测试 Zod Schema 验证器的功能
 */

import { describe, it, expect } from 'vitest';
import {
  WorkflowValidator,
  WorkflowValidationError,
  ProcessDefinitionSchema,
  ProcessStateSchema,
  ExecuteRequestSchema,
  BPMNNodeSchema,
  SequenceFlowSchema
} from '../../validators/WorkflowValidators.js';

describe('WorkflowValidators', () => {
  describe('BPMNNodeSchema', () => {
    it('应该验证有效的 BPMN 节点', () => {
      const validNode = {
        id: 'task-1',
        type: 'userTask',
        name: '审批任务',
        incoming: ['flow-1'],
        outgoing: ['flow-2']
      };

      const result = BPMNNodeSchema.safeParse(validNode);
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的节点类型', () => {
      const invalidNode = {
        id: 'task-1',
        type: 'invalidType',  // 不支持的类型
        name: '测试任务'
      };

      const result = BPMNNodeSchema.safeParse(invalidNode);
      expect(result.success).toBe(false);
    });

    it('应该拒绝空 ID', () => {
      const invalidNode = {
        id: '',  // 空 ID
        type: 'userTask',
        name: '测试任务'
      };

      const result = BPMNNodeSchema.safeParse(invalidNode);
      expect(result.success).toBe(false);
    });
  });

  describe('SequenceFlowSchema', () => {
    it('应该验证有效的顺序流', () => {
      const validFlow = {
        id: 'flow-1',
        sourceRef: 'task-1',
        targetRef: 'task-2',
        conditionExpression: '${amount > 1000}'
      };

      const result = SequenceFlowSchema.safeParse(validFlow);
      expect(result.success).toBe(true);
    });

    it('应该拒绝缺少 sourceRef 的顺序流', () => {
      const invalidFlow = {
        id: 'flow-1',
        targetRef: 'task-2'
        // 缺少 sourceRef
      };

      const result = SequenceFlowSchema.safeParse(invalidFlow);
      expect(result.success).toBe(false);
    });
  });

  describe('ProcessDefinitionSchema', () => {
    it('应该验证有效的流程定义', () => {
      const validDefinition = {
        id: 'process-1',
        key: 'approval-process',
        version: 1,
        name: '审批流程',
        nodes: [
          {
            id: 'start',
            type: 'startEvent',
            name: '开始',
            incoming: [],
            outgoing: ['flow-1']
          },
          {
            id: 'task-1',
            type: 'userTask',
            name: '审批',
            incoming: ['flow-1'],
            outgoing: ['flow-2']
          },
          {
            id: 'end',
            type: 'endEvent',
            name: '结束',
            incoming: ['flow-2'],
            outgoing: []
          }
        ],
        flows: [
          {
            id: 'flow-1',
            sourceRef: 'start',
            targetRef: 'task-1'
          },
          {
            id: 'flow-2',
            sourceRef: 'task-1',
            targetRef: 'end'
          }
        ]
      };

      const result = ProcessDefinitionSchema.safeParse(validDefinition);
      expect(result.success).toBe(true);
    });

    it('应该拒绝没有节点的流程定义', () => {
      const invalidDefinition = {
        id: 'process-1',
        key: 'test',
        version: 1,
        name: '测试流程',
        nodes: []  // 空节点数组
      };

      const result = ProcessDefinitionSchema.safeParse(invalidDefinition);
      expect(result.success).toBe(false);
    });

    it('应该拒绝版本号非正整数的流程定义', () => {
      const invalidDefinition = {
        id: 'process-1',
        key: 'test',
        version: -1,  // 负数
        name: '测试流程',
        nodes: [{ id: 'start', type: 'startEvent', name: '开始' }]
      };

      const result = ProcessDefinitionSchema.safeParse(invalidDefinition);
      expect(result.success).toBe(false);
    });
  });

  describe('ProcessStateSchema', () => {
    it('应该验证有效的流程状态', () => {
      const validState = {
        id: 'instance-1',
        name: '审批流程实例',
        status: 'running',
        createdAt: new Date(),
        definitionId: 'process-1',
        data: {},
        tokens: [],
        items: [],
        variables: {},
        history: []
      };

      const result = ProcessStateSchema.safeParse(validState);
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的状态', () => {
      const invalidState = {
        id: 'instance-1',
        name: '测试',
        status: 'invalid-status',  // 无效状态
        createdAt: new Date(),
        definitionId: 'process-1'
      };

      const result = ProcessStateSchema.safeParse(invalidState);
      expect(result.success).toBe(false);
    });
  });

  describe('ExecuteRequestSchema', () => {
    it('应该验证有效的执行请求', () => {
      const validRequest = {
        processDefinition: {
          id: 'process-1',
          key: 'test',
          version: 1,
          name: '测试流程',
          nodes: [{ id: 'start', type: 'startEvent', name: '开始', incoming: [], outgoing: [] }]
        },
        currentState: null,
        action: {
          type: 'START_PROCESS',
          payload: {},
          timestamp: new Date()
        }
      };

      const result = ExecuteRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('应该验证带版本号乐观锁的执行请求', () => {
      const validRequest = {
        processDefinition: {
          id: 'process-1',
          key: 'test',
          version: 1,
          name: '测试流程',
          nodes: [{ id: 'start', type: 'startEvent', name: '开始', incoming: [], outgoing: [] }],
          flows: []
        },
        currentState: {
          id: 'instance-1',
          name: '测试',
          status: 'running',
          createdAt: new Date(),
          startedAt: new Date(),
          definitionId: 'process-1',
          data: {},
          tokens: [],
          items: [],
          variables: {},
          history: []
        },
        action: {
          type: 'COMPLETE_TASK',
          payload: {},
          timestamp: new Date()
        },
        expectedStateVersion: 5
      };

      const result = ExecuteRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的动作类型', () => {
      const invalidRequest = {
        processDefinition: 'process-1',
        currentState: null,
        action: {
          type: 'INVALID_ACTION',  // 无效类型
          payload: {},
          timestamp: new Date()
        }
      };

      const result = ExecuteRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('WorkflowValidator', () => {
    describe('validateProcessDefinition', () => {
      it('应该返回验证通过的流程定义', () => {
        const validDefinition = {
          id: 'process-1',
          key: 'test',
          version: 1,
          name: '测试流程',
          nodes: [{ id: 'start', type: 'startEvent', name: '开始' }]
        };

        const result = WorkflowValidator.validateProcessDefinition(validDefinition);
        expect(result.id).toBe('process-1');
      });

      it('应该抛出 WorkflowValidationError 异常', () => {
        const invalidDefinition = {
          id: '',  // 空 ID
          key: 'test',
          version: 1,
          name: '测试流程'
          // 缺少 nodes
        };

        expect(() => {
          WorkflowValidator.validateProcessDefinition(invalidDefinition);
        }).toThrow(WorkflowValidationError);
      });
    });

    describe('formatErrors', () => {
      it('应该格式化错误消息', () => {
        const error = new WorkflowValidationError('验证失败', [
          { path: 'nodes[0].id', message: 'ID 不能为空' },
          { path: 'nodes[0].type', message: '无效的节点类型' }
        ]);

        const formatted = error.formatErrors();
        expect(formatted).toContain('nodes[0].id: ID 不能为空');
        expect(formatted).toContain('nodes[0].type: 无效的节点类型');
      });
    });
  });

  describe('类型推断', () => {
    it('应该正确推断 ProcessDefinition 类型', () => {
      const definition = ProcessDefinitionSchema.parse({
        id: 'process-1',
        key: 'test',
        version: 1,
        name: '测试',
        nodes: [{ id: 'start', type: 'startEvent', name: '开始' }]
      });

      // TypeScript 应该能正确推断类型
      expect(definition.id).toBe('process-1');
      expect(definition.key).toBe('test');
      expect(definition.version).toBe(1);
    });
  });
});
