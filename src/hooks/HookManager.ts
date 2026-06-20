/**
 * 钩子管理器
 * 从 FlowEngineOptions 提取钩子，统一管理触发
 */

import type { FlowEngineOptions, HookEvent, HookHandlerMap } from './types.js';

export class HookManager {
	private handlers: Map<HookEvent, Function | undefined> = new Map();
	private multiHandlers: Map<HookEvent, Set<Function>> = new Map();

	constructor(options: FlowEngineOptions = {}) {
		this._setHandler('nodeEnter', options.onNodeEnter);
		this._setHandler('nodeLeave', options.onNodeLeave);
		this._setHandler('sequenceFlow', options.onSequenceFlow);
		this._setHandler('processStart', options.onProcessStart);
		this._setHandler('processEnd', options.onProcessEnd);
	}

	/**
	 * 注册钩子（支持多个 handler）
	 */
	on<E extends HookEvent>(event: E, handler: HookHandlerMap[E]): void {
		if (!this.multiHandlers.has(event)) {
			this.multiHandlers.set(event, new Set());
		}
		this.multiHandlers.get(event)!.add(handler as Function);
	}

	/**
	 * 注销钩子
	 */
	off<E extends HookEvent>(event: E, handler: HookHandlerMap[E]): void {
		const handlers = this.multiHandlers.get(event);
		if (handlers) {
			handlers.delete(handler as Function);
			if (handlers.size === 0) {
				this.multiHandlers.delete(event);
			}
		}
	}

	/**
	 * 触发钩子，支持多个 handler 和 async
	 */
	async emit<E extends HookEvent>(
		event: E,
		context: Parameters<HookHandlerMap[E]>[0]
	): Promise<void> {
		// 先执行多 handlers
		const multiHandlers = this.multiHandlers.get(event);
		if (multiHandlers) {
			for (const handler of multiHandlers) {
				try {
					await handler(context);
				} catch (error) {
					console.error(`[HookManager] ${event} handler error:`, error);
				}
			}
		}

		// 再执行构造器注入的 handler（保持向后兼容）
		const handler = this.handlers.get(event);
		if (!handler) return;

		try {
			await handler(context);
		} catch (error) {
			console.error(`[HookManager] ${event} handler error:`, error);
		}
	}

	/** 设置构造器注入的 handler */
	private _setHandler(event: HookEvent, handler: Function | undefined): void {
		this.handlers.set(event, handler);
	}
}
