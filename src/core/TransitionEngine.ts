import {
	ProcessState,
	StateAction,
	ExecutionHistoryEntry,
} from '../state/WorkflowState.js';

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
			return {
				...state,
				history: [
					...state.history,
					{
						...newHistoryEntry,
						action: 'error',
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
		if (!currentState || !action) {
			return false;
		}

		switch (action.type) {
		case 'START_PROCESS':
			return currentState.status === 'created';

		case 'COMPLETE_TASK': {
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
			return true;
		}

		case 'EXECUTE_ELEMENT':
			return true;

		case 'UPDATE_DATA':
			return true;

		case 'TRANSITION_TOKEN': {
			const tokenId = action.payload?.tokenId;
			if (tokenId) {
				return currentState.tokens.some(
					token => token.id === tokenId
				);
			}
			return true;
		}

		case 'ERROR_OCCURRED':
			return true;

		default:
			return true;
		}
	}

	/**
	 * 执行状态转换
	 */
	applyTransition(
		currentState: ProcessState,
		action: StateAction
	): ProcessState {
		if (!this.validateTransition(currentState, action)) {
			throw new Error(
				`Invalid transition: ${action.type} from state ${currentState.status}`
			);
		}

		return this.applyAction(currentState, action);
	}

	/**
	 * 处理开始流程动作
	 */
	private handleStartProcess(
		state: ProcessState,
		action: StateAction,
		historyEntry: ExecutionHistoryEntry
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
		historyEntry: ExecutionHistoryEntry
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
		historyEntry: ExecutionHistoryEntry
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
		historyEntry: ExecutionHistoryEntry
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
		historyEntry: ExecutionHistoryEntry
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
		historyEntry: ExecutionHistoryEntry
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
	private createHistoryEntry(action: StateAction): ExecutionHistoryEntry {
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
	private getActionTypeForHistory(
		actionType: string
	): ExecutionHistoryEntry['action'] {
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
	 * 生成唯一 ID
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}
}
