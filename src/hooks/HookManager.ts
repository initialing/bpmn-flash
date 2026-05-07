/**
 * 钩子管理器
 * 从 FlowEngineOptions 提取钩子，统一管理触发
 */

import type { FlowEngineOptions, HookEvent, HookHandlerMap } from './types.js';

export class HookManager {
	private handlers: Map<string, Function | undefined> = new Map();

	constructor(options: FlowEngineOptions = {}) {
		this.handlers.set('nodeEnter', options.onNodeEnter);
		this.handlers.set('nodeLeave', options.onNodeLeave);
		this.handlers.set('sequenceFlow', options.onSequenceFlow);
		this.handlers.set('processStart', options.onProcessStart);
		this.handlers.set('processEnd', options.onProcessEnd);
	}

	/**
	 * 触发钩子，支持 async
	 * handler 抛异常时记录日志但不中断引擎
	 */
	async emit<E extends HookEvent>(
		event: E,
		context: Parameters<HookHandlerMap[E]>[0]
	): Promise<void> {
		const handler = this.handlers.get(event);
		if (!handler) return;

		try {
			await (handler as Function)(context);
		} catch (error) {
			console.error(`[HookManager] ${event} handler error:`, error);
		}
	}
}
