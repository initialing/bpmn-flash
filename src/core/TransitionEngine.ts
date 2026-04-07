import { ProcessState, StateAction } from '../state/WorkflowState.js';

/**
 * 状态流转引擎
 * 负责处理状态转换和验证
 */
export class TransitionEngine {
	/**
	 * 应用状态变更动作，返回新状态
	 */
	applyAction(state: ProcessState, action: StateAction): ProcessState {
		const newHistoryEntry = this.createHistoryEntry(action);

		switch (action.type) {
			case 'START_PROCESS':
				return this.handleStartProcess(state, action, newHistoryEntry);

			case 'EXECUTE_ELEMENT':
				return this.handleExecuteElement(
					state,
					action,
					newHistoryEntry
				);

			case 'COMPLETE_TASK':
				return this.handleCompleteTask(state, action, newHistoryEntry);

			case 'TRANSITION_TOKEN':
				return this.handleTransitionToken(
					state,
					action,
					newHistoryEntry
				);

			case 'UPDATE_DATA':
				return this.handleUpdateData(state, action, newHistoryEntry);

			case 'ERROR_OCCURRED':
				return this.handleErrorOccurred(state, action, newHistoryEntry);

			default:
				// 对于未知的动作类型，返回原状态但添加历史记录
				return {
					...state,
					history: [
						...state.history,
						{
							...newHistoryEntry,
							action: 'unknown',
							error: `Unknown action type: ${action.type}`,
						},
					],
				};
		}
	}

	/**
	 * 验证状态转换是否有效
	 */
	validateTransition(
		currentState: ProcessState,
		action: StateAction
	): boolean {
		// 检查基本约束
		if (!currentState || !action) {
			return false;
		}

		// 检查状态转换的合理性
		switch (action.type) {
			case 'START_PROCESS':
				return currentState.status === 'created';

			case 'COMPLETE_TASK': {
				// 检查任务是否存在且处于可完成状态
				const taskId = action.payload?.taskId;
				if (taskId) {
					const task = currentState.items.find(
						item => item.id === taskId
					);
					return (
						!!task &&
						(task.status === 'wait' || task.status === 'active')
					);
				}
				return true; // 如果没有指定任务ID，认为是有效的
			}

			case 'EXECUTE_ELEMENT':
				// 检查元素是否存在于流程定义中（此处简化处理）
				return true;

			case 'UPDATE_DATA':
				// 数据更新总是允许的
				return true;

			case 'TRANSITION_TOKEN': {
				// 检查令牌是否存在
				const tokenId = action.payload?.tokenId;
				if (tokenId) {
					return currentState.tokens.some(
						token => token.id === tokenId
					);
				}
				return true;
			}

			case 'ERROR_OCCURRED':
				// 错误发生总是允许的
				return true;

			default:
				return true; // 默认允许所有动作
		}
	}

	/**
	 * 执行状态转换
	 */
	applyTransition(
		currentState: ProcessState,
		action: StateAction
	): ProcessState {
		// 验证转换
		if (!this.validateTransition(currentState, action)) {
			throw new Error(
				`Invalid transition: ${action.type} from state ${currentState.status}`
			);
		}

		// 应用动作
		return this.applyAction(currentState, action);
	}

	/**
	 * 处理开始流程动作
	 */
	private handleStartProcess(
		state: ProcessState,
		action: StateAction,
		historyEntry: any
	): ProcessState {
		return {
			...state,
			status: 'running',
			startedAt: state.startedAt || new Date(),
			tokens: [...state.tokens, ...(action.payload.tokens || [])],
			data: { ...state.data, ...action.payload.initialData },
			history: [...state.history, historyEntry],
		};
	}

	/**
	 * 处理执行元素动作
	 */
	private handleExecuteElement(
		state: ProcessState,
		action: StateAction,
		historyEntry: any
	): ProcessState {
		return {
			...state,
			data: { ...state.data, ...action.payload.newData },
			tokens: state.tokens.filter(t => t.id !== action.payload.tokenId),
			items: action.payload.item
				? [...state.items, action.payload.item]
				: state.items,
			history: [...state.history, historyEntry],
		};
	}

	/**
	 * 处理完成任务动作
	 */
	private handleCompleteTask(
		state: ProcessState,
		action: StateAction,
		historyEntry: any
	): ProcessState {
		return {
			...state,
			items: state.items.map(item =>
				item.id === action.payload.itemId
					? { ...item, status: 'completed', endedAt: new Date() }
					: item
			),
			tokens: [...state.tokens, ...(action.payload.nextTokens || [])],
			history: [...state.history, historyEntry],
		};
	}

	/**
	 * 处理令牌流转动作
	 */
	private handleTransitionToken(
		state: ProcessState,
		action: StateAction,
		historyEntry: any
	): ProcessState {
		return {
			...state,
			tokens: [
				...state.tokens.filter(t => t.id !== action.payload.tokenId),
				...(action.payload.newTokens || []),
			],
			history: [...state.history, historyEntry],
		};
	}

	/**
	 * 处理数据更新动作
	 */
	private handleUpdateData(
		state: ProcessState,
		action: StateAction,
		historyEntry: any
	): ProcessState {
		return {
			...state,
			data: { ...state.data, ...action.payload.data },
			history: [...state.history, historyEntry],
		};
	}

	/**
	 * 处理错误发生动作
	 */
	private handleErrorOccurred(
		state: ProcessState,
		action: StateAction,
		historyEntry: any
	): ProcessState {
		return {
			...state,
			history: [
				...state.history,
				{
					...historyEntry,
					action: 'error',
					error: action.payload.error,
				},
			],
		};
	}

	/**
	 * 创建历史记录条目
	 */
	private createHistoryEntry(action: StateAction): any {
		return {
			id: this.generateId(),
			elementId: action.payload?.elementId || 'system',
			elementType: action.payload?.elementType || 'system',
			action: this.getActionTypeForHistory(action.type),
			timestamp: action.timestamp,
			data: action.payload,
		};
	}

	/**
	 * 将动作类型转换为历史记录类型
	 */
	private getActionTypeForHistory(actionType: string): string {
		switch (actionType) {
			case 'START_PROCESS':
				return 'start';
			case 'EXECUTE_ELEMENT':
				return 'transition';
			case 'COMPLETE_TASK':
				return 'complete';
			case 'TRANSITION_TOKEN':
				return 'transition';
			case 'ERROR_OCCURRED':
				return 'error';
			default:
				return 'transition';
		}
	}

	/**
	 * 生成唯一ID
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}
}
