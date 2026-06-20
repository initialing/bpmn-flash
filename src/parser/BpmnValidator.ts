import { ProcessDefinition, Element, ElementType } from '../types/index';
import { ValidationError } from '../errors/WorkflowErrors';

export interface ValidationResult {
	isValid: boolean;
	errors: ValidationErrorItem[];
	warnings: ValidationWarningItem[];
}

export interface ValidationErrorItem {
	elementId?: string;
	message: string;
	code: string;
}

export interface ValidationWarningItem {
	elementId?: string;
	message: string;
	code: string;
}

export class BpmnValidator {
	/**
	 * 验证流程定义的有效性
	 * @param processDefinition 流程定义对象
	 * @returns 验证结果
	 */
	static validate(processDefinition: ProcessDefinition): ValidationResult {
		const errors: ValidationErrorItem[] = [];
		const warnings: ValidationWarningItem[] = [];

		// 验证开始事件存在性
		const startEvents = this.findElementsByType(
			processDefinition,
			'bpmn:startEvent'
		);
		if (startEvents.length === 0) {
			errors.push({
				message: 'Process definition must contain at least one startEvent',
				code: 'MISSING_START_EVENT',
			});
		} else if (startEvents.length > 1) {
			errors.push({
				message: 'Process definition must contain exactly one startEvent',
				code: 'MULTIPLE_START_EVENTS',
			});
		}

		// 验证结束事件存在性
		const endEvents = this.findElementsByType(
			processDefinition,
			'bpmn:endEvent'
		);
		if (endEvents.length === 0) {
			errors.push({
				message: 'Process definition must contain at least one endEvent',
				code: 'MISSING_END_EVENT',
			});
		}

		// 验证元素ID唯一性
		this.validateElementIdsUniqueness(processDefinition, errors);

		// 验证连接完整性（每个顺序流的源和目标元素都存在）
		this.validateConnectionIntegrity(processDefinition, errors);

		// 验证网关匹配（分支和汇聚）
		this.validateGatewayMatching(processDefinition, errors);

		// 验证循环依赖
		this.validateCycles(processDefinition, errors);

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * 查找指定类型的元素
	 */
	private static findElementsByType(
		processDefinition: ProcessDefinition,
		type: ElementType
	): Element[] {
		const elements: Element[] = [];
		for (const [, element] of processDefinition.elements) {
			if (element.type === type) {
				elements.push(element);
			}
		}
		return elements;
	}

	/**
	 * 验证元素ID唯一性
	 */
	private static validateElementIdsUniqueness(
		processDefinition: ProcessDefinition,
		errors: ValidationErrorItem[]
	): void {
		const seenIds = new Set<string>();
		for (const [id] of processDefinition.elements) {
			if (seenIds.has(id)) {
				errors.push({
					elementId: id,
					message: `Duplicate element ID: ${id}`,
					code: 'DUPLICATE_ELEMENT_ID',
				});
			} else {
				seenIds.add(id);
			}
		}
	}

	/**
	 * 验证连接完整性
	 */
	private static validateConnectionIntegrity(
		processDefinition: ProcessDefinition,
		errors: ValidationErrorItem[]
	): void {
		for (const [flowId, flow] of processDefinition.sequenceFlows) {
			if (!processDefinition.elements.has(flow.sourceRef)) {
				errors.push({
					elementId: flowId,
					message: `SequenceFlow ${flowId} source element ${flow.sourceRef} not found`,
					code: 'MISSING_SOURCE_ELEMENT',
				});
			}
			if (!processDefinition.elements.has(flow.targetRef)) {
				errors.push({
					elementId: flowId,
					message: `SequenceFlow ${flowId} target element ${flow.targetRef} not found`,
					code: 'MISSING_TARGET_ELEMENT',
				});
			}
		}
	}

	/**
	 * 验证网关匹配
	 */
	private static validateGatewayMatching(
		processDefinition: ProcessDefinition,
		errors: ValidationErrorItem[]
	): void {
		// 对于排他网关，检查是否有多个无条件路径
		for (const [, element] of processDefinition.elements) {
			if (element.type === 'bpmn:exclusiveGateway') {
				const outgoingFlows = element.outgoing
					.map(id => processDefinition.sequenceFlows.get(id))
					.filter(Boolean);
				const unconditionalFlows = outgoingFlows.filter(
					flow => !flow!.conditionExpression
				);

				// 排他网关最多只能有一个无条件路径
				if (unconditionalFlows.length > 1) {
					errors.push({
						elementId: element.id,
						message: `ExclusiveGateway ${element.id} cannot have more than one unconditional flow`,
						code: 'EXCLUSIVE_GATEWAY_MULTIPLE_DEFAULT_FLOWS',
					});
				}
			}
		}
	}

	/**
	 * 验证循环依赖
	 */
	private static validateCycles(
		processDefinition: ProcessDefinition,
		errors: ValidationErrorItem[]
	): void {
		// 使用深度优先搜索检测循环
		const visited = new Set<string>();
		const recStack = new Set<string>();

		const hasCycle = (elementId: string): boolean => {
			if (!visited.has(elementId)) {
				visited.add(elementId);
				recStack.add(elementId);

				const element = processDefinition.elements.get(elementId);
				if (element) {
					for (const flowId of element.outgoing) {
						const flow =
							processDefinition.sequenceFlows.get(flowId);
						if (flow) {
							if (
								!visited.has(flow.targetRef) &&
								hasCycle(flow.targetRef)
							) {
								return true;
							} else if (recStack.has(flow.targetRef)) {
								return true;
							}
						}
					}
				}
			}
			recStack.delete(elementId);
			return false;
		};

		// 从开始节点开始检查循环
		const startEvents = this.findElementsByType(
			processDefinition,
			'bpmn:startEvent'
		);
		for (const startEvent of startEvents) {
			if (hasCycle(startEvent.id)) {
				errors.push({
					message: 'Cyclic flow dependency detected in process definition',
					code: 'CYCLIC_FLOW_DETECTED',
				});
				break; // 发现一个循环就足够了
			}
		}
	}
}
