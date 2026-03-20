// 核心引擎
export { WorkflowEngine } from './core/WorkflowEngine.js';
export { ExecutionEngine } from './core/ExecutionEngine.js';
export { TransitionEngine } from './core/TransitionEngine.js';

// 状态管理
export { WorkflowState } from './state/WorkflowState.js';
export { StateSerializer } from './state/StateSerializer.js';

// 任务计算
export { TaskGenerator, TaskComputer } from './tasks/TaskGenerator.js';

// 节点执行器
export { NodeExecutor, BaseNodeExecutor } from './executors/NodeExecutor.js';
export { StartEventExecutor } from './executors/StartEventExecutor.js';
export { EndEventExecutor } from './executors/EndEventExecutor.js';
export { UserTaskExecutor } from './executors/UserTaskExecutor.js';
export { ServiceTaskExecutor } from './executors/ServiceTaskExecutor.js';
export { ExclusiveGatewayExecutor } from './executors/ExclusiveGatewayExecutor.js';
export { ParallelGatewayExecutor } from './executors/ParallelGatewayExecutor.js';

// 验证器 (Zod)
export {
  WorkflowValidator,
  WorkflowValidationError,
  ProcessDefinitionSchema,
  BPMNNodeSchema,
  SequenceFlowSchema,
  ProcessStateSchema,
  ExecuteRequestSchema,
  ExecutionResultSchema
} from './validators/WorkflowValidators.js';

// 扩展点（预留）
export type {
  EngineHookType,
  EngineHook,
  HookContext,
  WorkflowPlugin,
  PluginRegistry,
  WorkflowEngineOptions,
  ExtendedExecutionResult
} from './extensions/ExtensionPoints.js';

export { SimplePluginRegistry } from './extensions/ExtensionPoints.js';

// 类型定义
export * from './types/index.js';