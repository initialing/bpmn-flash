import { describe, it, expect } from 'vitest';
import BPMNParser from '../parser/BPMNParser';
import { BpmnValidator } from '../parser/BpmnValidator';
import { VariableManager } from '../variables/VariableManager';
import { ParseError, ValidationError } from '../errors/WorkflowErrors';

describe('Week 1 Implementation Tests', () => {
	describe('BPMN Parser with Enhanced Error Handling', () => {
		it('should parse basic BPMN XML successfully', () => {
			const basicBpmnXml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                     xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="testProcess" name="Test Process">
            <startEvent id="start" name="Start" />
            <endEvent id="end" name="End" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
          </process>
        </definitions>
      `;

			const result = BPMNParser.parse(basicBpmnXml);
			expect(result.id).toBe('testProcess');
			expect(result.name).toBe('Test Process');
			expect(result.elements.size).toBeGreaterThan(0);
			expect(result.sequenceFlows.size).toBeGreaterThan(0);
		});

		it('should throw ParseError for invalid XML', () => {
			expect(() => {
				BPMNParser.parse('');
			}).toThrow(ParseError);

			expect(() => {
				BPMNParser.parse('<invalid>');
			}).toThrow(ParseError);
		});

		it('should validate process definition correctly', () => {
			const validBpmnXml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                     xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="validProcess" name="Valid Process">
            <startEvent id="start" name="Start" />
            <endEvent id="end" name="End" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
          </process>
        </definitions>
      `;

			const processDef = BPMNParser.parse(validBpmnXml);
			const validation = BpmnValidator.validate(processDef);

			expect(validation.isValid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect missing start event', () => {
			const invalidBpmnXml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                     xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="invalidProcess" name="Invalid Process">
            <endEvent id="end" name="End" />
          </process>
        </definitions>
      `;

			const processDef = BPMNParser.parse(invalidBpmnXml, false); // Skip validation during parsing
			const validation = BpmnValidator.validate(processDef);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContainEqual(
				expect.objectContaining({ code: 'MISSING_START_EVENT' })
			);
		});
	});

	describe('Variable Manager', () => {
		it('should manage variables correctly', () => {
			const vm = new VariableManager();

			vm.setVariable('age', 25);
			vm.setVariable('name', 'John');
			vm.setVariable('active', true);

			expect(vm.getVariable('age')).toBe(25);
			expect(vm.getVariable('name')).toBe('John');
			expect(vm.getVariable('active')).toBe(true);

			vm.setVariables({ city: 'New York', country: 'USA' });
			expect(vm.getVariable('city')).toBe('New York');
			expect(vm.getVariable('country')).toBe('USA');
		});

		it('should evaluate simple expressions', () => {
			const vm = new VariableManager();
			vm.setVariable('x', 10);
			vm.setVariable('y', 5);

			const result = vm.evaluateExpression('x + y');
			expect(result.success).toBe(true);
			expect(result.value).toBe(15);
		});

		it('should handle variable substitution in expressions', () => {
			const vm = new VariableManager();
			vm.setVariable('userAge', 30);
			vm.setVariable('userName', 'Alice');

			// Test ${variable} syntax
			let result = vm.evaluateExpression('${userAge} > 18');
			expect(result.success).toBe(true);
			expect(result.value).toBe(true);

			// Test #{variable} syntax
			result = vm.evaluateExpression("'Hello ' + #{userName}");
			expect(result.success).toBe(true);
			expect(result.value).toBe('Hello Alice');
		});

		it('should detect unsafe expressions', () => {
			const vm = new VariableManager();

			const unsafeExpressions = [
				'process.env',
				'require("fs")',
				'import fs from "fs"',
				'eval("alert(1)")',
				'Function("return process")()',
			];

			unsafeExpressions.forEach(expr => {
				const result = vm.evaluateExpression(expr);
				expect(result.success).toBe(false);
			});
		});
	});
});
