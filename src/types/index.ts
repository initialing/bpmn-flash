import type { ProcessState } from '../state/ProcessState.js';

export type ElementType =
	| 'bpmn:startEvent'
	| 'bpmn:endEvent'
	| 'bpmn:userTask'
	| 'bpmn:serviceTask'
	| 'bpmn:scriptTask'
	| 'bpmn:task'
	| 'bpmn:exclusiveGateway'
	| 'bpmn:parallelGateway'
	| 'bpmn:inclusiveGateway'
	| 'bpmn:eventBasedGateway';

export interface ProcessDefinition {
	id: string;
	name: string;
	version?: string;
	elements: Map<string, Element>;
	sequenceFlows: Map<string, SequenceFlow>;
	lanes?: Lane[];
	dataObjects?: DataObject[];
	messages?: Message[];
	signals?: Signal[];
}

export interface Element {
	id: string;
	type: ElementType;
	name: string;
	incoming: string[];
	outgoing: string[];
	properties: Record<string, any>;
	variables?: VariableDefinition[];
	childElements?: Record<string, any[]>;
}

export interface SequenceFlow {
	id: string;
	sourceRef: string;
	targetRef: string;
	conditionExpression: string | null;
	conditionType?: 'expression' | 'script';
}

export interface VariableDefinition {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'object' | 'array';
	defaultValue?: unknown;
	required?: boolean;
}

export interface Token {
	id: string;
	elementId: string;
	data: Record<string, any>;
	createdAt: Date;
}

export interface Item {
	id: string;
	elementId: string;
	name: string;
	type: string;
	status: 'wait' | 'completed' | 'active';
	data: Record<string, any>;
	startedAt: Date;
	endedAt?: Date;
	assignee?: string | null;
	candidateUsers?: string[] | null;
	candidateGroups?: string[] | null;
	priority?: number;
	createdAt?: Date;
}

export interface ParsedXmlElement {
	[key: string]: {
		tagName: string;
		properties: Record<string, string>;
		children?: ParsedXmlElement[];
		content?: string;
	};
}

export interface ParseToken {
	type: 'text' | 'tag';
	value: string;
}

export interface CheckExecutionError {
	code: string;
	reason?: string[];
}

export interface ExpressionContext {
	variables: Record<string, any>;
	element?: Element;
	instance?: unknown;
}

export interface EvaluationResult {
	success: boolean;
	value?: unknown;
	error?: string;
}

export interface Lane {
	id: string;
	name: string;
	flowNodeRefs: string[];
}

export interface DataObject {
	id: string;
	name: string;
	itemSubjectRef?: string;
}

export interface Message {
	id: string;
	name: string;
}

export interface Signal {
	id: string;
	name: string;
}

/**
 * 通用元素接口 - 替代 any 用于元素类型
 */
export interface ElementLike {
	id: string;
	type: string;
	name?: string;
	incoming?: string[];
	outgoing?: string[];
	properties?: Record<string, any>;
	[key: string]: any;
}

/**
 * 通用令牌接口 - 替代 any 用于令牌类型
 */
export interface TokenLike {
	id: string;
	elementId: string;
	data: Record<string, any>;
	createdAt?: Date;
	[key: string]: any;
}

/**
 * 通用流程接口 - 替代 any 用于 SequenceFlow 类型
 */
export interface SequenceFlowLike {
	id: string;
	sourceRef: string;
	targetRef: string;
	conditionExpression?: string | null;
	conditionType?: 'expression' | 'script';
	default?: boolean;
	[key: string]: any;
}

/**
 * 脚本执行插件接口
 * 当注册了此插件时，脚本任务使用插件执行脚本
 * 未注册时，fallback 到内置的表达式计算器
 */
export interface ScriptExecutorPlugin {
	/**
	 * 执行脚本
	 * @param state - 当前流程状态（包含流程变量等）
	 * @param script - 脚本字符串
	 * @param cb - 回调函数，插件内显式调用表示脚本执行完毕
	 *   - cb(null, result) 表示成功，result 会作为脚本节点的输出
	 *   - cb(error) 表示失败
	 */
	execute(
		state: ProcessState,
		script: string,
		cb: (error: Error | null, result?: Record<string, any>) => void
	): void;
}

// ============================================================
// v3 新增类型
// ============================================================

/** 令牌状态 */
export type TokenStatus = 'active' | 'suspended';

/** v3 令牌（增加 status 和 suspendedAt） */
export interface TokenV3 {
	id: string;
	elementId: string;
	status: TokenStatus;
	data: Record<string, any>;
	createdAt: Date;
	suspendedAt?: Date;
}

/** 执行轨迹条目 */
export interface TraceEntry {
	type: 'node-enter' | 'node-leave' | 'sequence-flow' | 'gateway-resolve';
	elementId: string;
	elementType: string;
	elementName?: string;
	tokenId: string;
	timestamp: Date;
	sourceRef?: string;
	targetRef?: string;
	flowId?: string;
	selectedFlows?: string[];
	extra?: Record<string, any>;
}
