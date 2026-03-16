import {
	baseCheckBPMN,
	getRelationSequenceFlowIds,
	getBpmnNodesByIds,
	checkNodeIncomingSequenceFlow,
	checkBPMNExecution,
} from '../../utils/ExecuteUtil';
import { ParsedXmlElement } from '../../types/index';

describe('ExecuteUtil Tests', () => {
	describe('baseCheckBPMN', () => {
		test('should return error when no definitions found', () => {
			const bpmn = {};
			const result = baseCheckBPMN(bpmn);
			expect(result).toBe('No definitions found');
		});

		test('should return error when multiple definitions found', () => {
			const bpmn = {
				definitions: {
					tagName: 'definitions',
					properties: {},
					children: [],
				},
				otherDef: { tagName: 'otherDef', properties: {}, children: [] },
			};
			const result = baseCheckBPMN(bpmn);
			expect(result).toBe('Multiple definitions found');
		});

		test('should return error when no process found', () => {
			const bpmn = {
				definitions: {
					tagName: 'definitions',
					properties: {},
					children: [],
				},
			};
			const result = baseCheckBPMN(bpmn);
			expect(result).toBe('No process found');
		});

		test('should return error when multiple processes found', () => {
			const bpmn = {
				definitions: {
					tagName: 'definitions',
					properties: {},
					children: [
						{
							process: {
								tagName: 'process',
								properties: {},
								children: [],
							},
						},
						{
							other: {
								tagName: 'other',
								properties: {},
								children: [],
							},
						},
					],
				},
			};
			const result = baseCheckBPMN(bpmn);
			expect(result).toBe('Multiple processes found');
		});

		test('should return null when valid bpmn', () => {
			const bpmn = {
				definitions: {
					tagName: 'definitions',
					properties: {},
					children: [
						{
							process: {
								tagName: 'process',
								properties: {},
								children: [],
							},
						},
					],
				},
			};
			const result = baseCheckBPMN(bpmn);
			expect(result).toBeNull();
		});
	});

	describe('getRelationSequenceFlowIds', () => {
		test('should get outgoing flow IDs', () => {
			const node: ParsedXmlElement = {
				task1: {
					tagName: 'task',
					properties: {},
					children: [
						{
							outgoing: {
								tagName: 'outgoing',
								properties: {},
								content: 'flow1',
							},
						},
						{
							outgoing: {
								tagName: 'outgoing',
								properties: {},
								content: 'flow2',
							},
						},
					],
				},
			};

			const result = getRelationSequenceFlowIds(node, 'outgoing');
			expect(result).toEqual(['flow1', 'flow2']);
		});

		test('should get incoming flow IDs', () => {
			const node: ParsedXmlElement = {
				task1: {
					tagName: 'task',
					properties: {},
					children: [
						{
							incoming: {
								tagName: 'incoming',
								properties: {},
								content: 'flow1',
							},
						},
					],
				},
			};

			const result = getRelationSequenceFlowIds(node, 'incoming');
			expect(result).toEqual(['flow1']);
		});
	});

	describe('getBpmnNodesByIds', () => {
		test('should return nodes by IDs', () => {
			const bpmnNodes: ParsedXmlElement[] = [
				{
					node1: {
						tagName: 'task',
						properties: {},
						children: [],
					},
				},
				{
					node2: {
						tagName: 'task',
						properties: {},
						children: [],
					},
				},
				{
					node3: {
						tagName: 'task',
						properties: {},
						children: [],
					},
				},
			];

			const result = getBpmnNodesByIds(bpmnNodes, ['node1', 'node3']);
			expect(result).toHaveLength(2);
			expect(result![0]).toHaveProperty('node1');
			expect(result![1]).toHaveProperty('node3');
		});

		test('should return null when no nodes found', () => {
			const bpmnNodes: ParsedXmlElement[] = [
				{
					node1: {
						tagName: 'task',
						properties: {},
						children: [],
					},
				},
			];

			const result = getBpmnNodesByIds(bpmnNodes, ['nonexistent']);
			expect(result).toBeNull();
		});
	});

	describe('checkNodeIncomingSequenceFlow', () => {
		test('should return true when incoming sequence flow matches', () => {
			const node: ParsedXmlElement = {
				task1: {
					tagName: 'task',
					properties: {},
					children: [
						{
							incoming: {
								tagName: 'incoming',
								properties: {},
								content: 'flow1',
							},
						},
					],
				},
			};

			const sequenceFlow: ParsedXmlElement = {
				flow1: {
					tagName: 'sequenceFlow',
					properties: {
						targetRef: 'task1',
					},
					children: [],
				},
			};

			const result = checkNodeIncomingSequenceFlow(node, sequenceFlow);
			expect(result).toBe(true);
		});

		test('should return false when incoming sequence flow does not match', () => {
			const node: ParsedXmlElement = {
				task1: {
					tagName: 'task',
					properties: {},
					children: [
						{
							incoming: {
								tagName: 'incoming',
								properties: {},
								content: 'flow2',
							},
						},
					],
				},
			};

			const sequenceFlow: ParsedXmlElement = {
				flow1: {
					tagName: 'sequenceFlow',
					properties: {
						targetRef: 'task1',
					},
					children: [],
				},
			};

			const result = checkNodeIncomingSequenceFlow(node, sequenceFlow);
			expect(result).toBe(false);
		});
	});

	describe('checkBPMNExecution', () => {
		test('should detect multiple start events', () => {
			const bpmnNodes: ParsedXmlElement[] = [
				{
					start1: {
						tagName: 'startEvent',
						properties: {},
						children: [],
					},
				},
				{
					start2: {
						tagName: 'startEvent',
						properties: {},
						children: [],
					},
				},
			];

			const result = checkBPMNExecution(bpmnNodes, false);
			expect(result).toContainEqual({ code: 'MULTI_START' });
		});

		test('should detect no start event', () => {
			const bpmnNodes: ParsedXmlElement[] = [
				{
					task1: {
						tagName: 'task',
						properties: {},
						children: [],
					},
				},
			];

			const result = checkBPMNExecution(bpmnNodes, false);
			expect(result).toContainEqual({ code: 'NO_START' });
		});

		test('should detect unreachable nodes in strict mode', () => {
			const bpmnNodes: ParsedXmlElement[] = [
				{
					start1: {
						tagName: 'startEvent',
						properties: {},
						children: [
							{
								outgoing: {
									tagName: 'outgoing',
									properties: {},
									content: 'flow1',
								},
							},
						],
					},
				},
				{
					flow1: {
						tagName: 'sequenceFlow',
						properties: {
							targetRef: 'task1',
						},
						children: [],
					},
				},
				{
					task1: {
						tagName: 'task',
						properties: {},
						children: [
							{
								incoming: {
									tagName: 'incoming',
									properties: {},
									content: 'flow1',
								},
							},
							{
								outgoing: {
									tagName: 'outgoing',
									properties: {},
									content: 'flow2',
								},
							},
						],
					},
				},
				{
					flow2: {
						tagName: 'sequenceFlow',
						properties: {
							targetRef: 'end1',
						},
						children: [],
					},
				},
				{
					end1: {
						tagName: 'endEvent',
						properties: {},
						children: [],
					},
				},
				{
					unreachableTask: {
						tagName: 'task',
						properties: {},
						children: [],
					},
				},
			];

			const result = checkBPMNExecution(bpmnNodes, true);
			expect(result).toContainEqual({
				code: 'UNREACHABLE',
				reason: ['unreachableTask'],
			});
		});
	});
});
