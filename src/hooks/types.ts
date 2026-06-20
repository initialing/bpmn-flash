/**
 * 钩子类型定义
 * 所有钩子上下文和引擎配置接口
 */

import type { ProcessState } from '../state/ProcessState.js';
import type { TokenV3 as Token, Element, SequenceFlow, ProcessDefinition } from '../types/index.js';

// ============================================================
// 节点钩子上下文（onNodeEnter / onNodeLeave）
// ============================================================

export interface NodeHookContext {
	/** 当前流程状态 */
	state: ProcessState;
	/** 当前令牌 */
	token: Token;
	/** 当前节点 */
	node: Element;
	/** 流程定义 */
	definition: ProcessDefinition;
	/** 挂起当前令牌（仅 onNodeEnter 有效，网关/start/end 无效） */
	suspend(): void;
	/** 合并数据到令牌 data */
	setTokenData(data: Record<string, any>): void;
	/** 合并数据到流程级 variables */
	setVariables(variables: Record<string, any>): void;
	/** 执行脚本（需注册 ScriptExecutorPlugin） */
	executeScript(script: string): Promise<Record<string, any>>;
}

// ============================================================
// 连线钩子上下文（onSequenceFlow）
// ============================================================

export interface FlowHookContext {
	state: ProcessState;
	token: Token;
	flow: SequenceFlow;
	sourceNode: Element;
	targetNode: Element;
	definition: ProcessDefinition;
}

// ============================================================
// 流程级钩子上下文
// ============================================================

export interface ProcessHookContext {
	state: ProcessState;
	definition: ProcessDefinition;
}

// ============================================================
// 脚本执行插件接口
// ============================================================

export interface ScriptExecutorPlugin {
	execute(
		state: ProcessState,
		script: string,
		cb: (error: Error | null, result?: Record<string, any>) => void
	): void;
}

// ============================================================
// 引擎配置（构造函数传入）
// ============================================================

export interface FlowEngineOptions {
	onNodeEnter?: (ctx: NodeHookContext) => void | Promise<void>;
	onNodeLeave?: (ctx: NodeHookContext) => void | Promise<void>;
	onSequenceFlow?: (ctx: FlowHookContext) => void | Promise<void>;
	onProcessStart?: (ctx: ProcessHookContext) => void | Promise<void>;
	onProcessEnd?: (ctx: ProcessHookContext) => void | Promise<void>;
	scriptExecutor?: ScriptExecutorPlugin;
}

// ============================================================
// 钩子事件类型
// ============================================================

export type HookEvent = 'nodeEnter' | 'nodeLeave' | 'sequenceFlow' | 'processStart' | 'processEnd';

export interface HookHandlerMap {
	nodeEnter: (ctx: NodeHookContext) => void | Promise<void>;
	nodeLeave: (ctx: NodeHookContext) => void | Promise<void>;
	sequenceFlow: (ctx: FlowHookContext) => void | Promise<void>;
	processStart: (ctx: ProcessHookContext) => void | Promise<void>;
	processEnd: (ctx: ProcessHookContext) => void | Promise<void>;
}
