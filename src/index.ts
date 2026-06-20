// ============================================================
// bpmn-flash — v3 瘦引擎
// ============================================================

// 核心引擎
export { FlowEngine } from './engine/FlowEngine.js';
export type { SuspendedTokenInfo, FlowPlugin } from './engine/FlowEngine.js';

// 引擎内部组件
export { TokenManager } from './engine/TokenManager.js';
export { GatewayResolver } from './engine/GatewayResolver.js';
export { FlowTraverser } from './engine/FlowTraverser.js';

// 钩子系统
export { HookManager } from './hooks/HookManager.js';
export type {
	NodeHookContext,
	FlowHookContext,
	ProcessHookContext,
	FlowEngineOptions,
	ScriptExecutorPlugin,
	HookEvent,
	HookHandlerMap,
} from './hooks/types.js';

// 状态管理
export type { ProcessState, ProcessStatus } from './state/ProcessState.js';
export { serialize, deserialize } from './state/ProcessState.js';
export { generateId, generateLongId } from './state/IdGenerator.js';

// BPMN 解析
export { default as BPMNParser } from './parser/BPMNParser.js';
export { BpmnValidator } from './parser/BpmnValidator.js';

// 工具
export { evaluateExpression, evaluateExpressionResult } from './utils/ExpressionEvaluator.js';
export type { ExpressionResult } from './utils/ExpressionEvaluator.js';
export { VariableManager } from './variables/VariableManager.js';

// 错误类
export { ParseError, ValidationError, ExecutionError } from './errors/WorkflowErrors.js';

// 类型定义
export type {
	ElementType,
	ProcessDefinition,
	Element,
	SequenceFlow,
	Token,
	Item,
	TokenV3,
	TokenStatus,
	TraceEntry,
	ParsedXmlElement,
	ExpressionContext,
	EvaluationResult,
	Lane,
	DataObject,
	Message,
	Signal,
	ElementLike,
	TokenLike,
	SequenceFlowLike,
	ScriptExecutorPlugin as ScriptExecutorPluginType,
} from './types/index.js';
