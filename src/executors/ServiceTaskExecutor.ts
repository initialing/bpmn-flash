import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { ElementLike, TokenLike } from '../types/index.js';

/**
 * 服务任务执行器
 * 处理服务任务节点
 */
export class ServiceTaskExecutor extends BaseNodeExecutor {
	/**
	 * 获取此执行器支持的节点类型
	 */
	getSupportedTypes(): string[] {
		return ['bpmn:serviceTask'];
	}

	/**
	 * 执行服务任务
	 */
	async execute(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): Promise<ProcessState> {
		// 记录服务任务执行历史
		let newState = this.addHistoryEntry(state, element, 'start', {
			tokenId: token.id,
			elementId: element.id,
		});

		try {
			// 执行服务任务逻辑
			const result = await this.executeServiceTask(element, token.data);

			// 记录执行结果
			newState = this.addHistoryEntry(newState, element, 'complete', {
				tokenId: token.id,
				elementId: element.id,
				result,
			});

			// 移除当前令牌
			newState = {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};

			// 更新流程数据（如果服务任务返回了新数据）
			if (result && typeof result === 'object') {
				newState = {
					...newState,
					data: { ...newState.data, ...result },
				};
			}

			// 继续执行后续节点
			newState = this.continueToNextElements(newState, element, {
				...token.data,
				...result,
			});

			return newState;
		} catch (error) {
			// 记录错误
			newState = this.addHistoryEntry(newState, element, 'error', {
				tokenId: token.id,
				elementId: element.id,
				error: error instanceof Error ? error.message : String(error),
			});

			// 移除当前令牌
			newState = {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};

			return newState;
		}
	}

	/**
	 * 执行具体的服务任务
	 */
	private async executeServiceTask(
		element: ElementLike,
		inputData: Record<string, any>
	): Promise<Record<string, any>> {
		const implementation =
			element.properties?.implementation || element.properties?.class;

		if (implementation) {
			switch (implementation) {
			case 'http-service':
				return this.executeHttpService(element, inputData);
			case 'email-service':
				return this.executeEmailService(element, inputData);
			case 'script':
				return this.executeScriptService(element, inputData);
			default:
				return new Promise(resolve => {
					setTimeout(() => {
						resolve(inputData);
					}, 100);
				});
			}
		} else {
			return new Promise(resolve => {
				setTimeout(() => {
					resolve(inputData);
				}, 100);
			});
		}
	}

	/**
	 * 执行 HTTP 服务
	 */
	private async executeHttpService(
		element: ElementLike,
		inputData: Record<string, any>
	): Promise<Record<string, any>> {
		console.log(`Executing HTTP service for element ${element.id}`);
		return { ...inputData, httpResult: 'success' };
	}

	/**
	 * 执行邮件服务
	 */
	private async executeEmailService(
		element: ElementLike,
		inputData: Record<string, any>
	): Promise<Record<string, any>> {
		console.log(`Sending email for element ${element.id}`);
		return { ...inputData, emailSent: true };
	}

	/**
	 * 执行脚本服务
	 */
	private async executeScriptService(
		element: ElementLike,
		inputData: Record<string, any>
	): Promise<Record<string, any>> {
		const script = element.properties?.script;
		if (script) {
			console.log(`Executing script for element ${element.id}`);
			return { ...inputData, scriptResult: 'executed' };
		}
		return inputData;
	}

	/**
	 * 继续执行后续节点
	 */
	private continueToNextElements(
		state: ProcessState,
		element: ElementLike,
		outputData: Record<string, any>
	): ProcessState {
		const nextElementIds = element.outgoing || [];
		const newTokens = nextElementIds.map(elementId =>
			this.createToken(elementId, outputData)
		);

		return {
			...state,
			tokens: [...state.tokens, ...newTokens],
		};
	}
}
