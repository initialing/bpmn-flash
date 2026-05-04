import { Item, ProcessState } from '../types/index.js';
import { WorkflowState, ProcessEvent } from './WorkflowState.js';

/**
 * 任务生成器
 * 负责根据流程状态生成待办任务
 */
export class TaskGenerator {
	/**
	 * 根据流程状态生成待办任务列表
	 */
	static generateTasks(state: ProcessState): Item[] {
		const tasks: Item[] = [];

		// 为每个等待状态的元素生成任务
		for (const token of state.tokens) {
			// 在这里我们会调用相应的执行器来确定是否需要生成任务
			// 由于执行器还未完全实现，我们暂时只处理用户任务
			const task = this.createTaskForToken(state, token);
			if (task) {
				tasks.push(task);
			}
		}

		return tasks;
	}

	/**
	 * 为令牌创建对应的任务
	 */
	private static createTaskForToken(
		state: ProcessState,
		token: any
	): Item | null {
		// 这里需要访问流程定义来确定元素类型
		// 暂时返回null，等待与解析器集成
		return null;
	}

	/**
	 * 从历史记录中恢复未完成的任务
	 */
	static restorePendingTasks(state: ProcessState): Item[] {
		const pendingTasks: Item[] = [];

		// 检查历史记录中是否有未完成的任务
		for (const item of state.items) {
			if (item.status === 'wait' || item.status === 'active') {
				pendingTasks.push(item);
			}
		}

		return pendingTasks;
	}

	/**
	 * 生成任务完成后的后续任务
	 */
	static generateFollowUpTasks(
		state: ProcessState,
		completedTaskId: string
	): Item[] {
		// 当一个任务完成时，根据流程定义生成后续可能的任务
		// 这需要访问流程定义和当前状态来决定下一步
		return [];
	}
}

/**
 * 任务计算器
 * 负责计算任务状态和依赖关系
 */
export class TaskComputer {
	/**
	 * 计算指定流程实例的当前任务列表
	 */
	static computeCurrentTasks(state: ProcessState): Item[] {
		// 合并已有的任务和根据当前状态生成的新任务
		const existingActiveTasks = state.items.filter(
			item => item.status === 'wait' || item.status === 'active'
		);

		const generatedTasks = TaskGenerator.generateTasks(state);

		// 合并并去重
		const allTasks = [...existingActiveTasks];
		for (const genTask of generatedTasks) {
			if (!allTasks.some(t => t.id === genTask.id)) {
				allTasks.push(genTask);
			}
		}

		return allTasks;
	}

	/**
	 * 计算任务依赖关系
	 */
	static computeDependencies(tasks: Item[]): Map<string, string[]> {
		const dependencies = new Map<string, string[]>();

		// 简单实现：目前假定任务间无直接依赖
		// 在完整实现中，这将基于流程定义计算

		return dependencies;
	}

	/**
	 * 计算任务优先级
	 */
	static computePriority(task: Item, state: ProcessState): number {
		// 基于任务类型和流程状态计算优先级
		// 简单实现：紧急任务优先级最高，普通任务按创建时间排序
		switch (task.type) {
			case 'bpmn:startEvent':
				return 100; // 最高优先级
			case 'bpmn:userTask':
				return 50;
			case 'bpmn:endEvent':
				return 10; // 较低优先级
			default:
				return 30;
		}
	}

	/**
	 * 检查任务前置条件是否满足
	 */
	static checkPrerequisites(task: Item, state: ProcessState): boolean {
		// 检查任务的前置条件是否满足
		// 在BPMN中，这通常由网关和顺序流控制
		return true; // 简单实现，总是返回true
	}

	/**
	 * 计算任务完成百分比
	 */
	static computeCompletionPercentage(state: ProcessState): number {
		if (state.items.length === 0) {
			return 0;
		}

		const completedItems = state.items.filter(
			item => item.status === 'completed'
		).length;
		return Math.round((completedItems / state.items.length) * 100);
	}
}
