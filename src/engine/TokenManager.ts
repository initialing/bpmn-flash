/**
 * 令牌管理器
 * 负责令牌的创建、挂起、恢复、销毁、移动、数据更新
 * 所有操作返回新 state，不修改原 state（不可变）
 */

import type { ProcessState } from '../state/ProcessState.js';
import type { TokenV3 as Token } from '../types/index.js';
import { generateId } from '../state/IdGenerator.js';

export class TokenManager {
	/** 在指定节点创建一个 active 令牌 */
	createToken(
		state: ProcessState,
		elementId: string,
		data: Record<string, any> = {}
	): ProcessState {
		const newToken: Token = {
			id: generateId(),
			elementId,
			status: 'active',
			data: { ...data },
			createdAt: new Date(),
		};
		return {
			...state,
			tokens: [...state.tokens, newToken],
		};
	}

	/** 挂起令牌（active → suspended） */
	suspendToken(state: ProcessState, tokenId: string): ProcessState {
		return {
			...state,
			tokens: state.tokens.map(t =>
				t.id === tokenId
					? {
							...t,
							status: 'suspended' as const,
							suspendedAt: new Date(),
						}
					: t
			),
		};
	}

	/** 恢复令牌（suspended → active），可选合并数据 */
	resumeToken(
		state: ProcessState,
		tokenId: string,
		data?: Record<string, any>
	): ProcessState {
		return {
			...state,
			tokens: state.tokens.map(t =>
				t.id === tokenId
					? {
							...t,
							status: 'active' as const,
							data: data ? { ...t.data, ...data } : t.data,
							suspendedAt: undefined,
						}
					: t
			),
		};
	}

	/** 销毁令牌 */
	destroyToken(state: ProcessState, tokenId: string): ProcessState {
		return {
			...state,
			tokens: state.tokens.filter(t => t.id !== tokenId),
		};
	}

	/** 移动令牌到另一个节点 */
	moveToken(
		state: ProcessState,
		tokenId: string,
		targetElementId: string
	): ProcessState {
		return {
			...state,
			tokens: state.tokens.map(t =>
				t.id === tokenId ? { ...t, elementId: targetElementId } : t
			),
		};
	}

	/** 更新令牌数据 */
	updateTokenData(
		state: ProcessState,
		tokenId: string,
		data: Record<string, any>
	): ProcessState {
		return {
			...state,
			tokens: state.tokens.map(t =>
				t.id === tokenId ? { ...t, data: { ...t.data, ...data } } : t
			),
		};
	}
}
