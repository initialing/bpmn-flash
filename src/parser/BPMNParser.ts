import { ProcessDefinition, Element, SequenceFlow, ElementType } from '../types/index';
import { ParseError, ValidationError } from '../errors/WorkflowErrors';
import { BpmnValidator } from './BpmnValidator';

class BPMNParser {
	/**
	 * 解析BPMN XML并创建流程定义
	 * @param xml BPMN XML字符串
	 * @param validate 是否进行验证，默认为true
	 * @returns 流程定义对象
	 */
	static parse(xml: string, validate: boolean = true): ProcessDefinition {
		try {
			// 检查XML格式
			if (!xml || typeof xml !== 'string') {
				throw new ParseError('输入的XML格式无效或为空');
			}

			const processDefinition: ProcessDefinition = {
				id: '',
				name: '',
				elements: new Map(),
				sequenceFlows: new Map(),
			};

			// 提取流程定义信息 - 支持不同的BPMN命名空间格式
			// 首先尝试匹配带name属性的流程定义
			const processMatchWithName = xml.match(
				/<(?:bpmn:)?process[^>]*id="([^"]*)"[^>]*name="([^"]*)"[^>]*>/
			);
			if (processMatchWithName) {
				processDefinition.id = processMatchWithName[1];
				processDefinition.name = processMatchWithName[2];
				
				// 尝试提取版本信息
				const versionMatch = xml.match(/version="([^"]*)"/);
				if (versionMatch) {
					processDefinition.version = versionMatch[1];
				}
			} else {
				// 尝试匹配只有id的流程定义
				const processMatch = xml.match(
					/<(?:bpmn:)?process[^>]*id="([^"]*)"/
				);
				if (processMatch) {
					processDefinition.id = processMatch[1];
					processDefinition.name = processMatch[1];
					
					// 尝试匹配name属性 separately
					const nameMatch = xml.match(/name="([^"]*)"/);
					if (nameMatch && nameMatch[1] !== processDefinition.id) {
						// 只有当name不等于id时才更新name，避免覆盖已有的id作为name的情况
						processDefinition.name = nameMatch[1];
					}
				} else {
					throw new ParseError('未能找到流程定义信息，XML格式可能不正确');
				}
			}

			// 解析各种BPMN元素
			processDefinition.elements = this.parseElements(xml);
			processDefinition.sequenceFlows = this.parseSequenceFlows(xml);

			// 建立元素间的连接关系
			this.buildElementConnections(processDefinition);

			// 验证流程定义（如果需要）
			if (validate) {
				const validationResult = BpmnValidator.validate(processDefinition);
				if (!validationResult.isValid) {
					const errorMessages = validationResult.errors.map(err => 
						err.elementId ? `${err.message} (元素ID: ${err.elementId})` : err.message
					).join('; ');
					throw new ValidationError(`流程定义验证失败: ${errorMessages}`);
				}
			}

			return processDefinition;
		} catch (error) {
			if (error instanceof ParseError || error instanceof ValidationError) {
				throw error;
			}
			throw new ParseError(`解析BPMN XML时发生错误: ${(error as Error).message}`, { originalError: error });
		}
	}

	/**
	 * 解析BPMN元素
	 */
	static parseElements(xml: string): Map<string, Element> {
		const elements = new Map<string, Element>();
		const elementTypes: { [key: string]: ElementType } = {
			'startEvent': 'bpmn:startEvent',
			'endEvent': 'bpmn:endEvent',
			'userTask': 'bpmn:userTask',
			'serviceTask': 'bpmn:serviceTask',
			'scriptTask': 'bpmn:scriptTask',
			'task': 'bpmn:task',
			'exclusiveGateway': 'bpmn:exclusiveGateway',
			'parallelGateway': 'bpmn:parallelGateway',
			'inclusiveGateway': 'bpmn:inclusiveGateway',
			'eventBasedGateway': 'bpmn:eventBasedGateway',
		};

		Object.entries(elementTypes).forEach(([type, elementType]) => {
			// 改进正则表达式以支持有无命名空间的格式
			const regex = new RegExp(
				`<(?:bpmn:)?${type}([^>]*(?:>|/>))`,
				'g'
			);
			let match;

			while ((match = regex.exec(xml)) !== null) {
				const fullAttributes = match[1];
				
				// 支持自闭合标签和非自闭合标签
				const isSelfClosing = fullAttributes.endsWith('/>');
				const attributes = isSelfClosing ? fullAttributes.slice(0, -2) : fullAttributes.replace(/>$/, '');
				
				const idMatch = attributes.match(/id="([^"]*)"/);
				
				if (idMatch) {
					const id = idMatch[1];
					
					// 尝试获取名称，如果没有则使用ID作为名称
					const nameMatch = attributes.match(/name="([^"]*)"/);
					const name = nameMatch ? nameMatch[1] : id;

					const element: Element = {
						id: id,
						type: elementType,
						name: name,
						incoming: [],
						outgoing: [],
						properties: this.parseElementProperties(attributes),
					};

					elements.set(element.id, element);
				}
			}
		});

		return elements;
	}

	/**
	 * 解析元素属性
	 */
	static parseElementProperties(attributes: string): Record<string, any> {
		const properties: Record<string, any> = {};

		// 解析默认顺序流
		const defaultMatch = attributes.match(/default="([^"]*)"/);
		if (defaultMatch && defaultMatch[1]) {
			properties.default = defaultMatch[1];
		}

		// 解析其他常见属性
		const implementationMatch = attributes.match(/implementation="([^"]*)"/);
		if (implementationMatch) {
			properties.implementation = implementationMatch[1];
		}

		const asyncMatch = attributes.match(/async="([^"]*)"/);
		if (asyncMatch) {
			properties.async = asyncMatch[1] === 'true';
		}

		return properties;
	}

	/**
	 * 解析顺序流
	 */
	static parseSequenceFlows(xml: string): Map<string, SequenceFlow> {
		const sequenceFlows = new Map<string, SequenceFlow>();
		
		// 支持带或不带命名空间的sequenceFlow
		const regex = /<(?:bpmn:)?sequenceFlow([^>]*)\/?>/g;
		let match;

		while ((match = regex.exec(xml)) !== null) {
			const fullAttributes = match[1];
			
			const idMatch = fullAttributes.match(/id="([^"]*)"/);
			const sourceRefMatch = fullAttributes.match(/sourceRef="([^"]*)"/);
			const targetRefMatch = fullAttributes.match(/targetRef="([^"]*)"/);
			
			if (idMatch && sourceRefMatch && targetRefMatch) {
				const id = idMatch[1];
				const sourceRef = sourceRefMatch[1];
				const targetRef = targetRefMatch[1];

				const flow: SequenceFlow = {
					id: id,
					sourceRef: sourceRef,
					targetRef: targetRef,
					conditionExpression: this.parseConditionExpression(xml, id),
				};

				// 检查条件表达式的类型
				if (flow.conditionExpression) {
					// 简单判断是表达式还是脚本
					if (flow.conditionExpression.includes('${') || flow.conditionExpression.includes('#{')) {
						flow.conditionType = 'expression';
					} else {
						flow.conditionType = 'expression'; // 默认认为是表达式
					}
				}

				sequenceFlows.set(id, flow);
			}
		}

		return sequenceFlows;
	}

	/**
	 * 解析条件表达式
	 */
	static parseConditionExpression(
		xml: string,
		flowId: string
	): string | null {
		// 支持带或不带命名空间的条件表达式查找
		
		// 标准格式（带命名空间）
		const standardRegex = new RegExp(
			`<(?:bpmn:)?sequenceFlow[^>]*id="${flowId}"[^>]*>[\\s\\S]*?<bpmn:conditionExpression[^>]*>([^<]+)<\\/bpmn:conditionExpression>[\\s\\S]*?<\\/bpmn:sequenceFlow>`
		);
		let match = xml.match(standardRegex);
		if (match) {
			return match[1].trim();
		}

		// 带xsi:type的格式
		const xsiRegex = new RegExp(
			`<(?:bpmn:)?sequenceFlow[^>]*id="${flowId}"[^>]*>[\\s\\S]*?<bpmn:conditionExpression[^>]*xsi:type="[^"]*"[^>]*>([^<]+)<\\/bpmn:conditionExpression>[\\s\\S]*?<\\/bpmn:sequenceFlow>`
		);
		match = xml.match(xsiRegex);
		if (match) {
			return match[1].trim();
		}

		// 不带命名空间的条件表达式格式
		const noNsRegex = new RegExp(
			`<(?:bpmn:)?sequenceFlow[^>]*id="${flowId}"[^>]*>[\\s\\S]*?<conditionExpression[^>]*>([^<]+)<\\/conditionExpression>[\\s\\S]*?<\\/bpmn:sequenceFlow>`
		);
		match = xml.match(noNsRegex);
		if (match) {
			return match[1].trim();
		}

		return null;
	}

	/**
	 * 建立元素间的连接关系
	 */
	static buildElementConnections(processDefinition: ProcessDefinition): void {
		// 为每个顺序流建立源和目标元素的连接
		for (const [, flow] of processDefinition.sequenceFlows) {
			const sourceElement = processDefinition.elements.get(
				flow.sourceRef
			);
			const targetElement = processDefinition.elements.get(
				flow.targetRef
			);

			if (sourceElement) {
				if (!sourceElement.outgoing) sourceElement.outgoing = [];
				sourceElement.outgoing.push(flow.id);
			} else {
				console.warn(`警告: 顺序流 ${flow.id} 的源元素 ${flow.sourceRef} 未找到`);
			}

			if (targetElement) {
				if (!targetElement.incoming) targetElement.incoming = [];
				targetElement.incoming.push(flow.id);
			} else {
				console.warn(`警告: 顺序流 ${flow.id} 的目标元素 ${flow.targetRef} 未找到`);
			}
		}
	}
}

export default BPMNParser;