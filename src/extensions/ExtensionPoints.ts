/**
 * @fileoverview Extension Points and Plugin System Types
 * 为未来的钩子函数和插件系统预留的接口和类型定义
 * 
 * 设计原则：
 * 1. 不改变当前核心逻辑
 * 2. 提供清晰的扩展点
 * 3. 保持无状态纯函数设计
 * 4. 可选使用，不影响 MVP
 */

import { ProcessState } from '../state/WorkflowState.js';
import { ProcessDefinition } from '../types/index.js';

// ==================== 扩展点类型 ====================

/**
 * 引擎生命周期钩子类型
 */
export type EngineHookType =
	| 'beforeExecute'      // 执行前
	| 'afterExecute'       // 执行后
	| 'beforeTransition'   // 状态转换前
	| 'afterTransition'    // 状态转换后
	| 'onTaskCreated'      // 任务创建时
	| 'onTaskCompleted'    // 任务完成时
	| 'onProcessStarted'   // 流程启动时
	| 'onProcessCompleted'; // 流程完成时

/**
 * 钩子函数签名
 */
export interface EngineHook {
	/**
	 * 钩子函数
	 * @param context 执行上下文
	 * @returns Promise<void> 或 void（支持同步和异步钩子）
	 */
	(context: HookContext): Promise<void> | void;
}

/**
 * 钩子执行上下文
 */
export interface HookContext {
	/** 钩子类型 */
	hookType: EngineHookType;
	/** 当前流程状态 */
	state: ProcessState;
	/** 流程定义 */
	definition?: ProcessDefinition;
	/** 执行动作 */
	action?: any;
	/** 执行结果（仅 after 钩子） */
	result?: any;
	/** 时间戳 */
	timestamp: Date;
}

// ==================== 插件系统类型 ====================

/**
 * 插件接口
 * 插件可以通过注册钩子来扩展引擎功能
 */
export interface WorkflowPlugin {
	/** 插件名称 */
	name: string;
	/** 插件版本 */
	version: string;
	/** 插件描述 */
	description?: string;
	/**
	 * 安装插件时调用
	 * @param registry 钩子注册器
	 */
	install(registry: PluginRegistry): void;
}

/**
 * 钩子注册器接口
 * 插件通过此接口注册钩子函数
 */
export interface PluginRegistry {
	/**
	 * 注册钩子函数
	 * @param hookType 钩子类型
	 * @param hook 钩子函数
	 */
	registerHook(hookType: EngineHookType, hook: EngineHook): void;
	
	/**
	 * 注销钩子函数
	 * @param hookType 钩子类型
	 * @param hook 钩子函数
	 */
	unregisterHook(hookType: EngineHookType, hook: EngineHook): void;
}

// ==================== 扩展的 ExecutionResult ====================

/**
 * 扩展的执行结果（未来可能使用）
 * 包含插件执行结果
 */
export interface ExtendedExecutionResult {
	/** 新的状态 */
	newState: ProcessState;
	/** 产生的新任务 */
	tasks: any[];
	/** 产生的事件 */
	events: any[];
	/** 是否执行成功 */
	success: boolean;
	/** 错误信息 */
	error?: string;
	/** 插件执行结果（预留） */
	pluginResults?: Record<string, any>;
}

// ==================== 中间件类型（预留） ====================

/**
 * 中间件函数类型（未来可能使用）
 * 类似 Koa/Express 的中间件模式
 */
export interface Middleware {
	/**
	 * 中间件函数
	 * @param context 执行上下文
	 * @param next 下一个中间件
	 */
	(context: HookContext, next: () => Promise<void>): Promise<void>;
}

// ==================== 配置选项 ====================

/**
 * 引擎配置选项
 * 预留插件和钩子相关配置
 */
export interface WorkflowEngineOptions {
	/**
	 * 是否启用钩子系统
	 * @default false
	 */
	enableHooks?: boolean;
	
	/**
	 * 预加载的插件列表
	 */
	plugins?: WorkflowPlugin[];
	
	/**
	 * 钩子超时时间（毫秒）
	 * @default 5000
	 */
	hookTimeout?: number;
	
	/**
	 * 是否在钩子失败时中断执行
	 * @default false
	 */
	failFast?: boolean;
}

// ==================== 默认实现（预留） ====================

/**
 * 简单的钩子注册器实现（预留）
 * 未来可以在 WorkflowEngine 中使用
 */
export class SimplePluginRegistry implements PluginRegistry {
	private hooks: Map<EngineHookType, Set<EngineHook>> = new Map();

	registerHook(hookType: EngineHookType, hook: EngineHook): void {
		if (!this.hooks.has(hookType)) {
			this.hooks.set(hookType, new Set());
		}
		this.hooks.get(hookType)!.add(hook);
	}

	unregisterHook(hookType: EngineHookType, hook: EngineHook): void {
		const hooks = this.hooks.get(hookType);
		if (hooks) {
			hooks.delete(hook);
		}
	}

	/**
	 * 获取指定类型的所有钩子
	 */
	getHooks(hookType: EngineHookType): EngineHook[] {
		const hooks = this.hooks.get(hookType);
		return hooks ? Array.from(hooks) : [];
	}

	/**
	 * 清空所有钩子
	 */
	clear(): void {
		this.hooks.clear();
	}
}

// ==================== 使用示例（注释） ====================

/**
 * 插件使用示例（未来）
 * 
 * // 1. 创建插件
 * const loggingPlugin: WorkflowPlugin = {
 *   name: 'logging-plugin',
 *   version: '1.0.0',
 *   description: '记录流程执行日志',
 *   
 *   install(registry: PluginRegistry) {
 *     // 注册执行前钩子
 *     registry.registerHook('beforeExecute', async (context) => {
 *       console.log(`执行前：流程 ${context.state.id}`);
 *     });
 *     
 *     // 注册执行后钩子
 *     registry.registerHook('afterExecute', async (context) => {
 *       console.log(`执行后：流程 ${context.state.id}, 结果：${context.result?.success}`);
 *     });
 *   }
 * };
 * 
 * // 2. 使用插件
 * const engine = new WorkflowEngine({
 *   enableHooks: true,
 *   plugins: [loggingPlugin]
 * });
 * 
 * // 3. 手动注册钩子
 * engine.registerHook('onTaskCreated', (context) => {
 *   console.log('任务创建:', context.state.items);
 * });
 */

// ==================== 导出 ====================

export type {
	EngineHookType,
	EngineHook,
	HookContext,
	WorkflowPlugin,
	PluginRegistry,
	Middleware,
	WorkflowEngineOptions,
	ExtendedExecutionResult
};
