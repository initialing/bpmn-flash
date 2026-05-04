import { ProcessDefinition, Token, Item } from '../types/index.js';

/**
 * 流程状态数据结构
 * 无状态设计，所有变更通过纯函数计算产生新状态
 */
export interface ProcessState {
	/** 流程实例 ID */
	id: string;
	/** 流程名称 */
	name: string;
	/** 流程状态 */
	status: 'created' | 'running' | 'suspended' | 'completed' | 'terminated';
	/** 创建时间 */
	createdAt: Date;
	/** 开始时间 */
	startedAt?: Date;
	/** 结束时间 */
	endedAt?: Date;
	/** 流程定义引用 */
	definitionId: string;
	/** 当前流程数据 */
	data: Record<string, any>;
	/** 当前活跃的令牌列表 */
	tokens: Token[];
	/** 已完成的任务列表 */
	items: Item[];
	/** 流程变量 */
	variables: Record<string, any>;
	/** 执行历史 */
	history: ExecutionHistoryEntry[];
}

/**
 * 执行历史条目
 */
export interface ExecutionHistoryEntry {
	id: string;
	elementId: string;
	elementType: string;
	action: 'start' | 'complete' | 'transition' | 'error';
	timestamp: Date;
	data?: Record<string, any>;
	error?: string;
}

/**
 * 状态变更动作
 */
export interface StateAction {
	type:
		| 'START_PROCESS'
		| 'EXECUTE_ELEMENT'
		| 'COMPLETE_TASK'
		| 'TRANSITION_TOKEN'
		| 'UPDATE_DATA'
		| 'ERROR_OCCURRED';
	payload: StateActionPayload;
	timestamp: Date;
}

/**
 * 状态动作负载类型
 */
export interface StateActionPayload {
	elementId?: string;
	elementType?: string;
	tokens?: Token[];
	initialData?: Record<string, any>;
	newData?: Record<string, any>;
	tokenId?: string;
	item?: Item;
	nextTokens?: Token[];
	data?: Record<string, any>;
	error?: string;
	originalAction?: StateAction;
	taskId?: string;
	itemId?: string;
	[key: string]: any;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
	/** 新的状态 */
	newState: ProcessState;
	/** 产生的新任务 */
	tasks: Item[];
	/** 产生的事件 */
	events: ProcessEvent[];
	/** 是否执行成功 */
	success: boolean;
	/** 错误信息 */
	error?: string;
}

/**
 * 流程事件
 */
export interface ProcessEvent {
	type:
		| 'TASK_CREATED'
		| 'TASK_COMPLETED'
		| 'PROCESS_STARTED'
		| 'PROCESS_COMPLETED'
		| 'TOKEN_MOVED'
		| 'GATEWAY_EVALUATED';
	payload: Record<string, any>;
	timestamp: Date;
}

/**
 * 状态管理器
 * 提供状态创建、更新、序列化等功能
 */
export class WorkflowState {
	/**
	 * 创建初始流程状态
	 */
	static createInitialState(
		definition: ProcessDefinition,
		initialData: Record<string, any> = {}
	): ProcessState {
		return {
			id: this.generateId(),
			name: definition.name || definition.id,
			status: 'created',
			createdAt: new Date(),
			definitionId: definition.id,
			data: { ...initialData },
			tokens: [],
			items: [],
			variables: {},
			history: [],
		};
	}

	/**
	 * 应用状态变更动作，返回新状态
	 */
	static applyAction(state: ProcessState, action: StateAction): ProcessState {
		const newHistoryEntry: ExecutionHistoryEntry = {
			id: this.generateId(),
			elementId: action.payload?.elementId || 'system',
			elementType: action.payload?.elementType || 'system',
			action: this.getActionTypeForHistory(action.type),
			timestamp: action.timestamp,
			data: action.payload,
		};

		switch (action.type) {
		case 'START_PROCESS':
			return {
				...state,
				status: 'running',
				startedAt: state.startedAt || new Date(),
				tokens: [...state.tokens, ...(action.payload.tokens || [])],
				history: [...state.history, newHistoryEntry],
			};

		case 'EXECUTE_ELEMENT':
			return {
				...state,
				data: { ...state.data, ...action.payload.newData },
				tokens: state.tokens.filter(
					t => t.id !== action.payload.tokenId
				),
				items: action.payload.item
					? [...state.items, action.payload.item]
					: state.items,
				history: [...state.history, newHistoryEntry],
			};

		case 'COMPLETE_TASK':
			return {
				...state,
				items: state.items.map(item =>
					item.id === action.payload.itemId
						? {
							...item,
							status: 'completed',
							endedAt: new Date(),
						}
						: item
				),
				tokens: [
					...state.tokens,
					...(action.payload.nextTokens || []),
				],
				history: [...state.history, newHistoryEntry],
			};

		case 'TRANSITION_TOKEN':
			return {
				...state,
				tokens: [
					...state.tokens.filter(
						t => t.id !== action.payload.tokenId
					),
					...(action.payload.newTokens || []),
				],
				history: [...state.history, newHistoryEntry],
			};

		case 'UPDATE_DATA':
			return {
				...state,
				data: { ...state.data, ...action.payload.data },
				history: [...state.history, newHistoryEntry],
			};

		case 'ERROR_OCCURRED':
			return {
				...state,
				history: [
					...state.history,
					{
						...newHistoryEntry,
						action: 'error',
						error: action.payload.error,
					},
				],
			};

		default:
			return state;
		}
	}

	/**
	 * 序列化状态为 JSON
	 */
	static serialize(state: ProcessState): string {
		const serializableState = {
			...state,
			createdAt: state.createdAt.toISOString(),
			startedAt: state.startedAt?.toISOString(),
			endedAt: state.endedAt?.toISOString(),
			tokens: state.tokens.map(token => ({
				...token,
				createdAt: token.createdAt.toISOString(),
			})),
			items: state.items.map(item => ({
				...item,
				startedAt: item.startedAt.toISOString(),
				endedAt: item.endedAt?.toISOString(),
			})),
			history: state.history.map(entry => ({
				...entry,
				timestamp: entry.timestamp.toISOString(),
			})),
		};
		return JSON.stringify(serializableState);
	}

	/**
	 * 从 JSON 反序列化状态
	 */
	static deserialize(serializedState: string): ProcessState {
		const parsed = JSON.parse(serializedState);

		return {
			...parsed,
			createdAt: new Date(parsed.createdAt),
			startedAt: parsed.startedAt
				? new Date(parsed.startedAt)
				: undefined,
			endedAt: parsed.endedAt ? new Date(parsed.endedAt) : undefined,
			tokens: parsed.tokens.map((token: Token) => ({
				...token,
				createdAt: new Date(token.createdAt),
			})),
			items: parsed.items.map((item: Item) => ({
				...item,
				startedAt: new Date(item.startedAt),
				endedAt: item.endedAt ? new Date(item.endedAt) : undefined,
			})),
			history: parsed.history.map((entry: ExecutionHistoryEntry) => ({
				...entry,
				timestamp: new Date(entry.timestamp),
			})),
		};
	}

	/**
	 * 生成唯一 ID
	 */
	private static generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}

	/**
	 * 将动作类型转换为历史记录类型
	 */
	private static getActionTypeForHistory(
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
}
