import { ProcessDefinition } from '../types/index.js';
import {
	ProcessState,
	ExecutionResult,
	StateAction,
} from '../state/WorkflowState.js';
import { ExecutionEngine } from './ExecutionEngine.js';
import { TransitionEngine } from './TransitionEngine.js';
import BPMNParser from '../parser/BPMNParser.js';
import ExecutionInstance from '../ExecutionInstance.js';

/**
 * 主流程引擎
 * 负责协调各个子引擎，提供高层API
 */
export class WorkflowEngine {
	private executionEngine: ExecutionEngine;
	private transitionEngine: TransitionEngine;

	constructor() {
		this.executionEngine = new ExecutionEngine();
		this.transitionEngine = new TransitionEngine();
	}

	/**
	 * 启动一个新的流程实例
	 */
	startProcess(
		definition: ProcessDefinition,
		initialData: Record<string, any> = {}
	): ProcessState {
		// 创建初始状态
		const initialState = this.createInitialState(definition, initialData);

		// 创建启动动作
		const startAction: StateAction = {
			type: 'START_PROCESS',
			payload: {
				definitionId: definition.id,
				initialData: initialData,
				// 初始化令牌，从开始事件开始
				tokens: this.initializeTokens(definition),
			},
			timestamp: new Date(),
		};

		// 应用启动动作得到新状态
		const updatedState = this.transitionEngine.applyAction(
			initialState,
			startAction
		);

		// 执行初始令牌
		return this.executionEngine.execute(updatedState);
	}

	/**
	 * 执行流程动作（如完成任务、触发事件等）
	 * @param currentState 当前流程状态
	 * @param action 动作
	 * @param bpmnXML BPMN XML 字符串（用于重新解析获取元素定义）
	 */
	executeAction(
		currentState: ProcessState,
		action: StateAction,
		bpmnXML: string
	): ExecutionResult {
		try {
			// 1. 重新解析 BPMN XML
			const definition = BPMNParser.parse(bpmnXML);

			// 2. 验证流程定义 ID 是否匹配
			if (definition.id !== currentState.definitionId) {
				console.warn(
					`流程定义 ID 不匹配：${definition.id} !== ${currentState.definitionId}`
				);
			}

			// 3. 使用转换引擎应用动作
			const newState = this.transitionEngine.applyAction(
				currentState,
				action
			);

			// 4. 使用执行引擎处理状态变化（传入 definition）
			const executedState = this.executionEngine.execute(
				newState,
				definition
			);

			// 生成任务和事件
			const tasks = this.generateTasks(executedState);
			const events = this.generateEvents(
				currentState,
				executedState,
				action
			);

			return {
				newState: executedState,
				tasks: tasks,
				events: events,
				success: true,
			};
		} catch (error) {
			// 错误处理
			const errorAction: StateAction = {
				type: 'ERROR_OCCURRED',
				payload: {
					error:
						error instanceof Error ? error.message : String(error),
					originalAction: action,
				},
				timestamp: new Date(),
			};

			const errorState = this.transitionEngine.applyAction(
				currentState,
				errorAction
			);

			return {
				newState: errorState,
				tasks: [],
				events: [
					{
						type: 'PROCESS_ERROR',
						payload: {
							error:
								error instanceof Error
									? error.message
									: String(error),
						},
						timestamp: new Date(),
					},
				],
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 获取流程实例的当前状态
	 */
	getState(processId: string): ProcessState | null {
		// 在实际实现中，这里会从存储中获取状态
		// 当前为简化实现，返回null
		return null;
	}

	/**
	 * 获取流程实例的待办任务
	 * @param state 流程状态（由应用层提供）
	 * @returns 待办任务列表
	 */
	getTasks(state: ProcessState): any[] {
		// 从状态中提取等待中的任务
		return state.items.filter(item => item.status === 'wait');
	}

	/**
	 * 创建初始状态
	 */
	private createInitialState(
		definition: ProcessDefinition,
		initialData: Record<string, any>
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
	 * 初始化令牌，从开始事件开始
	 */
	private initializeTokens(definition: ProcessDefinition): any[] {
		const tokens = [];

		// 查找开始事件并创建初始令牌
		for (const [elementId, element] of definition.elements) {
			if (element.type.includes('startEvent')) {
				tokens.push({
					id: this.generateId(),
					elementId: elementId,
					data: {},
					createdAt: new Date(),
				});
				break; // 假设只有一个开始事件
			}
		}

		return tokens;
	}

	/**
	 * 生成当前状态下的任务
	 */
	private generateTasks(state: ProcessState): any[] {
		// 这里应该调用TaskGenerator来生成任务
		// 为简化先返回空数组
		return [];
	}

	/**
	 * 生成事件
	 */
	private generateEvents(
		oldState: ProcessState,
		newState: ProcessState,
		action: StateAction
	): any[] {
		const events = [];

		// 根据状态变化生成相应事件
		if (oldState.status === 'created' && newState.status === 'running') {
			events.push({
				type: 'PROCESS_STARTED',
				payload: { processId: newState.id },
				timestamp: new Date(),
			});
		}

		if (newState.status === 'completed') {
			events.push({
				type: 'PROCESS_COMPLETED',
				payload: { processId: newState.id },
				timestamp: new Date(),
			});
		}

		return events;
	}

	/**
	 * 生成唯一ID
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}

	/**
	 * 从 BPMN XML 启动流程（便捷方法）
	 */
	async startFromXml(
		bpmnXml: string,
		instanceId: string,
		variables?: Record<string, any>
	): Promise<ProcessState> {
		const definition = BPMNParser.parse(bpmnXml);
		return this.startProcess(instanceId, variables);
	}

	/**
	 * 启动流程实例
	 */
	startProcess(
		instanceId: string,
		variables?: Record<string, any>
	): ProcessState {
		// 使用现有的 startProcess 实现
		throw new Error('startProcess 方法需要传入 ProcessDefinition 参数');
	}

	/**
	 * 执行动作/完成任务
	 */
	async executeAction(
		instanceId: string,
		nodeId: string,
		context?: Record<string, any>
	): Promise<ExecutionResult> {
		// 实现执行逻辑
		throw new Error('executeAction 方法待实现');
	}

	/**
	 * 分配任务给用户
	 */
	assign(
		instanceId: string,
		nodeId: string,
		assignee?: string,
		candidateUsers?: string[],
		candidateGroups?: string[]
	): void {
		// 实现分配逻辑
		throw new Error('assign 方法待实现');
	}

	/**
	 * 获取流程实例
	 */
	get(instanceId: string): ProcessState | null {
		// 返回实例状态
		return null; // 暂时返回 null，实际应用层实现存储
	}

	/**
	 * 重启流程实例
	 */
	restart(
		instanceId: string,
		fromNodeId?: string,
		variables?: Record<string, any>
	): ProcessState {
		// 实现重启逻辑
		throw new Error('restart 方法待实现');
	}

	/**
	 * 升级流程实例
	 */
	upgrade(
		instanceId: string,
		newBpmnXml: string,
		migrateData?: boolean
	): ProcessState {
		// 实现升级逻辑
		throw new Error('upgrade 方法待实现');
	}
}
