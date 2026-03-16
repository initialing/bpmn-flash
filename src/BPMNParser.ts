import { ProcessDefinition, Element, SequenceFlow } from './types/index';
import { checkXML } from './utils/ParseUtil';

class BPMNParser {
	/**
	 * 解析BPMN XML并创建流程定义
	 * @param xml BPMN XML字符串
	 * @returns 流程定义对象
	 */
	static parse(xml: string): ProcessDefinition {
		// 检查XML格式
		if (!checkXML(xml)) {
			throw new Error('BF_PARSE_XML_FORMAT_ERROR');
		}

		const processDefinition: ProcessDefinition = {
			id: '',
			name: '',
			elements: new Map(),
			sequenceFlows: new Map(),
		};

		// 提取流程定义信息
		const processMatch = xml.match(
			/<bpmn:process[^>]*id="([^"]*)"[^>]*name="([^"]*)"?/
		);
		if (processMatch) {
			processDefinition.id = processMatch[1];
			processDefinition.name = processMatch[2] || processDefinition.id;
		} else {
			const simpleMatch = xml.match(/<bpmn:process[^>]*id="([^"]*)"/);
			if (simpleMatch) {
				processDefinition.id = simpleMatch[1];
				processDefinition.name = simpleMatch[1];
			}
		}

		// 解析各种BPMN元素
		processDefinition.elements = this.parseElements(xml);
		processDefinition.sequenceFlows = this.parseSequenceFlows(xml);

		// 建立元素间的连接关系
		this.buildElementConnections(processDefinition);

		return processDefinition;
	}

	/**
	 * 解析BPMN元素
	 */
	static parseElements(xml: string): Map<string, Element> {
		const elements = new Map<string, Element>();
		const elementTypes = [
			'startEvent',
			'endEvent',
			'userTask',
			'serviceTask',
			'scriptTask',
			'task',
			'exclusiveGateway',
			'parallelGateway',
		];

		elementTypes.forEach(type => {
			const regex = new RegExp(
				`<bpmn:${type}([^>]*id="([^"]*)"[^>]*(?:name="([^"]*)")?)`,
				'g'
			);
			let match;

			while ((match = regex.exec(xml)) !== null) {
				const fullAttributes = match[1];
				const id = match[2];
				const name = match[3] || id;

				const element: Element = {
					id: id,
					type: `bpmn:${type}`,
					name: name,
					incoming: [],
					outgoing: [],
					properties: this.parseElementProperties(fullAttributes),
				};

				elements.set(element.id, element);
			}
		});

		return elements;
	}

	/**
	 * 解析元素属性
	 */
	static parseElementProperties(attributes: string): Record<string, string> {
		const properties: Record<string, string> = {};

		// 解析默认顺序流
		const defaultMatch = attributes.match(/default="([^"]*)"/);
		if (defaultMatch && defaultMatch[1]) {
			properties.default = defaultMatch[1];
		}

		return properties;
	}

	/**
	 * 解析顺序流
	 */
	static parseSequenceFlows(xml: string): Map<string, SequenceFlow> {
		const sequenceFlows = new Map<string, SequenceFlow>();
		const regex =
			/<bpmn:sequenceFlow([^>]*id="([^"]*)"[^>]*sourceRef="([^"]*)"[^>]*targetRef="([^"]*)")/g;
		let match;

		while ((match = regex.exec(xml)) !== null) {
			const fullAttributes = match[1];
			const id = match[2];
			const sourceRef = match[3];
			const targetRef = match[4];

			const flow: SequenceFlow = {
				id: id,
				sourceRef: sourceRef,
				targetRef: targetRef,
				conditionExpression: this.parseConditionExpression(xml, id),
			};

			sequenceFlows.set(id, flow);
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
		// 查找特定顺序流的条件表达式
		const conditionRegex = new RegExp(
			`<bpmn:sequenceFlow[^>]*id="${flowId}"[^>]*>[\\s\\S]*?<bpmn:conditionExpression[^>]*>([^<]*)<\\/bpmn:conditionExpression>[\\s\\S]*?<\\/bpmn:sequenceFlow>`
		);
		const match = xml.match(conditionRegex);

		if (match) {
			return match[1].trim();
		}

		// 查找带xsi:type的条件表达式
		const conditionWithXsiRegex = new RegExp(
			`<bpmn:sequenceFlow[^>]*id="${flowId}"[^>]*>[\\s\\S]*?<bpmn:conditionExpression[^>]*xsi:type="[^"]*"[^>]*>([^<]*)<\\/bpmn:conditionExpression>[\\s\\S]*?<\\/bpmn:sequenceFlow>`
		);
		const matchWithXsi = xml.match(conditionWithXsiRegex);

		if (matchWithXsi) {
			return matchWithXsi[1].trim();
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
				sourceElement.outgoing = sourceElement.outgoing || [];
				sourceElement.outgoing.push(flow.id);
			}

			if (targetElement) {
				targetElement.incoming = targetElement.incoming || [];
				targetElement.incoming.push(flow.id);
			}
		}
	}
}

export default BPMNParser;
