/**
 * 连线遍历器
 * 令牌离开节点 → 沿 SequenceFlow → 到达下一个节点
 * 每经过一条 SequenceFlow 触发 onSequenceFlow 钩子
 */

import type { ProcessState } from '../state/ProcessState.js';
import type { TokenV3 as Token, Element, ProcessDefinition, TraceEntry } from '../types/index.js';
import { TokenManager } from './TokenManager.js';
import { HookManager } from '../hooks/HookManager.js';

export class FlowTraverser {
	private tokenManager: TokenManager;
	private hooks: HookManager;

	constructor(tokenManager: TokenManager, hooks: HookManager) {
		this.tokenManager = tokenManager;
		this.hooks = hooks;
	}

	/**
	 * 将令牌从当前节点推进到所有出边的目标节点
	 */
	async traverse(
		state: ProcessState,
		token: Token,
		currentNode: Element,
		definition: ProcessDefinition
	): Promise<ProcessState> {
		const outgoing = currentNode.outgoing || [];

		if (outgoing.length === 0) {
			return this.tokenManager.destroyToken(state, token.id);
		}

		// 销毁当前令牌
		state = this.tokenManager.destroyToken(state, token.id);

		for (const flowId of outgoing) {
			const flow = definition.sequenceFlows.get(flowId);
			if (!flow) continue;

			const targetNode = definition.elements.get(flow.targetRef);
			if (!targetNode) continue;

			// 触发 sequenceFlow 钩子
			await this.hooks.emit('sequenceFlow', {
				state,
				token,
				flow,
				sourceNode: currentNode,
				targetNode,
				definition,
			});

			// 记录 trace
			const traceEntry: TraceEntry = {
				type: 'sequence-flow',
				elementId: flow.id,
				elementType: 'sequenceFlow',
				elementName: undefined,
				tokenId: token.id,
				timestamp: new Date(),
				sourceRef: flow.sourceRef,
				targetRef: flow.targetRef,
				flowId: flow.id,
			};
			state = { ...state, trace: [...state.trace, traceEntry] };

			// 在目标节点创建新令牌
			state = this.tokenManager.createToken(state, flow.targetRef, token.data);
		}

		return state;
	}
}
