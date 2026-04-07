import { ProcessState, ExecutionResult } from '../state/WorkflowState.js';
import { ProcessDefinition, ElementLike, TokenLike } from '../types/index.js';
import { NodeExecutor } from '../executors/NodeExecutor.js';
import { StartEventExecutor } from '../executors/StartEventExecutor.js';
import { EndEventExecutor } from '../executors/EndEventExecutor.js';
import { UserTaskExecutor } from '../executors/UserTaskExecutor.js';
import { ServiceTaskExecutor } from '../executors/ServiceTaskExecutor.js';
import { ExclusiveGatewayExecutor } from '../executors/ExclusiveGatewayExecutor.js';
import { ParallelGatewayExecutor } from '../executors/ParallelGatewayExecutor.js';
import { Item } from '../types/index.js';

/**
 * 执行引擎
 * 负责处理令牌流转和节点执行
 */
export class ExecutionEngine {
	private executors: Map<string, NodeExecutor>;

	constructor() {
		// 初始化所有执行器
		this.executors = new Map();
		this.registerExecutor(new StartEventExecutor());
		this.registerExecutor(new EndEventExecutor());
		this.registerExecutor(new UserTaskExecutor());
		this.registerExecutor(new ServiceTaskExecutor());
		this.registerExecutor(new ExclusiveGatewayExecutor());
		this.registerExecutor(new ParallelGatewayExecutor());
	}

	/**
	 * 注册节点执行器
	 */
	registerExecutor(executor: NodeExecutor): void {
		executor.getSupportedTypes().forEach(type => {
			this.executors.set(type, executor);
		});
	}

	/**
	 * 执行流程状态中的待执行元素
	 * @param state 流程状态
	 * @param definition 流程定义（从 XML 解析得到）
	 */
	async execute(
		state: ProcessState,
		definition: ProcessDefinition
	): Promise<ProcessState> {
		// 执行所有活跃令牌，直到没有更多可执行的令牌
		let currentState = { ...state };
		let hasChanges = true;
		let iterationCount = 0;
		const maxIterations = 100; // 防止无限循环

		while (hasChanges && iterationCount < maxIterations) {
			hasChanges = false;
			iterationCount++;

			// 如果当前状态中有令牌，则执行它们
			if (currentState.tokens && currentState.tokens.length > 0) {
				const newTokens = [...currentState.tokens];
				const processedTokens: string[] = [];

				for (let i = 0; i < newTokens.length; i++) {
					const token = newTokens[i];

					// 尝试执行这个令牌
					const result = await this.executeToken(
						currentState,
						token,
						definition
					);

					if (result.success) {
						// 更新状态
						currentState = result.newState;
						hasChanges = true;
						processedTokens.push(token.id);
					}
				}

				// 从未处理的令牌中过滤掉已处理的
				currentState.tokens = currentState.tokens.filter(
					token => !processedTokens.includes(token.id)
				);
			} else {
				// 如果没有活跃令牌，检查是否流程已完成
				if (currentState.status === 'running') {
					// 检查是否还有未完成的任务
					const incompleteItems = currentState.items.filter(
						item => item.status !== 'completed'
					);

					if (incompleteItems.length === 0) {
						// 如果没有未完成的任务，标记流程为完成
						currentState = {
							...currentState,
							status: 'completed',
							endedAt: new Date(),
						};
					}
				}
				break; // 没有令牌可以执行，退出循环
			}
		}

		return currentState;
	}

	/**
	 * 执行单个令牌
	 */
	private async executeToken(
		state: ProcessState,
		token: TokenLike,
		definition: ProcessDefinition
	): Promise<ExecutionResult> {
		try {
			// 从定义中获取元素
			const element = definition.elements.get(token.elementId);

			// 🔍 关键检查：如果找不到元素，说明 XML 改动过大
			if (!element) {
				throw new Error(
					`流程定义已变更，找不到元素：${token.elementId}。` +
						`请确保传入的 BPMN XML 与流程启动时一致。`
				);
			}

			// 查找执行器
			const executor = this.findExecutor(element.type);
			if (!executor) {
				console.warn(
					`No executor found for element type: ${element.type}`
				);
				return {
					newState: state,
					tasks: [],
					events: [],
					success: true,
				};
			}

			// 执行节点
			const newState = await executor.execute(state, element, token);
			const tasks = this.generateTasks(newState);
			const events = this.generateEvents(state, newState, element);

			return {
				newState,
				tasks,
				events,
				success: true,
			};
		} catch (error) {
			return {
				newState: state,
				tasks: [],
				events: [],
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 处理特定元素
	 */
	async processElement(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): Promise<ProcessState> {
		// 查找适合处理此元素类型的执行器
		const executor = this.findExecutor(element.type);

		if (executor) {
			return await executor.execute(state, element, token);
		} else {
			// 如果没有找到合适的执行器，记录错误并返回原状态
			console.warn(`No executor found for element type: ${element.type}`);
			return state;
		}
	}

	/**
	 * 查找适合处理指定类型元素的执行器
	 */
	private findExecutor(elementType: string): NodeExecutor | undefined {
		return this.executors.get(elementType);
	}

	/**
	 * 继续执行流程（处理后续令牌）
	 */
	async continueExecution(state: ProcessState): Promise<ProcessState> {
		return await this.execute(state, {} as ProcessDefinition);
	}

	/**
	 * 获取所有注册的执行器
	 */
	getExecutors(): NodeExecutor[] {
		return Array.from(this.executors.values());
	}

	/**
	 * 生成任务列表
	 */
	private generateTasks(state: ProcessState): Item[] {
		return state.items.filter(item => item.status === 'wait');
	}

	/**
	 * 生成事件列表
	 */
	private generateEvents(
		oldState: ProcessState,
		newState: ProcessState,
		element: ElementLike
	): ProcessEvent[] {
		const events: ProcessEvent[] = [];
		if (element.type.includes('startEvent')) {
			events.push({
				type: 'TASK_CREATED',
				payload: { elementId: element.id },
				timestamp: new Date(),
			});
		}
		return events;
	}
}
