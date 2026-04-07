import {
	ProcessDefinition,
	Element,
	SequenceFlow,
	ElementType,
} from '../types/index';
import { ParseError, ValidationError } from '../errors/WorkflowErrors';
import { BpmnValidator } from './BpmnValidator';

class BPMNParser {
	/**
	 * 解析 BPMN XML 并创建流程定义
	 * @param xml BPMN XML 字符串
	 * @param validate 是否进行验证，默认为 true
	 * @returns 流程定义对象
	 */
	static parse(xml: string, validate: boolean = true): ProcessDefinition {
		try {
			// 检查 XML 格式
			if (!xml || typeof xml !== 'string') {
				throw new ParseError(
					'BF_PARSE_XML_FORMAT_ERROR: 输入的 XML 格式无效或为空'
				);
			}

			const processDefinition: ProcessDefinition = {
				id: '',
				name: '',
				elements: new Map(),
				sequenceFlows: new Map(),
			};

			// 提取流程定义信息 - 支持不同的 BPMN 命名空间格式
			// 首先尝试匹配带 name 属性的流程定义
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
				// 尝试匹配只有 id 的流程定义
				const processMatch = xml.match(
					/<(?:bpmn:)?process[^>]*id="([^"]*)"/
				);
				if (processMatch) {
					processDefinition.id = processMatch[1];
					processDefinition.name = processMatch[1];

					// 尝试从 process 标签内匹配 name 属性
					const processTagMatch = xml.match(
						/<(?:bpmn:)?process[^>]*name="([^"]*)"/
					);
					if (
						processTagMatch &&
						processTagMatch[1] !== processDefinition.id
					) {
						processDefinition.name = processTagMatch[1];
					}
				} else {
					// 没有找到 process 元素，抛出错误
					throw new ParseError(
						'BF_PARSE_XML_FORMAT_ERROR: 未能找到流程定义信息，XML 格式可能不正确'
					);
				}
			}

			// 解析各种 BPMN 元素
			processDefinition.elements = this.parseElements(xml);
			processDefinition.sequenceFlows = this.parseSequenceFlows(xml);

			// 建立元素间的连接关系
			this.buildElementConnections(processDefinition);

			// 验证流程定义（如果需要）
			if (validate) {
				const validationResult =
					BpmnValidator.validate(processDefinition);
				if (!validationResult.isValid) {
					const errorMessages = validationResult.errors
						.map(err =>
							err.elementId
								? `${err.message} (元素 ID: ${err.elementId})`
								: err.message
						)
						.join('; ');
					throw new ValidationError(
						`流程定义验证失败：${errorMessages}`
					);
				}
			}

			return processDefinition;
		} catch (error) {
			if (
				error instanceof ParseError ||
				error instanceof ValidationError
			) {
				throw error;
			}
			throw new ParseError(
				`解析 BPMN XML 时发生错误：${(error as Error).message}`,
				{ originalError: error }
			);
		}
	}

	/**
	 * 解析 BPMN 元素
	 */
	static parseElements(xml: string): Map<string, Element> {
		const elements = new Map<string, Element>();
		const elementTypes: { [key: string]: ElementType } = {
			startEvent: 'bpmn:startEvent',
			endEvent: 'bpmn:endEvent',
			userTask: 'bpmn:userTask',
			serviceTask: 'bpmn:serviceTask',
			scriptTask: 'bpmn:scriptTask',
			task: 'bpmn:task',
			exclusiveGateway: 'bpmn:exclusiveGateway',
			parallelGateway: 'bpmn:parallelGateway',
			inclusiveGateway: 'bpmn:inclusiveGateway',
			eventBasedGateway: 'bpmn:eventBasedGateway',
		};

		Object.entries(elementTypes).forEach(([type, elementType]) => {
			// 改进正则表达式以支持有无命名空间的格式
			const regex = new RegExp(`<(?:bpmn:)?${type}([^>]*(?:>|/>))`, 'g');
			let match;

			while ((match = regex.exec(xml)) !== null) {
				const fullAttributes = match[1];

				// 支持自闭合标签和非自闭合标签
				const isSelfClosing = fullAttributes.endsWith('/>');
				const attributes = isSelfClosing
					? fullAttributes.slice(0, -2)
					: fullAttributes.replace(/>$/, '');

				const idMatch = attributes.match(/id="([^"]*)"/);

				if (idMatch) {
					const id = idMatch[1];

					// 尝试获取名称，如果没有则使用 ID 作为名称
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
		const implementationMatch = attributes.match(
			/implementation="([^"]*)"/
		);
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

		// 支持带或不带命名空间的 sequenceFlow
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
					if (
						flow.conditionExpression.includes('${') ||
						flow.conditionExpression.includes('#{')
					) {
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
		// 使用字符串查找方式，避免正则表达式的复杂性
		// 查找 <bpmn:sequenceFlow id="flowId" 或 id="flowId" 在 sequenceFlow 标签内

		// 找到所有 sequenceFlow 开始标签
		const flowTagStart = '<bpmn:sequenceFlow';
		let searchPos = 0;

		while (searchPos < xml.length) {
			const flowStart = xml.indexOf(flowTagStart, searchPos);
			if (flowStart === -1) {
				return null;
			}

			// 找到这个标签的结束位置
			const tagEnd = xml.indexOf('>', flowStart);
			if (tagEnd === -1) {
				return null;
			}

			const tagContent = xml.substring(flowStart, tagEnd + 1);

			// 检查这个标签是否包含我们的 flowId
			const idAttr = ` id="${flowId}"`;
			if (!tagContent.includes(idAttr)) {
				// 不是我们要找的 flow，继续下一个
				searchPos = tagEnd + 1;
				continue;
			}

			// 检查是否是自闭合标签
			if (tagContent.endsWith('/>')) {
				return null;
			}

			// 找到对应的结束标签
			const endTag = '</bpmn:sequenceFlow>';
			const endPos = xml.indexOf(endTag, tagEnd);
			if (endPos === -1) {
				return null;
			}

			// 提取 flow 内容
			const flowContent = xml.substring(tagEnd + 1, endPos);
			return this.extractConditionFromFlow(flowContent);
		}

		return null;
	}

	/**
	 * 从 flow 元素内容中提取条件表达式
	 */
	private static extractConditionFromFlow(
		flowContent: string
	): string | null {
		// 从 flow 内容中提取 conditionExpression
		const conditionRegex =
			/<(?:bpmn:)?conditionExpression[^>]*>([^<]+)<\/(?:bpmn:)?conditionExpression>/;
		const conditionMatch = flowContent.match(conditionRegex);

		if (conditionMatch) {
			let expression = conditionMatch[1].trim();
			// 转换表达式中的变量引用，将 ${var} 转换为 ${data.var}
			expression = this.transformExpression(expression);
			return expression;
		}

		return null;
	}

	/**
	 * 转换表达式中的变量引用
	 * 将 ${var} 或 #{var} 转换为 ${data.var} 或 #{data.var}
	 */
	private static transformExpression(expression: string): string {
		// 匹配 ${...} 或 #{...} 格式的表达式
		return expression.replace(
			/(\$\{|#\{)([^}]+)\}/g,
			(match, prefix, content) => {
				// 如果已经包含 data. 前缀，不转换
				if (content.startsWith('data.')) {
					return match;
				}
				// 转换变量引用
				const transformed = content.replace(
					/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
					varMatch => {
						// 跳过布尔值和关键字
						if (
							[
								'true',
								'false',
								'null',
								'undefined',
								'and',
								'or',
								'not',
							].includes(varMatch)
						) {
							return varMatch;
						}
						return `data.${varMatch}`;
					}
				);
				return `${prefix}${transformed}}`;
			}
		);
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
				console.warn(
					`警告：顺序流 ${flow.id} 的源元素 ${flow.sourceRef} 未找到`
				);
			}

			if (targetElement) {
				if (!targetElement.incoming) targetElement.incoming = [];
				targetElement.incoming.push(flow.id);
			} else {
				console.warn(
					`警告：顺序流 ${flow.id} 的目标元素 ${flow.targetRef} 未找到`
				);
			}
		}
	}
}

export default BPMNParser;
