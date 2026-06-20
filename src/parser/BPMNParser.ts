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
					'BF_PARSE_XML_FORMAT_ERROR: XML input is empty or invalid'
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
				processDefinition.id = processMatchWithName[1]!;
				processDefinition.name = processMatchWithName[2]!;

				// 尝试提取版本信息
				const versionMatch = xml.match(/version="([^"]*)"/);
				if (versionMatch) {
					processDefinition.version = versionMatch[1]!;
				}
			} else {
				// 尝试匹配只有 id 的流程定义
				const processMatch = xml.match(
					/<(?:bpmn:)?process[^>]*id="([^"]*)"/
				);
				if (processMatch) {
					processDefinition.id = processMatch[1]!;
					processDefinition.name = processMatch[1]!;

					// 尝试从 process 标签内匹配 name 属性
					const processTagMatch = xml.match(
						/<(?:bpmn:)?process[^>]*name="([^"]*)"/
					);
					if (
						processTagMatch &&
						processTagMatch[1]! !== processDefinition.id
					) {
						processDefinition.name = processTagMatch[1]!;
					}
				} else {
					// 没有找到 process 元素，抛出错误
					throw new ParseError(
						'BF_PARSE_XML_FORMAT_ERROR: No <process> element found in XML definition'
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
						`BF_PROCESS_VALIDATION_FAILED: Process definition validation failed: ${errorMessages}`
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
				`BF_PARSE_XML_ERROR: Failed to parse BPMN XML: ${(error as Error).message}`,
				{ originalError: error }
			);
		}
	}

	
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
			const regex = new RegExp(`<(?:bpmn:)?${type}([^>]*(?:>|/>))`, 'g');
			let match;

			while ((match = regex.exec(xml)) !== null) {
				const fullAttributes = match[1]!;

				// 支持自闭合标签和非自闭合标签
				const isSelfClosing = fullAttributes.endsWith('/>');
				const attributes = isSelfClosing
					? fullAttributes.slice(0, -2)
					: fullAttributes.replace(/>$/, '');

				const idMatch = attributes.match(/id="([^"]*)"/);

				if (idMatch) {
					const id = idMatch[1]!;

					const nameMatch = attributes.match(/name="([^"]*)"/);
					const name = nameMatch ? nameMatch[1]! : id;

					const element: Element = {
						id: id,
						type: elementType,
						name: name,
						incoming: [],
						outgoing: [],
						properties: this.parseElementProperties(attributes),
					};

					// 对非自闭合标签，提取标签体内部的子元素并解析
					if (!isSelfClosing) {
						const tagContent = this.extractTagContent(xml, type, match.index);
						if (tagContent) {
							element.childElements = this.parseChildContent(tagContent);
						}
					}

					elements.set(element.id, element);
				}
			}
		});

		return elements;
	}

	/**
	 * 提取非自闭合标签开闭标签之间的内容
	 * @param xml - 完整 XML 字符串
	 * @param type - 标签名（不含命名空间，如 userTask）
	 * @param startIndex - 打开标签的起始索引
	 * @returns 标签体内容，无内容返回空字符串
	 */
	private static extractTagContent(
		xml: string,
		type: string,
		startIndex: number
	): string {
		// 找到打开标签的结束位置 >
		const openingEnd = xml.indexOf('>', startIndex);
		if (openingEnd === -1) return '';

		const contentStart = openingEnd + 1;

		// 尝试带命名空间和不带命名空间的闭合标签
		const closingTag1 = `</bpmn:${type}>`;
		const closingTag2 = `</${type}>`;

		let closingIndex = xml.indexOf(closingTag1, contentStart);
		if (closingIndex === -1) {
			closingIndex = xml.indexOf(closingTag2, contentStart);
		}
		if (closingIndex === -1) return '';

		return xml.substring(contentStart, closingIndex).trim();
	}

	/**
	 * 解析标签体内容中的子元素为结构化对象。
	 *
	 * 规则：
	 * - 每个子标签的标签名作为返回对象的属性名，值是一个对象数组（支持同名标签重复出现）
	 * - 子标签的下级标签（下级标签）成为数组内对象的属性
	 * - 子标签的纯文本内容作为数组内对象的值
	 * - 如果子标签只有纯文本没有属性和下级标签，直接以字符串形式放入数组
	 * - 排除 incoming 和 outgoing 标签
	 *
	 * 示例输入：
	 *   <extensionElements>
	 *     <formProperty id="f1" name="表单1" />
	 *   </extensionElements>
	 *   <documentation>这是一个审批任务</documentation>
	 *
	 * 示例输出：
	 *   {
	 *     "extensionElements": [
	 *       { "formProperty": [{ "id": "f1", "name": "表单1" }] }
	 *     ],
	 *     "documentation": ["这是一个审批任务"]
	 *   }
	 */
	static parseChildContent(
		content: string,
		excludedTags: Set<string> = new Set(['incoming', 'outgoing'])
	): Record<string, any[]> {
		const result: Record<string, any[]> = {};

		// 匹配子 XML 元素：<tagName attrs>content</tagName> 或 <tagName attrs />
		const childRegex = /<([\w:]+)([^>]*?)(\/>|>([\s\S]*?)<\/\1\s*>)/g;
		let match;

		while ((match = childRegex.exec(content)) !== null) {
			const tagName = match[1]!;
			const attrsStr = match[2]!.trim();
			const isSelfClosing = match[3] === '/>';
			const innerContent = isSelfClosing ? '' : (match[4] || '').trim();

			// 排除标签（如 incoming / outgoing）
			const shortName = tagName.includes(':')
				? tagName.split(':')[1]!
				: tagName;
			if (excludedTags.has(shortName)) continue;

			// 初始化数组	tagName
			if (!result[tagName]) result[tagName] = [];

			// 解析当前子标签的属性
			const obj: Record<string, any> = {};
			const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
			let attrMatch;
			while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
				const key = attrMatch[1]!;
				const value = attrMatch[2]!;
				obj[key] =
					value === 'true' ? true : value === 'false' ? false : value;
			}

			// 是否有属性
			const hasAttributes = attrsStr.length > 0;

			// 递归解析子内容的子元素
			if (innerContent) {
				const nestedChildren = BPMNParser.parseChildContent(
					innerContent,
					excludedTags
				);
				if (Object.keys(nestedChildren).length > 0) {
					// 子内容包含下级标签，合并到当前对象
					Object.assign(obj, nestedChildren);
				} else if (hasAttributes) {
					// 有属性 + 纯文本 → 用 content 字段
					obj.content = innerContent;
				}
				// 无属性 + 纯文本 → 不设 content，后续直接 push 文本
			}

			// 无属性且纯文本：直接用文本值
			if (!hasAttributes && innerContent && Object.keys(obj).length === 0) {
				result[tagName].push(innerContent);
			} else {
				result[tagName].push(obj);
			}
		}

		return result;
	}

	/**
	 * 根据节点 ID 直接从 XML 中提取该节点的下级标签结构。
	 * 在 hook 中可直接调用，无需预先 parse 整个流程定义。
	 *
	 * 原理：在 XML 中搜索 `id="elementId"` → 回溯找到标签名
	 * → 非自闭合则提取标签体 → 调用 parseChildContent 解析。
	 *
	 * @param xml - 完整 BPMN XML 字符串
	 * @param elementId - 目标节点 ID
	 * @returns 下级标签结构化对象，节点不存在或无下级标签时返回空对象
	 *
	 * 使用示例：
	 *   const children = BPMNParser.getNodeChildren(rawXml, 'task1');
	 *   // { "bpmn:extensionElements": [{ ... }], "bpmn:documentation": ["..."] }
	 */
	static getNodeChildren(
		xml: string,
		elementId: string
	): Record<string, any[]> {
		const escapedId = elementId.replace(
			/[.*+?^${}()|[\]\\]/g,
			'\\$&'
		);
		const idAttr = new RegExp(`\\sid="${escapedId}"`);

		let searchPos = 0;
		while (searchPos < xml.length) {
			const found = idAttr.exec(xml.substring(searchPos));
			if (!found) return {};

			const idPos = searchPos + found.index;

			// 回溯找到标签的 <
			const tagStart = xml.lastIndexOf('<', idPos);
			if (tagStart === -1 || xml[tagStart + 1] === '/') {
				searchPos = idPos + 1;
				continue;
			}

			// 提取标签名（< 之后到第一个空白符或 >）
			const afterLt = xml.substring(tagStart + 1);
			const firstSpace = afterLt.indexOf(' ');
			const firstGt = afterLt.indexOf('>');
			const firstBreak =
				firstSpace > 0
					? tagStart + 1 + firstSpace
					: firstGt > 0
						? tagStart + 1 + firstGt
						: -1;
			if (firstBreak === -1) {
				searchPos = idPos + 1;
				continue;
			}

			const tagName = xml.substring(tagStart + 1, firstBreak);

			// 找到打开标签的 >
			const openingEnd = xml.indexOf('>', idPos);
			if (openingEnd === -1) return {};

			// 自闭合标签没有下级标签
			if (xml[openingEnd - 1] === '/') return {};

			// 找闭合标签
			const closeTag = `</${tagName}>`;
			const closePos = xml.indexOf(closeTag, openingEnd);
			if (closePos === -1) return {};

			const body = xml.substring(openingEnd + 1, closePos).trim();
			if (!body) return {};

			return this.parseChildContent(body);
		}

		return {};
	}

	static parseElementProperties(attributes: string): Record<string, any> {
		const properties: Record<string, any> = {};

		// 提取所有 name="value" 格式的 XML 属性
		const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
		let match;
		while ((match = attrRegex.exec(attributes)) !== null) {
			const key = match[1]!;
			const value = match[2]!;

			// 类型嗅探：boolean-like 值转真实 boolean
			if (value === 'true' || value === 'false') {
				properties[key] = value === 'true';
			} else {
				properties[key] = value;
			}
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
			const fullAttributes = match[1]!;

			const idMatch = fullAttributes.match(/id="([^"]*)"/);
			const sourceRefMatch = fullAttributes.match(/sourceRef="([^"]*)"/);
			const targetRefMatch = fullAttributes.match(/targetRef="([^"]*)"/);

			if (idMatch && sourceRefMatch && targetRefMatch) {
				const id = idMatch[1]!;
				const sourceRef = sourceRefMatch[1]!;
				const targetRef = targetRefMatch[1]!;

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
			let expression = conditionMatch[1]!.trim();
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
					(varMatch: string) => {
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
					`WARNING: SequenceFlow ${flow.id} source element ${flow.sourceRef} not found`
				);
			}

			if (targetElement) {
				if (!targetElement.incoming) targetElement.incoming = [];
				targetElement.incoming.push(flow.id);
			} else {
				console.warn(
					`WARNING: SequenceFlow ${flow.id} target element ${flow.targetRef} not found`
				);
			}
		}
	}
}

export default BPMNParser;
