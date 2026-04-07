import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { evaluateExpression } from '../utils/ExpressionEvaluator.js';
import { ElementLike, TokenLike, SequenceFlowLike } from '../types/index.js';

/**
 * 排他网关执行器
 * 处理排他网关节点（XOR 网关）
 */
export class ExclusiveGatewayExecutor extends BaseNodeExecutor {
	/**
	 * 获取此执行器支持的节点类型
	 */
	getSupportedTypes(): string[] {
		return ['bpmn:exclusiveGateway'];
	}

	/**
	 * 执行排他网关
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
			const outgoingFlows = element.outgoing || [];
			if (outgoingFlows.length === 0) {
				return {
					...newState,
					tokens: newState.tokens.filter(t => t.id !== token.id),
				};
			}

			let selectedFlowId: string | null = null;
			let defaultFlowId: string | null = null;

			if (element.properties && element.properties.default) {
				defaultFlowId = element.properties.default;
			}
			if (!defaultFlowId && element.sequenceFlows) {
				const defaultFlow = element.sequenceFlows.find(
					(f: SequenceFlowLike) => f.default === true
				);
				if (defaultFlow) {
					defaultFlowId = defaultFlow.id;
				}
			}

			for (const flowId of outgoingFlows) {
				if (flowId === defaultFlowId) {
					continue;
				}

				const flow = this.getSequenceFlowById(element, flowId);

				if (flow && flow.conditionExpression) {
					const conditionResult = evaluateExpression(
						flow.conditionExpression,
						{ ...state.data, ...token.data }
					);

					if (conditionResult) {
						selectedFlowId = flowId;
						break;
					}
				} else {
					selectedFlowId = flowId;
					break;
				}
			}

			if (!selectedFlowId && defaultFlowId) {
				selectedFlowId = defaultFlowId;
			}

			if (!selectedFlowId && outgoingFlows.length === 1) {
				selectedFlowId = outgoingFlows[0];
			}

			if (selectedFlowId) {
				const nextElementId = this.getNextElementId(
					element,
					selectedFlowId
				);
				if (nextElementId) {
					const newToken = this.createToken(
						nextElementId,
						token.data
					);

					newState = {
						...newState,
						tokens: [
							...newState.tokens.filter(t => t.id !== token.id),
							newToken,
						],
					};
				} else {
					newState = {
						...newState,
						tokens: newState.tokens.filter(t => t.id !== token.id),
					};
				}
			} else {
				newState = {
					...newState,
					tokens: newState.tokens.filter(t => t.id !== token.id),
				};
			}

			return newState;
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
	 * 根据 ID 获取顺序流定义
	 */
	private getSequenceFlowById(
		element: ElementLike,
		flowId: string
	): SequenceFlowLike {
		return {
			id: flowId,
			sourceRef: element.id,
			targetRef: this.getTargetRefFromFlowId(flowId),
			conditionExpression: this.getConditionExpressionFromFlowId(flowId),
		};
	}

	/**
	 * 从流程定义中获取目标元素引用
	 */
	private getTargetRefFromFlowId(flowId: string): string {
		return flowId.replace('flow', 'element');
	}

	/**
	 * 从流程定义中获取条件表达式
	 */
	private getConditionExpressionFromFlowId(flowId: string): string | null {
		return null;
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
