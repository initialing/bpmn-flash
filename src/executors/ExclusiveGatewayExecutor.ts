import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { evaluateExpression } from '../utils/ExpressionEvaluator.js';

/**
 * 排他网关执行器
 * 处理排他网关节点（XOR网关）
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
	execute(state: ProcessState, element: any, token: any): ProcessState {
		// 记录网关执行历史
		let newState = this.addHistoryEntry(state, element, 'transition', {
			tokenId: token.id,
			elementId: element.id,
		});

		try {
			// 获取所有出口顺序流
			const outgoingFlows = element.outgoing || [];
			if (outgoingFlows.length === 0) {
				// 如果没有出口流，直接移除令牌
				return {
					...newState,
					tokens: newState.tokens.filter(t => t.id !== token.id),
				};
			}

			// 查找第一个条件为true的顺序流
			let selectedFlowId: string | null = null;
			let defaultFlowId: string | null = null;

			// 首先检查是否有默认顺序流
			if (element.properties && element.properties.default) {
				defaultFlowId = element.properties.default;
			}

			// 检查每个顺序流的条件
			for (const flowId of outgoingFlows) {
				// 如果是默认顺序流，跳过条件检查
				if (flowId === defaultFlowId) {
					continue; // 默认流最后处理
				}

				// 获取顺序流定义
				const flow = this.getSequenceFlowById(element, flowId);

				// 检查顺序流是否有条件
				if (flow && flow.conditionExpression) {
					// 评估条件表达式
					const conditionResult = evaluateExpression(
						flow.conditionExpression,
						{ ...state.data, ...token.data }
					);

					if (conditionResult) {
						selectedFlowId = flowId;
						break;
					}
				} else {
					// 没有条件表达式的顺序流默认为true
					selectedFlowId = flowId;
					break;
				}
			}

			// 如果没有找到满足条件的顺序流，使用默认顺序流
			if (!selectedFlowId && defaultFlowId) {
				selectedFlowId = defaultFlowId;
			}

			// 如果仍然没有选中的顺序流，且只有一个出口流，则使用该流
			if (!selectedFlowId && outgoingFlows.length === 1) {
				selectedFlowId = outgoingFlows[0];
			}

			if (selectedFlowId) {
				// 获取下一个元素ID
				const nextElementId = this.getNextElementId(
					element,
					selectedFlowId
				);
				if (nextElementId) {
					// 创建新令牌指向下一个元素
					const newToken = this.createToken(
						nextElementId,
						token.data
					);

					// 更新状态：移除当前令牌，添加新令牌
					newState = {
						...newState,
						tokens: [
							...newState.tokens.filter(t => t.id !== token.id),
							newToken,
						],
					};
				} else {
					// 如果找不到下一个元素，移除当前令牌
					newState = {
						...newState,
						tokens: newState.tokens.filter(t => t.id !== token.id),
					};
				}
			} else {
				// 如果没有找到合适的路径，移除当前令牌
				newState = {
					...newState,
					tokens: newState.tokens.filter(t => t.id !== token.id),
				};
			}

			return newState;
		} catch (error) {
			// 记录错误
			newState = this.addHistoryEntry(newState, element, 'error', {
				tokenId: token.id,
				elementId: element.id,
				error: error instanceof Error ? error.message : String(error),
			});

			// 移除当前令牌
			return {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};
		}
	}

	/**
	 * 根据ID获取顺序流定义
	 */
	private getSequenceFlowById(element: any, flowId: string): any {
		// 这里需要从流程定义中获取顺序流信息
		// 简化实现，返回一个模拟对象
		// 在完整实现中，这里会从流程定义的sequenceFlows中查找
		return {
			id: flowId,
			sourceRef: element.id,
			targetRef: this.getTargetRefFromFlowId(flowId),
			conditionExpression: this.getConditionExpressionFromFlowId(flowId), // 这里应该从流程定义中获取
		};
	}

	/**
	 * 从流程定义中获取目标元素引用
	 */
	private getTargetRefFromFlowId(flowId: string): string {
		// 简化实现，实际上需要从流程定义中获取
		// 这里只是模拟返回一个ID
		return flowId.replace('flow', 'element');
	}

	/**
	 * 从流程定义中获取条件表达式
	 */
	private getConditionExpressionFromFlowId(flowId: string): string | null {
		// 简化实现，实际上需要从流程定义中获取
		// 这里返回null表示没有条件
		return null;
	}

	/**
	 * 获取下一个元素ID
	 */
	private getNextElementId(element: any, flowId: string): string | null {
		// 获取顺序流的目标元素ID
		const flow = this.getSequenceFlowById(element, flowId);
		return flow ? flow.targetRef : null;
	}
}
