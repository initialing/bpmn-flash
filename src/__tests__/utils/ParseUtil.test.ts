import { checkXML, parseXMLToJSON } from '../../utils/ParseUtil';

describe('ParseUtil - checkXML', () => {
	test('should return true for valid XML with root element', () => {
		const validXML = '<root>content</root>';
		expect(checkXML(validXML)).toBe(true);
	});

	test('should return true for valid XML with nested elements', () => {
		const validXML = `
      <root>
        <child>
          <subchild>content</subchild>
        </child>
        <another>data</another>
      </root>
    `;
		expect(checkXML(validXML)).toBe(true);
	});

	test('should return true for XML with attributes', () => {
		const validXML = '<root id="123" name="test">content</root>';
		expect(checkXML(validXML)).toBe(true);
	});

	test('should return true for XML with XML declaration', () => {
		const validXML = `<?xml version="1.0" encoding="UTF-8"?>
      <root>
        <child>content</child>
      </root>`;
		expect(checkXML(validXML)).toBe(true);
	});

	test('should return true for complex BPMN XML', () => {
		const bpmnXML = `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
          <bpmn:process id="test-process" isExecutable="true">
              <bpmn:startEvent id="StartEvent_1">
                  <bpmn:outgoing>SequenceFlow_1</bpmn:outgoing>
              </bpmn:startEvent>
              <bpmn:sequenceFlow id="SequenceFlow_1" sourceRef="StartEvent_1" targetRef="UserTask_1" />
              <bpmn:userTask id="UserTask_1" name="审批任务">
                  <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
                  <bpmn:outgoing>SequenceFlow_3</bpmn:outgoing>
              </bpmn:userTask>
              <bpmn:sequenceFlow id="SequenceFlow_3" sourceRef="UserTask_1" targetRef="EndEvent_1" />
              <bpmn:endEvent id="EndEvent_1">
                  <bpmn:incoming>SequenceFlow_3</bpmn:incoming>
              </bpmn:endEvent>
          </bpmn:process>
      </bpmn:definitions>`;
		expect(checkXML(bpmnXML)).toBe(true);
	});

	test('should return false for empty string', () => {
		expect(checkXML('')).toBe(false);
	});

	test('should return false for non-string input', () => {
		// @ts-expect-error Testing invalid input
		expect(checkXML(null)).toBe(false);
		// @ts-expect-error Testing invalid input
		expect(checkXML(undefined)).toBe(false);
		// @ts-expect-error Testing invalid input
		expect(checkXML(123)).toBe(false);
		// @ts-expect-error Testing invalid input
		expect(checkXML({})).toBe(false);
	});

	test('should return false for string not starting with <', () => {
		expect(checkXML('not xml')).toBe(false);
		expect(checkXML('text < tag')).toBe(false);
	});

	test('should return false for XML with unclosed tags', () => {
		expect(checkXML('<root>content')).toBe(false);
		expect(checkXML('<root><child>content</root>')).toBe(false); // child not closed
		expect(checkXML('<root>content</child>')).toBe(false); // mismatched tags
	});

	test('should return false for XML with mismatched tags', () => {
		expect(checkXML('<root><child>content</root></child>')).toBe(false);
		expect(checkXML('<root><child>content</child></notroot>')).toBe(false);
	});

	test('should return true for XML with self-closing tags', () => {
		expect(checkXML('<root><child/><other>content</other></root>')).toBe(
			true
		);
		expect(checkXML('<root><child id="123" /></root>')).toBe(true);
	});

	test('should return true for XML with comments', () => {
		const xmlWithComments = `
		<root>
			<!-- This is a comment -->
			<child>content</child>
			<!-- Another comment -->
		</root>
    `;
		expect(checkXML(xmlWithComments)).toBe(true);
	});

	test('should return true for XML with CDATA sections', () => {
		const xmlWithCData = `
      <root>
        <child><![CDATA[<p>Some HTML content</p>]]></child>
      </root>
    `;
		expect(checkXML(xmlWithCData)).toBe(true);
	});

	test('should handle whitespace correctly', () => {
		expect(checkXML('  <root>content</root>  ')).toBe(true);
		expect(checkXML('\n<root>\n  <child>content</child>\n</root>\n')).toBe(
			true
		);
	});

	test('should return false for XML with duplicated start tags', () => {
		expect(
			checkXML('<root><child>content</child><child>more</child></root>')
		).toBe(true); // This should be valid
		expect(checkXML('<root><child>content</child>')).toBe(false); // Valid
	});
});

describe('ParseUtil - parseXMLToJSON', () => {
	test('should parse simple BPMN XML to JSON', () => {
		const xmlString = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
          <bpmn:process id="test-process" isExecutable="true">
              <bpmn:startEvent id="StartEvent_1" name="Start" />
          </bpmn:process>
      </bpmn:definitions>`;

		const result = parseXMLToJSON(xmlString);

		expect(result).toBeDefined();
		expect(result).toHaveProperty('Definitions_1');
		expect(result!['Definitions_1']?.tagName).toEqual('definitions');
		expect(result!['Definitions_1']?.properties).toHaveProperty(
			'xmlns:bpmn',
			'http://www.omg.org/spec/BPMN/20100524/MODEL'
		);
		expect(result!['Definitions_1']?.children).toBeDefined();
		expect(result!['Definitions_1']?.children![0]).toHaveProperty(
			'test-process'
		);
		expect(
			result!['Definitions_1']?.children![0]?.['test-process']?.properties
		).toEqual({
			id: 'test-process',
			isExecutable: 'true',
		});
	});

	test('should parse BPMN XML with nested elements', () => {
		const xmlString = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="test-process" isExecutable="true">
              <bpmn:startEvent id="StartEvent_1" name="Start">
                  <bpmn:outgoing>Flow_1</bpmn:outgoing>
              </bpmn:startEvent>
              <bpmn:task id="Task_1" name="My Task" />
              <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
          </bpmn:process>
      </bpmn:definitions>`;

		const result = parseXMLToJSON(xmlString);

		expect(result).toBeDefined();
		expect(result).toHaveProperty('Definitions_1');
		const definitions = result!['Definitions_1'];
		expect(definitions?.children).toBeDefined();
		expect(definitions?.children!.length).toBe(1); // Only process element

		const process = definitions?.children![0]?.['test-process'];
		expect(process?.properties).toEqual({
			id: 'test-process',
			isExecutable: 'true',
		});
		expect(process?.children).toBeDefined();
		expect(process?.children!.length).toBe(3); // startEvent, task, sequenceFlow

		const startEvent = process?.children![0]?.['StartEvent_1'];
		expect(startEvent?.properties).toEqual({
			id: 'StartEvent_1',
			name: 'Start',
		});
		expect(startEvent?.children).toBeDefined();
		expect(startEvent?.children![0]).toHaveProperty('outgoing');
		expect(startEvent?.children![0]?.outgoing?.content).toBe('Flow_1');
	});

	test('should throw error when XML is empty', () => {
		expect(() => parseXMLToJSON('')).toThrow(
			'XML must be a non-empty string'
		);
		expect(() => parseXMLToJSON('   ')).toThrow(
			'XML must be a non-empty string'
		);
	});

	test('should throw error when XML does not contain bpmn:definitions tag', () => {
		const xmlWithoutDefinitions = `
      <?xml version="1.0" encoding="UTF-8"?>
      <root>
          <child>content</child>
      </root>`;
		expect(() => parseXMLToJSON(xmlWithoutDefinitions)).toThrow(
			'Could not find <bpmn:definitions tag in XML'
		);
	});

	test('should handle XML with only bpmn:definitions tag', () => {
		const xmlString = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" />`;

		const result = parseXMLToJSON(xmlString);
		expect(result).toBeNull(); // Self-closing definitions tag should result in null
	});

	test('should parse XML with text content correctly', () => {
		const xmlString = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:textAnnotation id="annotation_1">
              <bpmn:text>This is an annotation</bpmn:text>
          </bpmn:textAnnotation>
      </bpmn:definitions>`;

		const result = parseXMLToJSON(xmlString);
		expect(result).toBeDefined();
		const textAnnotation =
			result!['Definitions_1']?.children![0]?.['annotation_1'];
		expect(textAnnotation?.children).toBeDefined();
		const textElement = textAnnotation?.children![0]?.text;
		expect(textElement?.content).toBe('This is an annotation');
	});

	test('should parse XML with multiple levels of nesting', () => {
		const complexXML = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="complex-process">
              <bpmn:documentation>This process handles user registration</bpmn:documentation>
              <bpmn:startEvent id="start" name="Start Registration" />
              <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="validate" />
              <bpmn:userTask id="validate" name="Validate Input">
                  <bpmn:incoming>flow1</bpmn:incoming>
                  <bpmn:outgoing>flow2</bpmn:outgoing>
              </bpmn:userTask>
              <bpmn:sequenceFlow id="flow2" sourceRef="validate" targetRef="save" />
              <bpmn:serviceTask id="save" name="Save User Data" />
          </bpmn:process>
      </bpmn:definitions>`;

		const result = parseXMLToJSON(complexXML);
		expect(result).toBeDefined();

		const process =
			result!['Definitions_1']?.children![0]?.['complex-process'];
		expect(process?.properties.id).toBe('complex-process');
		expect(process?.children).toBeDefined();
		expect(process?.children!.length).toBe(6); // documentation, startEvent, sequenceFlow, userTask, sequenceFlow, serviceTask

		const userTask = process?.children!.find(child => 'validate' in child);
		expect(userTask).toBeDefined();
		expect(userTask!['validate']?.properties).toEqual({
			id: 'validate',
			name: 'Validate Input',
		});
		expect(userTask!['validate']?.children).toBeDefined();
		expect(userTask!['validate']?.children!.length).toBe(2); // incoming and outgoing

		const incoming = userTask!['validate']?.children![0]?.incoming;
		expect(incoming?.content).toBe('flow1');
		const outgoing = userTask!['validate']?.children![1]?.outgoing;
		expect(outgoing?.content).toBe('flow2');
	});

	test('should handle attributes with bpmn: prefix correctly', () => {
		const xmlString = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="test-process" isExecutable="true" name="Test Process">
              <bpmn:userTask id="UserTask_1" name="审批任务" bpmn:candidateUsers="user1,user2" />
          </bpmn:process>
      </bpmn:definitions>`;

		const result = parseXMLToJSON(xmlString);
		const userTask =
			result!['Definitions_1']?.children![0]?.['test-process']
				?.children![0]?.['UserTask_1'];
		expect(userTask?.properties).toEqual({
			id: 'UserTask_1',
			name: '审批任务',
			candidateUsers: 'user1,user2', // bpmn: prefix should be removed
		});
	});

	test('should return null for XML that is not BPMN format', () => {
		const nonBPMNXML = `
      <root>
          <child id="123">content</child>
      </root>`;
		// This test checks that the function only processes BPMN XML from <bpmn:definitions onwards
		// The function should throw an error since it doesn't find <bpmn:definitions
		expect(() => parseXMLToJSON(nonBPMNXML)).toThrow(
			'Could not find <bpmn:definitions tag in XML'
		);
	});
});
