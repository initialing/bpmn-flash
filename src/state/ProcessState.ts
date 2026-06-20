/**
 * 流程实例状态 — v3 简化版
 * 去掉了 items / data / history，用 trace / variables / _gatewayWait 替代
 */

import { TokenV3 as Token, TraceEntry } from '../types/index.js';
export type { TokenV3 as Token } from '../types/index.js';

// ============================================================
// 流程状态
// ============================================================

/** 流程状态枚举 */
export type ProcessStatus = 'running' | 'completed' | 'terminated';

/**
 * 流程实例状态
 * 引擎不存储此对象——所有方法接收 state 返回新 state
 */
export interface ProcessState {
	/** 流程实例唯一 ID */
	id: string;
	/** 流程名称 */
	name: string;
	/** 流程状态 */
	status: ProcessStatus;
	/** 关联的流程定义 ID */
	definitionId: string;
	/** 流程级共享变量 */
	variables: Record<string, unknown>;
	/** 当前所有令牌（活跃 + 挂起） */
	tokens: Token[];
	/** 执行轨迹 */
	trace: TraceEntry[];
	/** 并行网关汇聚等待表：{ gatewayId: [已到达的 tokenId] } */
	_gatewayWait: Record<string, string[]>;
	/** 创建时间 */
	createdAt: Date;
	/** 启动时间 */
	startedAt: Date;
	/** 结束时间 */
	endedAt?: Date | undefined;
}

// ============================================================
// 序列化 / 反序列化
// ============================================================

/**
 * 将 ProcessState 序列化为 JSON 字符串
 * Date 对象会转换为 ISO 字符串
 */
export function serialize(state: ProcessState): string {
	return JSON.stringify(state, (_key, value) => {
		if (value instanceof Date) return value.toISOString();
		return value as unknown;
	});
}

/** 反序列化时令牌的原始 JSON 形状 */
interface RawToken {
	id: string;
	elementId: string;
	status: 'active' | 'suspended';
	data: Record<string, unknown>;
	createdAt: string;
	suspendedAt?: string;
}

/** 反序列化时轨迹条目的原始 JSON 形状 */
interface RawTraceEntry {
	type: 'node-enter' | 'node-leave' | 'sequence-flow' | 'gateway-resolve';
	elementId: string;
	elementType: string;
	elementName?: string;
	tokenId: string;
	timestamp: string;
	sourceRef?: string;
	targetRef?: string;
	flowId?: string;
	selectedFlows?: string[];
	extra?: Record<string, unknown>;
}

/** 反序列化时 ProcessState 的原始 JSON 形状 */
interface RawProcessState {
	id: string;
	name: string;
	status: ProcessStatus;
	definitionId: string;
	variables: Record<string, unknown>;
	tokens: RawToken[];
	trace: RawTraceEntry[];
	_gatewayWait: Record<string, string[]>;
	createdAt: string;
	startedAt: string;
	endedAt?: string;
}

/**
 * 从 JSON 字符串反序列化为 ProcessState
 * 恢复所有 Date 字段
 */
export function deserialize(json: string): ProcessState {
	const raw: RawProcessState = JSON.parse(json) as RawProcessState;

	return {
		...raw,
		createdAt: new Date(raw.createdAt),
		startedAt: new Date(raw.startedAt),
		endedAt: raw.endedAt ? new Date(raw.endedAt) : undefined,
		tokens: raw.tokens.map(
			(t: RawToken): Token => ({
				...t,
				data: t.data,
				createdAt: new Date(t.createdAt),
				suspendedAt: t.suspendedAt
					? new Date(t.suspendedAt)
					: undefined,
			})
		),
		trace: raw.trace.map(
			(e: RawTraceEntry): TraceEntry => ({
				...e,
				timestamp: new Date(e.timestamp),
			})
		),
	};
}
