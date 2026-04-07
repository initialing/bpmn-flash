import BPMNParser from './parser/BPMNParser';
import ExecutionInstance from './ExecutionInstance';
import { ProcessDefinition } from './types/index';

class Engine {
	private processDefinitions: Map<string, ProcessDefinition>;
	private processInstances: Map<string, ExecutionInstance>;
	constructor() {
		this.processDefinitions = new Map();
		this.processInstances = new Map();
	}

	async startFromXml(
		xml: string,
		data: Record<string, string>,
		startNodeId?: string,
		userName?: string,
		options?: Record<string, string>
	): Promise<ExecutionInstance> {
		const processDefinition = BPMNParser.parse(xml);
		const processName = processDefinition.name || processDefinition.id;

		this.processDefinitions.set(processName, processDefinition);

		return this.start(processName, data, startNodeId, userName, options);
	}

	async start(
		name: string,
		data: Record<string, string>,
		startNodeId?: string,
		userName?: string,
		options?: Record<string, string>
	): Promise<ExecutionInstance> {
		const processDefinition = this.processDefinitions.get(name);
		if (!processDefinition) {
			throw new Error(`流程定义 '${name}' 未找到`);
		}

		const execution = new ExecutionInstance(processDefinition, data);
		this.processInstances.set(execution.id, execution);

		await execution.execute();

		return execution;
	}

	async get(instanceQuery: { id?: string }): Promise<ExecutionInstance> {
		let execution: ExecutionInstance | undefined;

		if (instanceQuery.id) {
			execution = this.processInstances.get(instanceQuery.id);
		} else {
			throw new Error('仅支持通过ID查询实例');
		}

		if (!execution) {
			throw new Error(`未找到流程实例: ${JSON.stringify(instanceQuery)}`);
		}

		return execution;
	}

	async invoke(
		itemQuery: { instanceId?: string; itemId?: string; elementId?: string },
		data: Record<string, string>,
		userName?: string,
		options?: Record<string, string>
	): Promise<ExecutionInstance> {
		const execution = await this.getExecutionFromItemQuery(itemQuery);
		await execution.invoke(
			itemQuery.elementId || itemQuery.itemId || '',
			data
		);
		return execution;
	}

	async assign(
		itemQuery: { instanceId?: string; itemId?: string; elementId?: string },
		data: Record<string, string>,
		assignment:
			| {
					assignee?: string;
					candidateUsers?: string[];
					candidateGroups?: string[];
			  }
			| string,
		userName?: string,
		options?: Record<string, string>
	): Promise<ExecutionInstance> {
		const execution = await this.getExecutionFromItemQuery(itemQuery);
		await execution.assign(
			itemQuery.elementId || itemQuery.itemId || '',
			assignment
		);
		return execution;
	}

	async startRepeatTimerEvent(
		instanceId: string,
		prevItem: any,
		data: Record<string, string>,
		options?: Record<string, string>
	): Promise<ExecutionInstance> {
		const execution = await this.get({ id: instanceId });
		return execution;
	}

	async startEvent(
		instanceId: string,
		elementId: string,
		data: Record<string, string>,
		userName?: string,
		options?: Record<string, string>
	): Promise<ExecutionInstance> {
		const execution = await this.get({ id: instanceId });
		await execution.startEvent(elementId, data);
		return execution;
	}

	async throwMessage(
		messageId: string,
		data: Record<string, string>,
		matchingQuery?: Record<string, string>
	): Promise<void> {
		throw new Error('消息事件功能尚未实现');
	}

	async throwSignal(
		signalId: string,
		data: Record<string, string>,
		matchingQuery?: Record<string, string>
	): Promise<void> {
		throw new Error('信号事件功能尚未实现');
	}

	async restart(
		itemQuery: { instanceId?: string; itemId?: string; elementId?: string },
		data: Record<string, string>,
		userName?: string,
		options?: Record<string, string>
	): Promise<ExecutionInstance> {
		const execution = await this.getExecutionFromItemQuery(itemQuery);
		await execution.restart(
			itemQuery.elementId || itemQuery.itemId || '',
			data
		);
		return execution;
	}

	async upgrade(model: string, afterNodeIds: string[]): Promise<string[]> {
		return [];
	}

	private async getExecutionFromItemQuery(itemQuery: {
		instanceId?: string;
		itemId?: string;
	}): Promise<ExecutionInstance> {
		if (itemQuery.instanceId) {
			return this.get({ id: itemQuery.instanceId });
		} else if (itemQuery.itemId) {
			for (const [, instance] of this.processInstances) {
				if (
					instance
						.getItems()
						.some(item => item.id === itemQuery.itemId)
				) {
					return instance;
				}
			}
		}
		throw new Error(`无法找到执行实例: ${JSON.stringify(itemQuery)}`);
	}
}

export default Engine;
