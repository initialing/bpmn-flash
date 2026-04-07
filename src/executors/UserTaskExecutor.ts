import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { ElementLike, TokenLike, Item } from '../types/index.js';

/**
 * 用户任务执行器
 * 处理用户任务节点
 */
export class UserTaskExecutor extends BaseNodeExecutor {
	/**
	 * 获取此执行器支持的节点类型
	 */
	getSupportedTypes(): string[] {
		return ['bpmn:userTask', 'bpmn:manualTask'];
	}

	/**
	 * 执行用户任务
	 */
	async execute(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): Promise<ProcessState> {
		// 记录用户任务执行历史
		let newState = this.addHistoryEntry(state, element, 'start', {
			tokenId: token.id,
			elementId: element.id,
		});

		// 创建用户任务项
		const taskItem: Item = {
			id: this.generateId(),
			elementId: element.id,
			name: element.name || element.id,
			type: element.type,
			status: 'wait',
			data: { ...token.data },
			startedAt: new Date(),
			createdAt: new Date(),
			assignee: this.extractAssignee(element),
			candidateUsers: this.extractCandidateUsers(element),
			candidateGroups: this.extractCandidateGroups(element),
			priority: this.extractPriority(element),
		};

		// 添加任务到状态
		newState = {
			...newState,
			items: [...newState.items, taskItem],
			// 移除当前令牌，因为用户任务需要等待用户操作
			tokens: newState.tokens.filter(t => t.id !== token.id),
		};

		// 设置流程状态为等待（如果有用户任务需要处理）
		if (newState.status === 'running') {
			newState = {
				...newState,
				status: 'suspended',
			};
		}

		return newState;
	}

	/**
	 * 从元素中提取负责人
	 */
	private extractAssignee(element: ElementLike): string | undefined {
		if (element.properties && element.properties.assignee) {
			return element.properties.assignee;
		}
		if (
			element.assignmentDefinition &&
			element.assignmentDefinition.assignee
		) {
			return element.assignmentDefinition.assignee;
		}
		return undefined;
	}

	/**
	 * 从元素中提取候选用户
	 */
	private extractCandidateUsers(element: ElementLike): string[] | undefined {
		if (
			element.assignmentDefinition &&
			element.assignmentDefinition.candidateUsers
		) {
			const users = element.assignmentDefinition.candidateUsers;
			return Array.isArray(users) ? users : users.split(',');
		}
		if (element.properties && element.properties.candidateUsers) {
			const users = element.properties.candidateUsers;
			return Array.isArray(users) ? users : users.split(',');
		}
		return undefined;
	}

	/**
	 * 从元素中提取候选组
	 */
	private extractCandidateGroups(element: ElementLike): string[] | undefined {
		if (
			element.assignmentDefinition &&
			element.assignmentDefinition.candidateGroups
		) {
			const groups = element.assignmentDefinition.candidateGroups;
			return Array.isArray(groups) ? groups : groups.split(',');
		}
		if (element.properties && element.properties.candidateGroups) {
			const groups = element.properties.candidateGroups;
			return Array.isArray(groups) ? groups : groups.split(',');
		}
		return undefined;
	}

	/**
	 * 从元素中提取优先级
	 */
	private extractPriority(element: ElementLike): number | undefined {
		if (element.priority !== undefined) {
			return element.priority;
		}
		if (element.properties && element.properties.priority !== undefined) {
			return element.properties.priority;
		}
		if (
			element.assignmentDefinition &&
			element.assignmentDefinition.priority !== undefined
		) {
			return element.assignmentDefinition.priority;
		}
		return undefined;
	}
}
