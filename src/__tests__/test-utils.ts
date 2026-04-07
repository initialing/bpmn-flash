import { ProcessState } from '../state/WorkflowState';

/**
 * 创建基础测试状态
 */
export function createTestState(
	overrides: Partial<ProcessState> = {}
): ProcessState {
	return {
		id: overrides.id || 'test-instance-1',
		name: overrides.name || '测试流程',
		status: overrides.status || 'running',
		createdAt: overrides.createdAt || new Date(),
		definitionId: overrides.definitionId || 'test-process',
		data: overrides.data || {},
		tokens: overrides.tokens || [],
		items: overrides.items || [],
		variables: overrides.variables || {},
		history: overrides.history || [],
		startedAt: overrides.startedAt,
		endedAt: overrides.endedAt,
	};
}

/**
 * 创建基础流程定义
 */
export function createTestDefinition(overrides: any = {}) {
	return {
		id: overrides.id || 'test-process',
		name: overrides.name || '测试流程',
		elements: overrides.elements || new Map(),
		sequenceFlows: overrides.sequenceFlows || [],
		properties: overrides.properties || {},
		variables: overrides.variables || [],
		...overrides,
	};
}
