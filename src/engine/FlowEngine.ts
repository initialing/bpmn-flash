/**
 * FlowEngine — v3 瘦引擎
 * 引擎只管令牌流转，业务逻辑交给外部应用通过钩子处理
 */

import type { ProcessState } from '../state/ProcessState.js';
import type { TokenV3 as Token, Element, ProcessDefinition, TraceEntry } from '../types/index.js';
import type { FlowEngineOptions, NodeHookContext, ScriptExecutorPlugin } from '../hooks/types.js';
import { TokenManager } from './TokenManager.js';
import { GatewayResolver } from './GatewayResolver.js';
import { FlowTraverser } from './FlowTraverser.js';
import { HookManager } from '../hooks/HookManager.js';
import BPMNParser from '../parser/BPMNParser.js';
import { generateId } from '../state/IdGenerator.js';

// 节点类别判断
const GATEWAY_TYPES = new Set([
	'bpmn:exclusiveGateway',
	'bpmn:parallelGateway',
	'bpmn:inclusiveGateway',
	'bpmn:eventBasedGateway',
]);

function isGateway(type: string): boolean {
	return GATEWAY_TYPES.has(type);
}

function isEndEvent(type: string): boolean {
	return type === 'bpmn:endEvent' || type.includes('endEvent');
}

function isStartEvent(type: string): boolean {
	return type === 'bpmn:startEvent' || type.includes('startEvent');
}

/** 挂起令牌查询结果 */
export interface SuspendedTokenInfo {
	tokenId: string;
	nodeId: string;
	nodeType: string;
	nodeName: string;
	nodeProperties: Record<string, any>;
	tokenData: Record<string, any>;
	suspendedAt: Date;
}

/** 插件接口 */
export interface FlowPlugin {
	name: string;
	version: string;
	install(engine: FlowEngine): void;
}

export class FlowEngine {
	private tokenManager: TokenManager;
	private gatewayResolver: GatewayResolver;
	private flowTraverser: FlowTraverser;
	private hooks: HookManager;
	private scriptExecutor: ScriptExecutorPlugin | null;

	constructor(options: FlowEngineOptions = {}) {
		this.tokenManager = new TokenManager();
		this.hooks = new HookManager(options);
		this.gatewayResolver = new GatewayResolver(this.tokenManager);
		this.flowTraverser = new FlowTraverser(this.tokenManager, this.hooks);
		this.scriptExecutor = options.scriptExecutor || null;
	}

	// ==================== 生命周期 API ====================

	/** 启动流程 */
	async startProcess(
		bpmnXML: string,
		initialData: Record<string, any> = {}
	): Promise<ProcessState> {
		const definition = BPMNParser.parse(bpmnXML);
		const now = new Date();

		let state: ProcessState = {
			id: generateId(),
			name: definition.name || definition.id,
			status: 'running',
			definitionId: definition.id,
			variables: { ...initialData },
			tokens: [],
			trace: [],
			_gatewayWait: {},
			createdAt: now,
			startedAt: now,
		};

		await this.hooks.emit('processStart', { state, definition });

		const startEvent = this.findStartEvent(definition);
		state = this.tokenManager.createToken(state, startEvent.id, {});

		state = await this.advance(state, definition);
		return state;
	}

	/** 恢复挂起的令牌 */
	async resume(
		state: ProcessState,
		tokenId: string,
		bpmnXML: string,
		data?: Record<string, any>
	): Promise<ProcessState> {
		const definition = BPMNParser.parse(bpmnXML);

		const token = state.tokens.find(t => t.id === tokenId);
		if (!token) throw new Error(`Token ${tokenId} not found`);
		if (token.status !== 'suspended') {
			throw new Error(`Token ${tokenId} is not suspended (status: ${token.status})`);
		}

		// 恢复令牌
		state = this.tokenManager.resumeToken(state, tokenId, data);

		const node = definition.elements.get(token.elementId);
		if (!node) throw new Error(`Node ${token.elementId} not found in definition`);

		const updatedToken = state.tokens.find(t => t.id === tokenId)!;

		// 触发 nodeLeave
		await this.emitNodeHook('nodeLeave', state, updatedToken, node, definition);

		// trace: node-leave
		state = this.addTrace(state, {
			type: 'node-leave',
			elementId: node.id,
			elementType: node.type,
			elementName: node.name,
			tokenId,
			timestamp: new Date(),
		});

		// 沿出边移动
		state = await this.flowTraverser.traverse(state, updatedToken, node, definition);

		// 继续推进
		state = await this.advance(state, definition);
		return state;
	}

	/** 终止流程 */
	terminate(state: ProcessState): ProcessState {
		return {
			...state,
			status: 'terminated',
			tokens: [],
			endedAt: new Date(),
		};
	}

	// ==================== 查询 API ====================

	/** 获取所有挂起的令牌信息 */
	getSuspendedTokens(state: ProcessState, bpmnXML: string): SuspendedTokenInfo[] {
		const definition = BPMNParser.parse(bpmnXML);
		return state.tokens
			.filter(t => t.status === 'suspended')
			.map(t => {
				const node = definition.elements.get(t.elementId);
				return {
					tokenId: t.id,
					nodeId: t.elementId,
					nodeType: node?.type || 'unknown',
					nodeName: node?.name || '',
					nodeProperties: node?.properties || {},
					tokenData: t.data,
					suspendedAt: t.suspendedAt!,
				};
			});
	}

	// ==================== 核心推进循环 ====================

	private async advance(
		state: ProcessState,
		definition: ProcessDefinition
	): Promise<ProcessState> {
		let hasProgress = true;
		let iterations = 0;
		const MAX = 1000;

		while (hasProgress && iterations < MAX) {
			hasProgress = false;
			iterations++;

			const activeTokens = state.tokens.filter(t => t.status === 'active');
			if (activeTokens.length === 0) break;

			for (const token of activeTokens) {
				// 检查 token 是否还存在且 active
				if (!state.tokens.some(t => t.id === token.id && t.status === 'active')) {
					continue;
				}

				const node = definition.elements.get(token.elementId);
				if (!node) continue;

				if (isStartEvent(node.type)) {
					// StartEvent：自动通过
					state = this.addTrace(state, {
						type: 'node-enter', elementId: node.id, elementType: node.type,
						elementName: node.name, tokenId: token.id, timestamp: new Date(),
					});
					await this.emitNodeHook('nodeEnter', state, token, node, definition);
					state = this.addTrace(state, {
						type: 'node-leave', elementId: node.id, elementType: node.type,
						elementName: node.name, tokenId: token.id, timestamp: new Date(),
					});
					await this.emitNodeHook('nodeLeave', state, token, node, definition);
					state = await this.flowTraverser.traverse(state, token, node, definition);
					hasProgress = true;

				} else if (isEndEvent(node.type)) {
					// EndEvent：销毁令牌
					state = this.addTrace(state, {
						type: 'node-enter', elementId: node.id, elementType: node.type,
						elementName: node.name, tokenId: token.id, timestamp: new Date(),
					});
					await this.emitNodeHook('nodeEnter', state, token, node, definition);
					state = this.tokenManager.destroyToken(state, token.id);
					state = this.addTrace(state, {
						type: 'node-leave', elementId: node.id, elementType: node.type,
						elementName: node.name, tokenId: token.id, timestamp: new Date(),
					});
					await this.emitNodeHook('nodeLeave', state, token, node, definition);
					hasProgress = true;

				} else if (isGateway(node.type)) {
					// Gateway：引擎内部处理
					state = this.addTrace(state, {
						type: 'node-enter', elementId: node.id, elementType: node.type,
						elementName: node.name, tokenId: token.id, timestamp: new Date(),
					});
					await this.emitNodeHook('nodeEnter', state, token, node, definition);

					state = this.gatewayResolver.resolve(state, token, node, definition);

					state = this.addTrace(state, {
						type: 'gateway-resolve', elementId: node.id, elementType: node.type,
						elementName: node.name, tokenId: token.id, timestamp: new Date(),
					});
					hasProgress = true;

				} else {
					// 普通业务节点（含 scriptTask）：钩子决定一切
					state = this.addTrace(state, {
						type: 'node-enter', elementId: node.id, elementType: node.type,
						elementName: node.name, tokenId: token.id, timestamp: new Date(),
					});

					let suspended = false;
					const tokenDataPatch: Record<string, any> = {};
					const varPatch: Record<string, any> = {};
					const scriptExecutor = this.scriptExecutor;
					const currentState = state;

					const ctx: NodeHookContext = {
						state,
						token,
						node,
						definition,
						suspend: () => { suspended = true; },
						setTokenData: (d) => Object.assign(tokenDataPatch, d),
						setVariables: (v) => Object.assign(varPatch, v),
						executeScript: (script: string): Promise<Record<string, any>> => {
							if (!scriptExecutor) {
								return Promise.reject(
									new Error('executeScript 不可用：未注册 ScriptExecutorPlugin')
								);
							}
							return new Promise((resolve, reject) => {
								try {
									scriptExecutor.execute(currentState, script, (error, result) => {
										if (error) reject(error);
										else resolve(result || {});
									});
								} catch (e) { reject(e); }
							});
						},
					};

					await this.hooks.emit('nodeEnter', ctx);

					// 应用数据变更
					if (Object.keys(tokenDataPatch).length > 0) {
						state = this.tokenManager.updateTokenData(state, token.id, tokenDataPatch);
					}
					if (Object.keys(varPatch).length > 0) {
						state = { ...state, variables: { ...state.variables, ...varPatch } };
					}

					if (suspended) {
						state = this.tokenManager.suspendToken(state, token.id);
					} else {
						// 自动通过
						state = this.addTrace(state, {
							type: 'node-leave', elementId: node.id, elementType: node.type,
							elementName: node.name, tokenId: token.id, timestamp: new Date(),
						});

						const currentToken = state.tokens.find(t => t.id === token.id);
						if (currentToken) {
							await this.emitNodeHook('nodeLeave', state, currentToken, node, definition);
							state = await this.flowTraverser.traverse(state, currentToken, node, definition);
						}
						hasProgress = true;
					}
				}
			}
		}

		// 检查流程是否结束
		state = await this.checkCompletion(state, definition);
		return state;
	}

	// ==================== 辅助方法 ====================

	private findStartEvent(definition: ProcessDefinition): Element {
		for (const [, element] of definition.elements) {
			if (isStartEvent(element.type)) return element;
		}
		throw new Error('流程定义中未找到 startEvent');
	}

	private async checkCompletion(
		state: ProcessState,
		definition: ProcessDefinition
	): Promise<ProcessState> {
		if (state.tokens.length === 0 && state.status === 'running') {
			state = { ...state, status: 'completed', endedAt: new Date() };
			await this.hooks.emit('processEnd', { state, definition });
		}
		return state;
	}

	private addTrace(state: ProcessState, entry: TraceEntry): ProcessState {
		return { ...state, trace: [...state.trace, entry] };
	}

	/** 触发节点钩子（简化版，suspend 无效） */
	private async emitNodeHook(
		event: 'nodeEnter' | 'nodeLeave',
		state: ProcessState,
		token: Token,
		node: Element,
		definition: ProcessDefinition
	): Promise<void> {
		await this.hooks.emit(event, {
			state, token, node, definition,
			suspend: () => {},
			setTokenData: () => {},
			setVariables: () => {},
			executeScript: () => Promise.reject(new Error('not available')),
		});
	}
}
