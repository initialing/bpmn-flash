import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';

/**
 * 结束事件执行器
 * 处理各种类型的结束事件
 */
export class EndEventExecutor extends BaseNodeExecutor {
	/**
	 * 获取此执行器支持的节点类型
	 */
	getSupportedTypes(): string[] {
		return [
			'bpmn:endEvent',
			'bpmn:terminateEndEvent',
			'bpmn:errorEndEvent',
			'bpmn:cancelEndEvent',
		];
	}

	/**
	 * 执行结束事件
	 */
	async execute(
		state: ProcessState,
		element: any,
		token: any
	): Promise<ProcessState> {
		// 记录结束事件执行历史
		let newState = this.addHistoryEntry(state, element, 'complete', {
			tokenId: token.id,
			elementId: element.id,
		});

		// 结束事件会消耗令牌，不再产生新的令牌
		// 移除当前令牌
		newState = {
			...newState,
			tokens: newState.tokens.filter(t => t.id !== token.id),
		};

		// 检查是否所有令牌都已结束，如果是则完成整个流程
		if (newState.tokens.length === 0) {
			newState = {
				...newState,
				status: 'completed',
				endedAt: new Date(),
			};
		}

		return newState;
	}
}
