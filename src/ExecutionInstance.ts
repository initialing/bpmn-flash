import { ProcessDefinition, Token, Item } from './types/index.js';
import { evaluateExpression } from './utils/ExpressionEvaluator.js';

// 简单的日志工具
const logger = {
	error: (msg: string, ...args: any[]) => console.error('[ERROR]', msg, ...args),
	warn: (msg: string, ...args: any[]) => console.warn('[WARN]', msg, ...args),
	info: (msg: string, ...args: any[]) => console.log('[INFO]', msg, ...args),
	debug: (msg: string, ...args: any[]) => console.log('[DEBUG]', msg, ...args),
};

class ExecutionInstance {
	id: string;
	name: string;
	status: 'running' | 'wait' | 'end';
	startedAt: Date;
	endedAt?: Date;
	data: Record<string, any>;
	items: Item[];
	tokens: Token[];
	definition: ProcessDefinition;

	constructor(definition: ProcessDefinition, data: Record<string, any>) {
		this.id = this.generateId();
		this.name = definition.name || definition.id;
		this.status = 'running';
		this.startedAt = new Date();
		this.data = data || {};
		this.items = [];
		this.tokens = [];
		this.definition = definition;

		// 初始化起始令牌
		this.initializeTokens();
	}

	// 获取所有任务项
	getItems(): Item[] {
		return this.items;
	}

	// 获取特定任务项
	getItem(id: string): Item | undefined {
		return this.items.find(item => item.id === id || item.elementId === id);
	}

	// 执行流程
	async execute(): Promise<void> {
		// 执行所有活动令牌
		while (this.tokens.length > 0 && this.status === 'running') {
			const token = this.tokens.shift();
			if (token) {
				await this.executeToken(token);
			}
		}

		// 检查是否所有路径都已完成
		if (this.tokens.length === 0 && this.status === 'running') {
			this.status = 'end';
			this.endedAt = new Date();
		}
	}

	// 继续执行特定元素
	async invoke(
		itemQuery: string | { id?: string; elementId?: string },
		data: Record<string, any>
	): Promise<void> {
		const item = this.getItem(
			typeof itemQuery === 'string'
				? itemQuery
				: itemQuery.elementId || itemQuery.id || ''
		);
		if (!item) {
			throw new Error(`未找到任务项: ${itemQuery}`);
		}

		if (item.status !== 'wait') {
			throw new Error(`任务项 ${item.elementId} 不在等待状态`);
		}

		// 更新任务数据
		item.data = { ...item.data, ...data };
		item.status = 'completed';
		item.endedAt = new Date();

		// 继续执行后续流程
		const element = this.definition.elements.get(item.elementId);
		if (element && element.outgoing && element.outgoing.length > 0) {
			for (const flowId of element.outgoing) {
				const nextElementId = this.getNextElementId(flowId);
				if (nextElementId) {
					const token: Token = {
						id: this.generateId(),
						elementId: nextElementId,
						data: item.data,
						createdAt: new Date(),
					};
					this.tokens.push(token);
					await this.executeToken(token);
				}
			}
		}
	}

	// 分配任务
	async assign(
		itemQuery: string | { id?: string; elementId?: string },
		assignment:
			| {
					assignee?: string;
					candidateUsers?: string[];
					candidateGroups?: string[];
			  }
			| string
	): Promise<void> {
		const item = this.getItem(
			typeof itemQuery === 'string'
				? itemQuery
				: itemQuery.elementId || itemQuery.id || ''
		);
		if (!item) {
			throw new Error(`未找到任务项: ${itemQuery}`);
		}

		if (typeof assignment === 'string') {
			item.assignee = assignment;
		} else {
			item.assignee = assignment.assignee;
			item.candidateUsers = assignment.candidateUsers;
			item.candidateGroups = assignment.candidateGroups;
		}
	}

	// 启动事件
	async startEvent(
		elementId: string,
		data: Record<string, any>
	): Promise<void> {
		const element = this.definition.elements.get(elementId);
		if (!element || !element.type.includes('startEvent')) {
			throw new Error(`元素 ${elementId} 不是起始事件`);
		}

		// 创建新令牌并执行
		const token: Token = {
			id: this.generateId(),
			elementId: elementId,
			data: data || {},
			createdAt: new Date(),
		};

		this.tokens.push(token);
		await this.executeToken(token);
	}

	// 重启任务
	async restart(
		itemQuery: string | { id?: string; elementId?: string },
		data: Record<string, any>
	): Promise<void> {
		const item = this.getItem(
			typeof itemQuery === 'string'
				? itemQuery
				: itemQuery.elementId || itemQuery.id || ''
		);
		if (!item) {
			throw new Error(`未找到任务项: ${itemQuery}`);
		}

		// 重置任务状态
		item.status = 'wait';
		item.data = data;
		item.startedAt = new Date();
		item.endedAt = undefined;

		// 创建新令牌以重新执行该任务
		const token: Token = {
			id: this.generateId(),
			elementId: item.elementId,
			data: item.data,
			createdAt: new Date(),
		};

		this.tokens.push(token);
		await this.executeToken(token);
	}

	// 私有方法：初始化令牌
	private initializeTokens(): void {
		// 查找起始事件
		for (const [id, element] of this.definition.elements) {
			if (element.type.includes('startEvent')) {
				const token: Token = {
					id: this.generateId(),
					elementId: id,
					data: this.data,
					createdAt: new Date(),
				};
				this.tokens.push(token);
				break;
			}
		}
	}

	// 私有方法：执行令牌
	private async executeToken(token: Token): Promise<void> {
		const element = this.definition.elements.get(token.elementId);
		if (!element) {
			return;
		}

		switch (element.type) {
			case 'bpmn:startEvent':
			case 'bpmn:endEvent':
				await this.executeEvent(element, token);
				break;

			case 'bpmn:userTask':
				await this.executeUserTask(element, token);
				break;

			case 'bpmn:serviceTask':
				await this.executeServiceTask(element, token);
				break;

			case 'bpmn:scriptTask':
				await this.executeScriptTask(element, token);
				break;

			case 'bpmn:ExclusiveGateway':
				await this.executeExclusiveGateway(element, token);
				break;

			default:
				// 默认继续执行后续流程
				await this.continueFlow(element, token);
		}
	}

	// 执行事件
	private async executeEvent(element: any, token: Token): Promise<void> {
		if (element.type.includes('endEvent')) {
			this.status = 'end';
			this.endedAt = new Date();
		}

		// 继续执行后续流程
		await this.continueFlow(element, token);
	}

	// 执行用户任务
	private async executeUserTask(element: any, token: Token): Promise<void> {
		// 创建用户任务项
		const item: Item = {
			id: this.generateId(),
			elementId: element.id,
			name: element.name,
			type: element.type,
			status: 'wait',
			data: token.data,
			startedAt: new Date(),
			assignee: null,
			candidateUsers: null,
			candidateGroups: null,
		};

		this.items.push(item);
		this.status = 'wait';

		// 用户任务需要等待外部调用invoke方法来完成
	}

	// 执行服务任务
	private async executeServiceTask(
		element: any,
		token: Token
	): Promise<void> {
		// 模拟服务任务执行
		await this.simulateServiceTask(element, token);

		// 继续执行后续流程
		await this.continueFlow(element, token);
	}

	// 执行脚本任务
	private async executeScriptTask(element: any, token: Token): Promise<void> {
		// 模拟脚本执行
		await this.simulateScriptTask(element, token);

		// 继续执行后续流程
		await this.continueFlow(element, token);
	}

	// 执行排他网关
	private async executeExclusiveGateway(
		element: any,
		token: Token
	): Promise<void> {
		// 获取所有出口顺序流
		const outgoingFlows = element.outgoing || [];
		if (outgoingFlows.length === 0) {
			return;
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
			const flow = this.definition.sequenceFlows.get(flowId);
			if (!flow) continue;

			// 如果是默认顺序流，先记录下来
			if (flowId === defaultFlowId) {
				continue; // 默认流最后处理
			}

			// 检查顺序流是否有条件
			if (flow.conditionExpression) {
				// 评估条件表达式
				const conditionResult = await this.evaluateCondition(
					flow.conditionExpression,
					token.data
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
			const nextElementId = this.getNextElementId(selectedFlowId);
			if (nextElementId) {
				const nextToken: Token = {
					id: this.generateId(),
					elementId: nextElementId,
					data: token.data,
					createdAt: new Date(),
				};
				this.tokens.push(nextToken);
				await this.executeToken(nextToken);
			}
		}
	}

	// 评估条件表达式
	private async evaluateCondition(
		conditionExpression: string | null,
		data: Record<string, any>
	): Promise<boolean> {
		try {
			// 简化版条件评估，实际项目中可能需要更复杂的实现
			// 支持简单的JavaScript表达式
			if (
				conditionExpression &&
				conditionExpression.startsWith('${') &&
				conditionExpression.endsWith('}')
			) {
				const expression = conditionExpression.substring(
					2,
					conditionExpression.length - 1
				);

				// 创建一个包含数据的上下文
				const context = {
					data: data,
					...data, // 展开数据属性，便于直接访问
				};

				// 构建可执行的函数
				const keys = Object.keys(context);
				const values = Object.values(context);

				// 创建函数来评估表达式
				const result = evaluateExpression(expression, context);
				return result; // 使用安全评估器
				return !!result; // 转换为布尔值
			}

			// 如果不是标准格式，假设它始终为true（向后兼容）
			return true;
		} catch (error) {
			logger.error(
				`评估条件表达式出错: ${conditionExpression}`,
				error
			);
			return false;
		}
	}

	// 继续执行流程
	private async continueFlow(element: any, token: Token): Promise<void> {
		if (element.outgoing && element.outgoing.length > 0) {
			for (const flowId of element.outgoing) {
				const nextElementId = this.getNextElementId(flowId);
				if (nextElementId) {
					const nextToken: Token = {
						id: this.generateId(),
						elementId: nextElementId,
						data: token.data,
						createdAt: new Date(),
					};
					this.tokens.push(nextToken);
					await this.executeToken(nextToken);
				}
			}
		}
	}

	// 模拟服务任务执行
	private async simulateServiceTask(
		element: any,
		token: Token
	): Promise<void> {
		// 模拟异步操作
		return new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, 100);
		});
	}

	// 模拟脚本任务执行
	private async simulateScriptTask(
		element: any,
		token: Token
	): Promise<void> {
		// 模拟脚本执行
	}

	// 获取下一个元素ID
	private getNextElementId(flowId: string): string | null {
		const flow = this.definition.sequenceFlows.get(flowId);
		return flow ? flow.targetRef : null;
	}

	// 生成唯一ID
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}
}

export default ExecutionInstance;
