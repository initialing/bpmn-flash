/**
 * 网关解析器
 * 引擎内部唯一保留的"节点执行逻辑"
 * 处理排他/并行/包含网关的分支和合并
 */

import type { ProcessState } from '../state/ProcessState.js';
import type { TokenV3 as Token, Element, ProcessDefinition } from '../types/index.js';
import { TokenManager } from './TokenManager.js';
import { evaluateExpression } from '../utils/ExpressionEvaluator.js';

export class GatewayResolver {
	private tokenManager: TokenManager;

	constructor(tokenManager: TokenManager) {
		this.tokenManager = tokenManager;
	}

	/** 分发入口 */
	resolve(
		state: ProcessState,
		token: Token,
		gateway: Element,
		definition: ProcessDefinition
	): ProcessState {
		switch (gateway.type) {
		case 'bpmn:exclusiveGateway':
			return this.resolveExclusive(state, token, gateway, definition);
		case 'bpmn:parallelGateway':
			return this.resolveParallel(state, token, gateway, definition);
		case 'bpmn:inclusiveGateway':
			return this.resolveInclusive(state, token, gateway, definition);
		default:
			return this.passThrough(state, token, gateway, definition);
		}
	}

	/** 排他网关：按顺序评估条件，第一个为 true 的胜出 */
	private resolveExclusive(
		state: ProcessState,
		token: Token,
		gateway: Element,
		definition: ProcessDefinition
	): ProcessState {
		const outgoing = gateway.outgoing || [];
		const defaultFlowId = gateway.properties?.default || null;
		// BPMNParser 会将 ${var} 转换为 ${data.var}，所以 context 需要 data 前缀
		const mergedVars = { ...state.variables, ...token.data };
		const context = { ...mergedVars, data: mergedVars };

		state = this.tokenManager.destroyToken(state, token.id);

		for (const flowId of outgoing) {
			if (flowId === defaultFlowId) continue;
			const flow = definition.sequenceFlows.get(flowId);
			if (!flow) continue;

			if (!flow.conditionExpression) {
				return this.tokenManager.createToken(state, flow.targetRef, token.data);
			}
			if (evaluateExpression(flow.conditionExpression, context)) {
				return this.tokenManager.createToken(state, flow.targetRef, token.data);
			}
		}

		// 走 default
		if (defaultFlowId) {
			const defaultFlow = definition.sequenceFlows.get(defaultFlowId);
			if (defaultFlow) {
				return this.tokenManager.createToken(state, defaultFlow.targetRef, token.data);
			}
		}

		// 只有一条出边
		if (outgoing.length === 1) {
			const flow = definition.sequenceFlows.get(outgoing[0]);
			if (flow) {
				return this.tokenManager.createToken(state, flow.targetRef, token.data);
			}
		}

		throw new Error(`排他网关 ${gateway.id} 无满足条件的分支且无默认路径`);
	}

	/** 并行网关：分裂或汇聚 */
	private resolveParallel(
		state: ProcessState,
		token: Token,
		gateway: Element,
		definition: ProcessDefinition
	): ProcessState {
		const incoming = gateway.incoming || [];
		const outgoing = gateway.outgoing || [];

		if (incoming.length <= 1) {
			// 分裂模式
			state = this.tokenManager.destroyToken(state, token.id);
			for (const flowId of outgoing) {
				const flow = definition.sequenceFlows.get(flowId);
				if (flow) {
					state = this.tokenManager.createToken(state, flow.targetRef, token.data);
				}
			}
			return state;
		}

		// 汇聚模式
		const waitKey = gateway.id;
		const arrived = [...(state._gatewayWait[waitKey] || []), token.id];
		state = {
			...state,
			_gatewayWait: { ...state._gatewayWait, [waitKey]: arrived },
		};
		state = this.tokenManager.destroyToken(state, token.id);

		if (arrived.length >= incoming.length) {
			// 全部到达
			const { [waitKey]: _, ...restWait } = state._gatewayWait;
			state = { ...state, _gatewayWait: restWait };
			for (const flowId of outgoing) {
				const flow = definition.sequenceFlows.get(flowId);
				if (flow) {
					state = this.tokenManager.createToken(state, flow.targetRef, token.data);
				}
			}
		}

		return state;
	}

	/** 包含网关：分裂时所有满足条件的都走 */
	private resolveInclusive(
		state: ProcessState,
		token: Token,
		gateway: Element,
		definition: ProcessDefinition
	): ProcessState {
		const incoming = gateway.incoming || [];
		const outgoing = gateway.outgoing || [];

		if (incoming.length <= 1) {
			// 分裂模式
			const mergedVars = { ...state.variables, ...token.data };
			const context = { ...mergedVars, data: mergedVars };
			const defaultFlowId = gateway.properties?.default || null;
			state = this.tokenManager.destroyToken(state, token.id);

			let anySelected = false;
			for (const flowId of outgoing) {
				if (flowId === defaultFlowId) continue;
				const flow = definition.sequenceFlows.get(flowId);
				if (!flow) continue;

				if (!flow.conditionExpression ||
					evaluateExpression(flow.conditionExpression, context)) {
					state = this.tokenManager.createToken(state, flow.targetRef, token.data);
					anySelected = true;
				}
			}

			if (!anySelected && defaultFlowId) {
				const defaultFlow = definition.sequenceFlows.get(defaultFlowId);
				if (defaultFlow) {
					state = this.tokenManager.createToken(state, defaultFlow.targetRef, token.data);
				}
			}

			return state;
		}

		// 汇聚模式（简化：同并行网关）
		return this.resolveParallel(state, token, gateway, definition);
	}

	/** 直通兜底 */
	private passThrough(
		state: ProcessState,
		token: Token,
		node: Element,
		definition: ProcessDefinition
	): ProcessState {
		const outgoing = node.outgoing || [];
		state = this.tokenManager.destroyToken(state, token.id);
		for (const flowId of outgoing) {
			const flow = definition.sequenceFlows.get(flowId);
			if (flow) {
				state = this.tokenManager.createToken(state, flow.targetRef, token.data);
			}
		}
		return state;
	}
}
