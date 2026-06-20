import { describe, test, expect, beforeEach } from 'vitest';
import BPMNParser from '../parser/BPMNParser';
import {
	simpleProcessXML,
	gatewayProcessXML,
	complexProcessXML,
} from './fixtures/sample-processes';

describe('BPMNParser', () => {
	describe('parse - 基础解析', () => {
		test('P001: 应正确解析有效的BPMN XML', () => {
			const result = BPMNParser.parse(simpleProcessXML);

			expect(result).toBeDefined();
			expect(result.id).toBe('simple-process');
			expect(result.name).toBe('简单流程');
			expect(result.elements).toBeInstanceOf(Map);
			expect(result.sequenceFlows).toBeInstanceOf(Map);
		});

		test('P002: 应解析包含XML声明的BPMN', () => {
			const xmlWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${simpleProcessXML}`;
			const result = BPMNParser.parse(xmlWithDeclaration);

			expect(result).toBeDefined();
			expect(result.id).toBe('simple-process');
		});

		test('P003: 应解析包含命名空间的BPMN', () => {
			const result = BPMNParser.parse(simpleProcessXML);

			expect(result).toBeDefined();
			expect(result.elements.size).toBeGreaterThan(0);
		});

		test('P004: 空XML应抛出异常', () => {
			expect(() => BPMNParser.parse('')).toThrow(
				'BF_PARSE_XML_FORMAT_ERROR'
			);
		});

		test('P005: 无效XML格式应抛出异常', () => {
			const invalidXML = '<root><unclosed>';
			expect(() => BPMNParser.parse(invalidXML)).toThrow(
				'BF_PARSE_XML_FORMAT_ERROR'
			);
		});

		test('P006: 不含process的XML应抛出异常', () => {
			const noProcessXML =
				'<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"></bpmn:definitions>';
			expect(() => BPMNParser.parse(noProcessXML)).toThrow(
				'BF_PARSE_XML_FORMAT_ERROR'
			);
		});
	});

	describe('parseElementProperties - 自定义属性解析', () => {
		test('P007-A: 应解析所有XML属性（包括自定义属性）', () => {
			const xmlWithAttrs = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="prop-test" name="属性测试">
    <bpmn:startEvent id="start" name="开始" />
    <bpmn:userTask id="task1" name="审批" cc="zhengqiuTong" formKey="form_123" priority="high" async="true" />
    <bpmn:endEvent id="end" name="结束" />
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="task1" />
    <bpmn:sequenceFlow id="f2" sourceRef="task1" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`;

			const result = BPMNParser.parse(xmlWithAttrs, false);
			const task = result.elements.get('task1');

			expect(task).toBeDefined();
			// id 和 name 在 Element 上层字段也在 properties 中
			expect(task?.properties.id).toBe('task1');
			expect(task?.properties.name).toBe('审批');
			// 自定义属性
			expect(task?.properties.cc).toBe('zhengqiuTong');
			expect(task?.properties.formKey).toBe('form_123');
			expect(task?.properties.priority).toBe('high');
			// boolean 类型嗅探
			expect(task?.properties.async).toBe(true);
		});

		test('P007-B: onNodeEnter 中应能通过 ctx.node.properties 获取自定义属性', async () => {
			// 这个测试验证 hook 中能访问自定义 XML 属性
			const { FlowEngine } = await import('../engine/FlowEngine.js');

			let capturedCc: string | undefined;
			let capturedProperties: Record<string, any> | undefined;

			const engine = new FlowEngine({
				onNodeEnter: (ctx) => {
					if (ctx.node.properties.cc) {
						capturedCc = ctx.node.properties.cc;
						capturedProperties = { ...ctx.node.properties };
					}
				},
			});

			const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="hook-test" name="钩子测试">
    <bpmn:startEvent id="start" name="开始" />
    <bpmn:userTask id="approve" name="审批" cc="zhengqiuTong" formKey="form_approve" />
    <bpmn:endEvent id="end" name="结束" />
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="approve" />
    <bpmn:sequenceFlow id="f2" sourceRef="approve" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`;

			// 当脚本任务执行脚本时，返回空（模拟处理完毕）
			await engine.startProcess(xml, {});

			expect(capturedCc).toBe('zhengqiuTong');
			expect(capturedProperties).toBeDefined();
			expect(capturedProperties!['id']).toBe('approve');
			expect(capturedProperties!['cc']).toBe('zhengqiuTong');
			expect(capturedProperties!['formKey']).toBe('form_approve');
		});
	});

	describe('parse - 流程定义信息', () => {
		test('P007: 应正确提取process id和name', () => {
			const result = BPMNParser.parse(simpleProcessXML);

			expect(result.id).toBe('simple-process');
			expect(result.name).toBe('简单流程');
		});

		test('应使用id作为默认name当name未提供', () => {
			const xmlWithoutName = simpleProcessXML.replace(
				'name="简单流程"',
				''
			);
			const result = BPMNParser.parse(xmlWithoutName);

			expect(result.name).toBe('simple-process');
		});
	});

	describe('parseElements - 元素解析', () => {
		test('P008: 应解析startEvent元素', () => {
			const result = BPMNParser.parse(simpleProcessXML);
			const startEvent = result.elements.get('start');

			expect(startEvent).toBeDefined();
			expect(startEvent?.type).toBe('bpmn:startEvent');
			expect(startEvent?.id).toBe('start');
		});

		test('P009: 应解析endEvent元素', () => {
			const result = BPMNParser.parse(simpleProcessXML);
			const endEvent = result.elements.get('end');

			expect(endEvent).toBeDefined();
			expect(endEvent?.type).toBe('bpmn:endEvent');
		});

		test('P010: 应解析userTask元素', () => {
			const result = BPMNParser.parse(simpleProcessXML);
			const userTask = result.elements.get('task1');

			expect(userTask).toBeDefined();
			expect(userTask?.type).toBe('bpmn:userTask');
			expect(userTask?.name).toBe('审批任务');
		});

		test('P011: 应解析serviceTask元素', () => {
			const result = BPMNParser.parse(complexProcessXML);
			const serviceTask = result.elements.get('service1');

			expect(serviceTask).toBeDefined();
			expect(serviceTask?.type).toBe('bpmn:serviceTask');
			expect(serviceTask?.name).toBe('自动服务');
		});

		test('P012: 应解析scriptTask元素', () => {
			const result = BPMNParser.parse(complexProcessXML);
			const scriptTask = result.elements.get('script1');

			expect(scriptTask).toBeDefined();
			expect(scriptTask?.type).toBe('bpmn:scriptTask');
			expect(scriptTask?.name).toBe('脚本任务');
		});

		test('P014: 应解析exclusiveGateway元素', () => {
			const result = BPMNParser.parse(gatewayProcessXML);
			const gateway = result.elements.get('gateway');

			expect(gateway).toBeDefined();
			expect(gateway?.type).toBe('bpmn:exclusiveGateway');
			expect(gateway?.name).toBe('排他网关');
		});
	});

	describe('parseSequenceFlows - 顺序流解析', () => {
		test('P016: 应解析sequenceFlow', () => {
			const result = BPMNParser.parse(simpleProcessXML);

			expect(result.sequenceFlows.size).toBeGreaterThan(0);

			const flow1 = result.sequenceFlows.get('flow1');
			expect(flow1).toBeDefined();
			expect(flow1?.sourceRef).toBe('start');
			expect(flow1?.targetRef).toBe('task1');
		});

		test('P017: 应解析带条件的sequenceFlow', () => {
			const result = BPMNParser.parse(gatewayProcessXML);
			const conditionalFlow = result.sequenceFlows.get('flow2');

			expect(conditionalFlow).toBeDefined();
			expect(conditionalFlow?.conditionExpression).toContain(
				'data.approved'
			);
		});

		test('P018: 应解析默认顺序流属性', () => {
			const result = BPMNParser.parse(gatewayProcessXML);
			const gateway = result.elements.get('gateway');

			expect(gateway?.properties.default).toBe('defaultFlow');
		});
	});

	describe('buildElementConnections - 连接关系', () => {
		test('P019: 应正确建立元素连接关系', () => {
			const result = BPMNParser.parse(simpleProcessXML);
			const startEvent = result.elements.get('start');
			const userTask = result.elements.get('task1');

			expect(startEvent?.outgoing).toContain('flow1');
			expect(userTask?.incoming).toContain('flow1');
			expect(userTask?.outgoing).toContain('flow2');
		});
	});

	describe('边界条件测试', () => {
		test('P022: 应处理包含特殊字符的name', () => {
			const xmlWithSpecialChars = simpleProcessXML.replace(
				'name="审批任务"',
				'name="任务&amp;&lt;&gt;特殊字符"'
			);
			// 根据实际实现调整预期
			expect(() => BPMNParser.parse(xmlWithSpecialChars)).not.toThrow();
		});

		test('应处理大量元素的流程', () => {
			// 生成包含大量元素的 XML
			let manyElementsXML = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="large-process" name="大流程">
    <bpmn:startEvent id="start" />
    <bpmn:endEvent id="end" />`;

			for (let i = 0; i < 100; i++) {
				manyElementsXML += `<bpmn:task id="task${i}" name="任务${i}" />`;
			}

			manyElementsXML += `</bpmn:process></bpmn:definitions>`;

			const result = BPMNParser.parse(manyElementsXML);
			expect(result.elements.size).toBe(102);
		});

		test('应处理深层嵌套的XML', () => {
			const result = BPMNParser.parse(complexProcessXML);
			expect(result.elements.size).toBeGreaterThan(3);
		});
	});

	describe('异常处理测试', () => {
		test('应处理格式错误的BPMN命名空间', () => {
			const wrongNamespaceXML = simpleProcessXML.replace(
				'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
				'xmlns:wrong="http://wrong.namespace"'
			);
			// 可能无法找到元素，但不会抛出异常
			const result = BPMNParser.parse(wrongNamespaceXML);
			expect(result).toBeDefined();
		});

		test('应处理重复ID的元素', () => {
			const duplicateIdXML = simpleProcessXML.replace(
				'<bpmn:userTask id="task1"',
				'<bpmn:userTask id="start"'
			);
			// 根据实现，后解析的可能会覆盖先解析的
			// 重复 ID 会导致验证失败
			expect(() => BPMNParser.parse(duplicateIdXML)).toThrow(
				'BF_PROCESS_VALIDATION_FAILED'
			);
		});
	});

	describe('parseChildContent - 子标签解析', () => {
		test('P-C001: 应解析下级标签为对象数组，标签名作属性名', () => {
			const content = `
				<extensionElements>
					<formProperty id="f1" name="表单1" />
					<formProperty id="f2" name="表单2" />
				</extensionElements>
				<documentation>这是一个审批任务</documentation>
			`;

			const result = BPMNParser.parseChildContent(content);

			expect(result['bpmn:extensionElements']).toBeUndefined(); // 没有命名空间时用纯标签名
			expect(result['extensionElements']).toBeDefined();
			expect(result['extensionElements']).toHaveLength(1);

			const extEl = result['extensionElements'][0]!;
			expect(extEl['formProperty']).toHaveLength(2);
			expect(extEl['formProperty'][0]!.id).toBe('f1');
			expect(extEl['formProperty'][0]!.name).toBe('表单1');
			expect(extEl['formProperty'][1]!.id).toBe('f2');
			expect(extEl['formProperty'][1]!.name).toBe('表单2');

			expect(result['documentation']).toHaveLength(1);
			expect(result['documentation'][0]!).toBe('这是一个审批任务');
		});

		test('P-C002: 应过滤 incoming 和 outgoing 标签', () => {
			const content = `
				<extensionElements>
					<formProperty id="f1" />
				</extensionElements>
				<incoming>flow1</incoming>
				<outgoing>flow2</outgoing>
			`;

			const result = BPMNParser.parseChildContent(content);

			expect(result['incoming']).toBeUndefined();
			expect(result['outgoing']).toBeUndefined();
			expect(result['extensionElements']).toBeDefined();
		});

		test('P-C003: 应解析纯文本子标签为字符串数组', () => {
			const content = `<documentation>文档内容</documentation>`;
			const result = BPMNParser.parseChildContent(content);

			expect(result['documentation']).toHaveLength(1);
			expect(result['documentation'][0]!).toBe('文档内容');
		});

		test('P-C004: 应解析同名重复标签为数组', () => {
			const content = `
				<tag>value1</tag>
				<tag>value2</tag>
				<tag>value3</tag>
			`;
			const result = BPMNParser.parseChildContent(content);

			expect(result['tag']).toHaveLength(3);
			expect(result['tag'][0]!).toBe('value1');
			expect(result['tag'][1]!).toBe('value2');
			expect(result['tag'][2]!).toBe('value3');
		});

		test('P-C005: 空内容应返回空对象', () => {
			expect(BPMNParser.parseChildContent('')).toEqual({});
			expect(BPMNParser.parseChildContent('   \n   ')).toEqual({});
		});
	});

	describe('parseElements - 集成子标签解析', () => {
		test('P-C006: 非自闭合 userTask 的子标签应解析到 properties', () => {
			const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="child-test" name="子标签测试">
    <bpmn:startEvent id="start" />
    <bpmn:userTask id="task1" name="审批">
      <bpmn:extensionElements>
        <activiti:formProperty id="form_123" name="表单1" />
      </bpmn:extensionElements>
      <bpmn:documentation>审批任务说明</bpmn:documentation>
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="end" />
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
    <bpmn:sequenceFlow id="flow2" sourceRef="task1" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`;

			const result = BPMNParser.parse(xml, false);
			const task = result.elements.get('task1');

			expect(task).toBeDefined();
			// 属性层级的属性正常
			expect(task!.properties.id).toBe('task1');
			expect(task!.properties.name).toBe('审批');

			// 子标签解析结果在 childElements 中
			const extEls = task!.childElements!['bpmn:extensionElements'];
			expect(extEls).toBeDefined();
			expect(extEls).toHaveLength(1);
			expect(extEls[0]!['activiti:formProperty']).toBeDefined();
			expect(extEls[0]!['activiti:formProperty'][0]!.id).toBe('form_123');
			expect(extEls[0]!['activiti:formProperty'][0]!.name).toBe('表单1');

			// incoming / outgoing 应被过滤
			expect(task!.childElements!['bpmn:incoming']).toBeUndefined();
			expect(task!.childElements!['bpmn:outgoing']).toBeUndefined();

			// documentation 应为字符串数组
			const docs = task!.childElements!['bpmn:documentation'];
			expect(docs).toBeDefined();
			expect(docs).toHaveLength(1);
			expect(docs[0]!).toBe('审批任务说明');
		});

		test('P-C007: 自闭合标签不应影响子标签解析（无边案例）', () => {
			const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="mixed-test" name="混合测试">
    <bpmn:startEvent id="start" />
    <bpmn:serviceTask id="svc1" name="自动服务" />
    <bpmn:userTask id="approve" name="审批">
      <bpmn:documentation>需要审批</bpmn:documentation>
      <bpmn:incoming>f1</bpmn:incoming>
      <bpmn:outgoing>f2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="end" />
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="approve" />
    <bpmn:sequenceFlow id="f2" sourceRef="approve" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`;

			const result = BPMNParser.parse(xml, false);

			// 自闭合标签不受影响
			const svc = result.elements.get('svc1');
			expect(svc).toBeDefined();
			expect(svc!.properties.name).toBe('自动服务');

			// 非自闭合标签的子标签被解析
			const approve = result.elements.get('approve');
			expect(approve).toBeDefined();
			expect(approve!.childElements!['bpmn:documentation']).toBeDefined();
			expect(approve!.childElements!['bpmn:documentation'][0]!).toBe('需要审批');
		});

		test('P-C008: hook 中应能通过 ctx.node.properties 访问子标签数据', async () => {
			const { FlowEngine } = await import('../engine/FlowEngine.js');

			let capturedDoc: any;
			let capturedExt: any;

			const engine = new FlowEngine({
				onNodeEnter: (ctx) => {
					if (ctx.node.childElements?.['bpmn:documentation']) {
						capturedDoc =
							ctx.node.childElements['bpmn:documentation'];
					}
					if (ctx.node.childElements?.['bpmn:extensionElements']) {
						capturedExt =
							ctx.node.childElements['bpmn:extensionElements'];
					}
				},
			});

			const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="hook-child-test" name="钩子子标签测试">
    <bpmn:startEvent id="start" />
    <bpmn:userTask id="approve" name="审批">
      <bpmn:extensionElements>
        <activiti:formProperty id="hook_form" name="钩子表单" />
      </bpmn:extensionElements>
      <bpmn:documentation>钩子测试文档</bpmn:documentation>
      <bpmn:incoming>f1</bpmn:incoming>
      <bpmn:outgoing>f2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="end" />
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="approve" />
    <bpmn:sequenceFlow id="f2" sourceRef="approve" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`;

			await engine.startProcess(xml, {});

			expect(capturedDoc).toBeDefined();
			expect(capturedDoc[0]!).toBe('钩子测试文档');

			expect(capturedExt).toBeDefined();
			expect(capturedExt[0]!['activiti:formProperty']).toBeDefined();
			expect(
				capturedExt[0]!['activiti:formProperty'][0]!.name
			).toBe('钩子表单');
		});
	});

	describe('getNodeChildren - 按 ID 查询下级标签', () => {
		const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="child-test" name="子标签测试">
    <bpmn:startEvent id="start" />
    <bpmn:userTask id="task1" name="审批">
      <bpmn:extensionElements>
        <activiti:formProperty id="form_123" name="表单1" />
      </bpmn:extensionElements>
      <bpmn:documentation>审批任务说明</bpmn:documentation>
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="end" />
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
    <bpmn:sequenceFlow id="flow2" sourceRef="task1" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`;

		test('P-G001: 应返回指定节点的下级标签结构', () => {
			const children = BPMNParser.getNodeChildren(xml, 'task1');

			expect(children['bpmn:extensionElements']).toBeDefined();
			expect(children['bpmn:extensionElements']).toHaveLength(1);
			expect(
				children['bpmn:extensionElements'][0]!['activiti:formProperty']
			).toBeDefined();
			expect(
				children['bpmn:extensionElements'][0]!['activiti:formProperty'][0]!.id
			).toBe('form_123');

			expect(children['bpmn:documentation']).toBeDefined();
			expect(children['bpmn:documentation'][0]!).toBe('审批任务说明');

			// incoming / outgoing 排除
			expect(children['bpmn:incoming']).toBeUndefined();
			expect(children['bpmn:outgoing']).toBeUndefined();
		});

		test('P-G002: 自闭合节点应返回空对象', () => {
			expect(BPMNParser.getNodeChildren(xml, 'start')).toEqual({});
			expect(BPMNParser.getNodeChildren(xml, 'end')).toEqual({});
		});

		test('P-G003: 不存在的节点 ID 应返回空对象', () => {
			expect(BPMNParser.getNodeChildren(xml, 'nonexistent')).toEqual({});
		});

		test('P-G004: 在 hook 中直接通过 ctx.node.childElements 访问下级标签', async () => {
			const { FlowEngine } = await import('../engine/FlowEngine.js');

			let captured: any;

			const engine = new FlowEngine({
				onNodeEnter: (ctx) => {
					// ctx.node.childElements 已自动包含解析后的下级标签
					if (ctx.node.id === 'task1') {
						captured = ctx.node.childElements;
					}
				},
			});

			await engine.startProcess(xml, {});

			expect(captured).toBeDefined();
			expect(captured['bpmn:documentation'][0]!).toBe(
				'审批任务说明'
			);
			expect(captured['bpmn:extensionElements']).toBeDefined();
			expect(
				captured['bpmn:incoming']
			).toBeUndefined();
			expect(
				captured['bpmn:outgoing']
			).toBeUndefined();
		});
	});
});
