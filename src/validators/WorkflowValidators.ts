/**
 * Zod Schema Validators for Workflow Engine
 * 提供流程定义、执行请求、状态数据的验证
 */

import { z } from 'zod';

// ==================== 基础类型 ====================

/**
 * 流程元素 ID
 */
export const WorkflowIdSchema = z.string().min(1).max(128);

/**
 * 流程状态枚举
 */
export const ProcessStatusSchema = z.enum(['created', 'running', 'suspended', 'completed', 'terminated']);

/**
 * 节点类型枚举
 */
export const NodeTypeSchema = z.enum([
  'startEvent',
  'endEvent',
  'userTask',
  'serviceTask',
  'scriptTask',
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway'
]);

/**
 * 任务状态枚举
 */
export const TaskStatusSchema = z.enum(['pending', 'active', 'completed', 'cancelled']);

// ==================== 流程定义验证 ====================

/**
 * BPMN 节点 Schema
 */
export const BPMNNodeSchema = z.object({
  id: WorkflowIdSchema,
  type: NodeTypeSchema,
  name: z.string().min(1).max(256),
  description: z.string().optional(),
  incoming: z.array(WorkflowIdSchema).default([]),
  outgoing: z.array(WorkflowIdSchema).default([]),
  config: z.record(z.any()).optional(),
  properties: z.record(z.string()).optional()
});

/**
 * 顺序流 Schema
 */
export const SequenceFlowSchema = z.object({
  id: WorkflowIdSchema,
  name: z.string().optional(),
  sourceRef: WorkflowIdSchema,
  targetRef: WorkflowIdSchema,
  conditionExpression: z.string().optional()
});

/**
 * 流程定义 Schema
 */
export const ProcessDefinitionSchema = z.object({
  id: WorkflowIdSchema,
  key: z.string().min(1).max(128),
  version: z.number().int().positive(),
  name: z.string().min(1).max(256),
  description: z.string().optional(),
  targetNamespace: z.string().optional(),
  nodes: z.array(BPMNNodeSchema).min(1),
  flows: z.array(SequenceFlowSchema).default([]),
  startNodes: z.array(BPMNNodeSchema).default([]),
  endNodes: z.array(BPMNNodeSchema).default([]),
  properties: z.object({
    defaultPriority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    variables: z.array(z.object({
      name: z.string(),
      type: z.string(),
      defaultValue: z.any().optional(),
      required: z.boolean().default(false)
    })).default([])
  }).optional()
});

// ==================== 状态数据验证 ====================

/**
 * 令牌 Schema
 */
export const TokenSchema = z.object({
  id: WorkflowIdSchema,
  elementId: WorkflowIdSchema,
  status: z.enum(['active', 'waiting', 'completed']),
  createdAt: z.date(),
  data: z.record(z.any()).optional()
});

/**
 * 任务项 Schema
 */
export const ItemSchema = z.object({
  id: WorkflowIdSchema,
  elementId: WorkflowIdSchema,
  type: NodeTypeSchema,
  name: z.string(),
  status: TaskStatusSchema,
  assignee: z.string().optional(),
  candidates: z.array(z.string()).optional(),
  createdAt: z.date(),
  completedAt: z.date().optional(),
  data: z.record(z.any()).optional()
});

/**
 * 执行历史条目 Schema
 */
export const ExecutionHistoryEntrySchema = z.object({
  id: WorkflowIdSchema,
  elementId: WorkflowIdSchema,
  elementType: z.string(),
  action: z.enum(['start', 'complete', 'transition', 'error']),
  timestamp: z.date(),
  data: z.record(z.any()).optional(),
  error: z.string().optional()
});

/**
 * 流程状态 Schema
 */
export const ProcessStateSchema = z.object({
  id: WorkflowIdSchema,
  name: z.string(),
  status: ProcessStatusSchema,
  createdAt: z.date(),
  startedAt: z.date().optional(),
  endedAt: z.date().optional(),
  definitionId: WorkflowIdSchema,
  data: z.record(z.any()).default({}),
  tokens: z.array(TokenSchema).default([]),
  items: z.array(ItemSchema).default([]),
  variables: z.record(z.any()).default({}),
  history: z.array(ExecutionHistoryEntrySchema).default([])
});

// ==================== 执行请求验证 ====================

/**
 * 状态动作类型枚举
 */
export const StateActionTypeSchema = z.enum([
  'START_PROCESS',
  'EXECUTE_ELEMENT',
  'COMPLETE_TASK',
  'TRANSITION_TOKEN',
  'UPDATE_DATA',
  'ERROR_OCCURRED'
]);

/**
 * 状态动作 Schema
 */
export const StateActionSchema = z.object({
  type: StateActionTypeSchema,
  payload: z.record(z.any()),
  timestamp: z.date()
});

/**
 * 执行请求 Schema
 */
export const ExecuteRequestSchema = z.object({
  processDefinition: z.union([z.string(), ProcessDefinitionSchema]),
  currentState: ProcessStateSchema.nullable(),
  action: StateActionSchema,
  expectedStateVersion: z.number().int().positive().optional()  // 乐观锁版本号
});

// ==================== 执行结果验证 ====================

/**
 * 流程事件 Schema
 */
export const ProcessEventSchema = z.object({
  type: z.enum([
    'TASK_CREATED',
    'TASK_COMPLETED',
    'PROCESS_STARTED',
    'PROCESS_COMPLETED',
    'TOKEN_MOVED',
    'GATEWAY_EVALUATED'
  ]),
  payload: z.record(z.any()),
  timestamp: z.date()
});

/**
 * 执行结果 Schema
 */
export const ExecutionResultSchema = z.object({
  newState: ProcessStateSchema,
  tasks: z.array(ItemSchema).default([]),
  events: z.array(ProcessEventSchema).default([]),
  success: z.boolean(),
  error: z.string().optional()
});

// ==================== 验证器类 ====================

/**
 * 工作流验证器
 * 提供统一的验证入口和错误处理
 */
export class WorkflowValidator {
  /**
   * 验证流程定义
   */
  static validateProcessDefinition(data: unknown): z.infer<typeof ProcessDefinitionSchema> {
    const result = ProcessDefinitionSchema.safeParse(data);
    if (!result.success) {
      throw new WorkflowValidationError(
        '流程定义格式无效',
        (result.error as any).issues?.map((e: any) => ({
          path: e.path?.join('.') || 'unknown',
          message: e.message
        })) || []
      );
    }
    return result.data;
  }

  /**
   * 验证执行请求
   */
  static validateExecuteRequest(data: unknown): z.infer<typeof ExecuteRequestSchema> {
    const result = ExecuteRequestSchema.safeParse(data);
    if (!result.success) {
      throw new WorkflowValidationError(
        '执行请求格式无效',
        (result.error as any).issues?.map((e: any) => ({
          path: e.path?.join('.') || 'unknown',
          message: e.message
        })) || []
      );
    }
    return result.data;
  }

  /**
   * 验证流程状态
   */
  static validateProcessState(data: unknown): z.infer<typeof ProcessStateSchema> {
    const result = ProcessStateSchema.safeParse(data);
    if (!result.success) {
      throw new WorkflowValidationError(
        '流程状态格式无效',
        (result.error as any).issues?.map((e: any) => ({
          path: e.path?.join('.') || 'unknown',
          message: e.message
        })) || []
      );
    }
    return result.data;
  }

  /**
   * 验证 BPMN 节点
   */
  static validateBPMNNode(data: unknown): z.infer<typeof BPMNNodeSchema> {
    const result = BPMNNodeSchema.safeParse(data);
    if (!result.success) {
      throw new WorkflowValidationError(
        'BPMN 节点格式无效',
        (result.error as any).issues?.map((e: any) => ({
          path: e.path?.join('.') || 'unknown',
          message: e.message
        })) || []
      );
    }
    return result.data;
  }

  /**
   * 验证顺序流
   */
  static validateSequenceFlow(data: unknown): z.infer<typeof SequenceFlowSchema> {
    const result = SequenceFlowSchema.safeParse(data);
    if (!result.success) {
      throw new WorkflowValidationError(
        '顺序流格式无效',
        (result.error as any).issues?.map((e: any) => ({
          path: e.path?.join('.') || 'unknown',
          message: e.message
        })) || []
      );
    }
    return result.data;
  }
}

// ==================== 自定义异常 ====================

/**
 * 验证错误详情
 */
export interface ValidationErrorDetail {
  path: string;
  message: string;
}

/**
 * 工作流验证异常
 */
export class WorkflowValidationError extends Error {
  public readonly details: ValidationErrorDetail[];
  public readonly timestamp: Date;

  constructor(message: string, details: ValidationErrorDetail[] = []) {
    super(message);
    this.name = 'WorkflowValidationError';
    this.details = details;
    this.timestamp = new Date();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkflowValidationError);
    }
  }

  /**
   * 格式化错误消息
   */
  formatErrors(): string {
    if (this.details.length === 0) {
      return this.message;
    }
    return `${this.message}: ${this.details.map(d => `${d.path}: ${d.message}`).join(', ')}`;
  }
}

// ==================== 导出类型 ====================

export type {
  ProcessDefinition,
  BPMNNode,
  SequenceFlow,
  ProcessState,
  Token,
  Item,
  ExecutionHistoryEntry,
  ExecuteRequest,
  StateAction,
  ExecutionResult,
  ProcessEvent
};
