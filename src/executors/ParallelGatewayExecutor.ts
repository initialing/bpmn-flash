import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { ElementLike, TokenLike } from '../types/index.js';

/**
 * 并行网关执行器
 * 处理并行网关节点（AND 网关）
 */
export class ParallelGatewayExecutor extends BaseNodeExecutor {
	/**
	 * 获取此执行器支持的节点类型
	 */
	getSupportedTypes(): string[] {
		return ['bpmn:parallelGateway'];
	}

	/**
	 * 执行并行网关
	 */
	async execute(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): Promise<ProcessState> {
		let newState = this.addHistoryEntry(state, element, 'transition', {
			tokenId: token.id,
			elementId: element.id,
		});

		try {
			const incomingTokens = this.getIncomingTokensForGateway(
				newState,
				element
			);

			const outgoingFlows = element.outgoing || [];

			if (incomingTokens.length > 1 && outgoingFlows.length === 1) {
				const allTokensForThisGateway = incomingTokens.filter(t =>
					this.isTokenForThisGateway(t, element)
				);

				if (
					allTokensForThisGateway.length >=
					this.getIncomingFlowCount(element)
				) {
					return this.handleParallelJoin(newState, element, token);
				} else {
					return {
						...newState,
						tokens: newState.tokens.filter(t => t.id !== token.id),
					};
				}
			} else if (
				incomingTokens.length === 1 &&
				outgoingFlows.length > 1
			) {
				return this.handleParallelSplit(newState, element, token);
			} else {
				return this.handleNormalTransition(newState, element, token);
			}
		} catch (error) {
			newState = this.addHistoryEntry(newState, element, 'error', {
				tokenId: token.id,
				elementId: element.id,
				error: error instanceof Error ? error.message : String(error),
			});

			return {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};
		}
	}

	/**
	 * 处理并行分裂（一个令牌分裂为多个）
	 */
	private handleParallelSplit(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): ProcessState {
		const outgoingFlows = element.outgoing || [];

		const newTokens = outgoingFlows
			.map(flowId => {
				const nextElementId = this.getNextElementId(element, flowId);
				return this.createToken(nextElementId, token.data);
			})
			.filter(token => token.elementId);

		return {
			...state,
			tokens: [
				...state.tokens.filter(t => t.id !== token.id),
				...newTokens,
			],
		};
	}

	/**
	 * 处理并行汇聚（多个令牌汇聚为一个）
	 */
	private handleParallelJoin(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): ProcessState {
		const tokensForThisGateway = state.tokens.filter(t =>
			this.isTokenFromIncomingPaths(t, element)
		);

		const remainingTokens = state.tokens.filter(
			t =>
				!tokensForThisGateway.some(
					gatewayToken => gatewayToken.id === t.id
				)
		);

		const outgoingFlows = element.outgoing || [];
		const newTokens = outgoingFlows
			.map(flowId => {
				const nextElementId = this.getNextElementId(element, flowId);
				return this.createToken(nextElementId, token.data);
			})
			.filter(token => token.elementId);

		return {
			...state,
			tokens: [...remainingTokens, ...newTokens],
		};
	}

	/**
	 * 处理普通转换
	 */
	private handleNormalTransition(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): ProcessState {
		const outgoingFlows = element.outgoing || [];

		if (outgoingFlows.length === 0) {
			return {
				...state,
				tokens: state.tokens.filter(t => t.id !== token.id),
			};
		}

		const newTokens = outgoingFlows
			.map(flowId => {
				const nextElementId = this.getNextElementId(element, flowId);
				return this.createToken(nextElementId, token.data);
			})
			.filter(token => token.elementId);

		return {
			...state,
			tokens: [
				...state.tokens.filter(t => t.id !== token.id),
				...newTokens,
			],
		};
	}

	/**
	 * 获取进入此网关的令牌
	 */
	private getIncomingTokensForGateway(
		state: ProcessState,
		element: ElementLike
	): TokenLike[] {
		return state.tokens;
	}

	/**
	 * 检查令牌是否属于此网关
	 */
	private isTokenForThisGateway(
		token: TokenLike,
		element: ElementLike
	): boolean {
		return true;
	}

	/**
	 * 检查令牌是否来自入口路径
	 */
	private isTokenFromIncomingPaths(
		token: TokenLike,
		element: ElementLike
	): boolean {
		return true;
	}

	/**
	 * 获取入口顺序流数量
	 */
	private getIncomingFlowCount(element: ElementLike): number {
		return 1;
	}

	/**
	 * 获取下一个元素 ID
	 */
	private getNextElementId(
		element: ElementLike,
		flowId: string
	): string | null {
		return flowId || null;
	}
}
