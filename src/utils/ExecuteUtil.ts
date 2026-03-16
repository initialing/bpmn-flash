import { ParsedXmlElement, CheckExecutionError } from '../types/index';

/**
 * Performs basic validation on BPMN definition structure
 * @param bpmn - The parsed BPMN XML object
 * @returns Error message string if validation fails, otherwise null
 */
export function baseCheckBPMN(bpmn: ParsedXmlElement): string | null {
	if (!bpmn['definitions']) return 'No definitions found';
	if (Object.keys(bpmn).length > 1) return 'Multiple definitions found';

	const children: ParsedXmlElement[] | undefined =
		bpmn['definitions'].children;
	if (!children || children.length === 0) return 'No process found';
	let processFlag: boolean = false;
	for (const child of children) {
		if (child['process']) {
			processFlag = true;
			break;
		}
	}

	if (!processFlag) return 'No process found';
	if (children.length > 1) return 'Multiple processes found';
	return null;
}

/**
 * Retrieves related sequence flow IDs for a given node based on type (incoming or outgoing)
 * @param node - The BPMN node to check
 * @param type - The type of relation ('incoming' or 'outgoing')
 * @returns An array of sequence flow IDs
 */
export function getRelationSequenceFlowIds(
	node: ParsedXmlElement,
	type: 'incoming' | 'outgoing'
): string[] {
	const flowIds: Set<string> = new Set();
	const key: string = Object.keys(node)[0] as keyof typeof node as string;
	if (node[key]?.children && node[key].children.length > 0) {
		for (const child of node[key].children) {
			const childKey = Object.keys(child)[0] as keyof typeof child;
			if (
				child[childKey] &&
				child[childKey].tagName === type &&
				child[childKey].content
			) {
				flowIds.add(child[childKey].content);
			}
		}
	}
	return Array.from(flowIds);
}

/**
 * Retrieves BPMN nodes by their IDs
 * @param bpmnNodes - Array of all BPMN nodes
 * @param nodeIds - Array of node IDs to retrieve
 * @returns Array of nodes matching the provided IDs, or null if none found
 */
export function getBpmnNodesByIds(
	bpmnNodes: ParsedXmlElement[],
	nodeIds: string[]
): ParsedXmlElement[] | null {
	const nodeIdSet: Set<string> = new Set(nodeIds);
	const nodes: ParsedXmlElement[] = bpmnNodes.filter(node => {
		const nodeKey: string = Object.keys(
			node
		)[0] as keyof typeof node as string;
		return nodeIdSet.has(nodeKey);
	});

	if (nodes.length === 0) return null;

	return nodes;
}

/**
 * Checks if a node has the specified sequence flow as its incoming flow
 * @param node - The BPMN node to check
 * @param sequenceFlow - The sequence flow to validate
 * @returns Boolean indicating whether the sequence flow connects to the node
 */
export function checkNodeIncomingSequenceFlow(
	node: ParsedXmlElement,
	sequenceFlow: ParsedXmlElement
): boolean {
	const incomingSequenceFlowIds = getRelationSequenceFlowIds(
		node,
		'incoming'
	);
	const nodeKey: string = Object.keys(node)[0] as keyof typeof node as string;
	const sequenceFlowKey: string = Object.keys(
		sequenceFlow
	)[0] as keyof typeof sequenceFlow as string;
	if (
		sequenceFlow[sequenceFlowKey] &&
		sequenceFlow[sequenceFlowKey].properties
	) {
		const targetRef: string = sequenceFlow[sequenceFlowKey].properties
			.targetRef as string;
		if (
			incomingSequenceFlowIds.includes(sequenceFlowKey) &&
			targetRef === nodeKey
		) {
			return true;
		}
	}
	return false;
}

/**
 * Merges execution errors by grouping them by code
 * @param errorList - List of execution errors to merge
 * @returns Merged list of execution errors
 */
function _mergeCheckExecutionError(
	errorList: CheckExecutionError[]
): CheckExecutionError[] {
	return Object.values(
		errorList.reduce(
			(
				acc: Record<string, CheckExecutionError>,
				cur: CheckExecutionError
			) => {
				if (acc[cur.code]) {
					acc[cur.code]!.reason?.push(...cur.reason!);
				} else {
					acc[cur.code] = cur;
				}
				return acc;
			},
			{} as Record<string, CheckExecutionError>
		)
	);
}

/**
 * Validates BPMN execution flow and checks for common errors
 * @param bpmnNodes - Array of BPMN nodes to validate
 * @param strictMode - Whether to perform strict validation including unreachable nodes
 * @returns Array of execution errors found during validation
 */
export function checkBPMNExecution(
	bpmnNodes: ParsedXmlElement[],
	strictMode: boolean
): CheckExecutionError[] {
	const errorList: CheckExecutionError[] = [];
	let startNode: ParsedXmlElement | null = null;
	const nodeIdCount: Record<string, number> = {};
	for (const node of bpmnNodes) {
		const nodeKeys = Object.keys(node);
		if (nodeKeys.length > 0) {
			const firstKey = nodeKeys[0] as keyof typeof node;
			nodeIdCount[firstKey] = nodeIdCount[firstKey]
				? nodeIdCount[firstKey] + 1
				: 1;
			if (node[firstKey] && node[firstKey].tagName === 'startEvent') {
				if (startNode) {
					errorList.push({ code: 'MULTI_START' });
				} else {
					startNode = node;
				}
			}
		}
	}

	let multiIdError: CheckExecutionError | null = null;
	for (const key in nodeIdCount) {
		if (nodeIdCount[key] && nodeIdCount[key] > 1) {
			if (!multiIdError) {
				multiIdError = {
					code: 'MULTI_ID',
					reason: [key],
				};
			} else {
				multiIdError.reason?.push(key);
			}
		}
	}

	if (!startNode) {
		errorList.push({ code: 'NO_START' });
	}
	const visitedNodeIdSet: Set<string> = new Set();
	if (startNode && !multiIdError) {
		const nodesQueue: ParsedXmlElement[] = [startNode];
		while (nodesQueue.length > 0) {
			const currentNode: ParsedXmlElement = nodesQueue.shift()!;
			const nodeKey: string = Object.keys(
				currentNode
			)[0] as keyof typeof currentNode as string;
			if (visitedNodeIdSet.has(nodeKey)) continue;
			visitedNodeIdSet.add(nodeKey);
			if (
				currentNode[nodeKey] &&
				currentNode[nodeKey].tagName === 'sequenceFlow'
			) {
				const targetRef: string = currentNode[nodeKey].properties
					.targetRef as string;
				const targetNode: ParsedXmlElement | undefined =
					(getBpmnNodesByIds(bpmnNodes, [targetRef]) ?? [])[0];
				if (!targetNode) {
					errorList.push({
						code: 'NO_END',
						reason: [nodeKey],
					});
				} else if (
					!checkNodeIncomingSequenceFlow(targetNode, currentNode)
				) {
					errorList.push({
						code: 'INCOMING_SEQUENCE_FLOW_NOT_MATCH',
						reason: [nodeKey],
					});
				} else {
					nodesQueue.push(targetNode);
				}
			} else if (
				currentNode[nodeKey] &&
				currentNode[nodeKey].tagName !== 'endEvent'
			) {
				const outgoingSequenceFlowIds: string[] =
					getRelationSequenceFlowIds(currentNode, 'outgoing');
				if (outgoingSequenceFlowIds.length === 0) {
					errorList.push({
						code: 'NO_END',
						reason: [nodeKey],
					});
				} else {
					const outgoingSequenceFlows: ParsedXmlElement[] | null =
						getBpmnNodesByIds(bpmnNodes, outgoingSequenceFlowIds);
					if (!outgoingSequenceFlows) {
						errorList.push({
							code: 'NO_OUTGOING',
							reason: [nodeKey],
						});
					} else {
						nodesQueue.push(...outgoingSequenceFlows);
					}
				}
			}
		}
	}

	if (strictMode) {
		for (const node of bpmnNodes) {
			const nodeKey: string = Object.keys(
				node
			)[0] as keyof typeof node as string;
			if (
				node[nodeKey] &&
				node[nodeKey].tagName !== 'startEvent' &&
				node[nodeKey].tagName !== 'endEvent' &&
				node[nodeKey].tagName !== 'sequenceFlow' &&
				!visitedNodeIdSet.has(nodeKey)
			) {
				errorList.push({
					code: 'UNREACHABLE',
					reason: [nodeKey],
				});
			}
		}
	}

	return _mergeCheckExecutionError(errorList);
}
