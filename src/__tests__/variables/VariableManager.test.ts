import { describe, test, expect, beforeEach } from 'vitest';
import { VariableManager } from '../../variables/VariableManager.js';

describe('VariableManager', () => {
	let manager: VariableManager;

	beforeEach(() => {
		manager = new VariableManager();
	});

	describe('setVariable / getVariable', () => {
		test('应设置和获取变量', () => {
			manager.setVariable('name', '张三');
			expect(manager.getVariable('name')).toBe('张三');
		});

		test('应支持不同类型的值', () => {
			manager.setVariable('num', 42);
			manager.setVariable('bool', true);
			manager.setVariable('obj', { a: 1 });
			manager.setVariable('arr', [1, 2, 3]);

			expect(manager.getVariable('num')).toBe(42);
			expect(manager.getVariable('bool')).toBe(true);
			expect(manager.getVariable('obj')).toEqual({ a: 1 });
			expect(manager.getVariable('arr')).toEqual([1, 2, 3]);
		});

		test('获取不存在的变量应返回 undefined', () => {
			expect(manager.getVariable('nonexistent')).toBeUndefined();
		});

		test('应能覆盖已有变量', () => {
			manager.setVariable('x', 1);
			manager.setVariable('x', 2);
			expect(manager.getVariable('x')).toBe(2);
		});
	});

	describe('setVariables', () => {
		test('应批量设置变量', () => {
			manager.setVariables({ a: 1, b: 'hello', c: true });

			expect(manager.getVariable('a')).toBe(1);
			expect(manager.getVariable('b')).toBe('hello');
			expect(manager.getVariable('c')).toBe(true);
		});

		test('应合并而非替换已有变量', () => {
			manager.setVariable('existing', 'keep');
			manager.setVariables({ newVar: 'added' });

			expect(manager.getVariable('existing')).toBe('keep');
			expect(manager.getVariable('newVar')).toBe('added');
		});
	});

	describe('getAllVariables', () => {
		test('应返回所有变量的副本', () => {
			manager.setVariables({ a: 1, b: 2 });
			const all = manager.getAllVariables();

			expect(all).toEqual({ a: 1, b: 2 });

			// 修改返回值不应影响原始数据
			all.a = 999;
			expect(manager.getVariable('a')).toBe(1);
		});

		test('空管理器应返回空对象', () => {
			expect(manager.getAllVariables()).toEqual({});
		});
	});

	describe('clear', () => {
		test('应清除所有变量', () => {
			manager.setVariables({ a: 1, b: 2 });
			manager.clear();

			expect(manager.getAllVariables()).toEqual({});
			expect(manager.getVariable('a')).toBeUndefined();
		});
	});

	describe('loadFromState / saveToState', () => {
		test('应从状态加载变量', () => {
			manager.loadFromState({ x: 10, y: 20 });

			expect(manager.getVariable('x')).toBe(10);
			expect(manager.getVariable('y')).toBe(20);
		});

		test('loadFromState 应替换已有变量', () => {
			manager.setVariable('old', 'value');
			manager.loadFromState({ new: 'value' });

			expect(manager.getVariable('old')).toBeUndefined();
			expect(manager.getVariable('new')).toBe('value');
		});

		test('saveToState 应返回变量副本', () => {
			manager.setVariables({ a: 1, b: 2 });
			const saved = manager.saveToState();

			expect(saved).toEqual({ a: 1, b: 2 });

			// 修改返回值不应影响原始数据
			saved.a = 999;
			expect(manager.getVariable('a')).toBe(1);
		});
	});

	describe('evaluateExpression', () => {
		test('应使用管理器中的变量求值', () => {
			manager.setVariable('amount', 100);
			const result = manager.evaluateExpression('${amount > 50}');

			expect(result.success).toBe(true);
			expect(result.value).toBe(true);
		});

		test('应支持外部上下文', () => {
			manager.setVariable('base', 10);
			const result = manager.evaluateExpression('${base + extra}', {
				variables: { extra: 20 },
			});

			expect(result.success).toBe(true);
			expect(result.value).toBe(30);
		});

		test('不安全表达式应返回 success=false', () => {
			const result = manager.evaluateExpression('${eval("1")}');

			expect(result.success).toBe(false);
		});

		test('无上下文也应正常工作', () => {
			manager.setVariable('x', 5);
			const result = manager.evaluateExpression('${x > 3}');

			expect(result.success).toBe(true);
			expect(result.value).toBe(true);
		});
	});

	describe('setVariableSafe', () => {
		test('合法变量名应正常设置', () => {
			expect(() => manager.setVariableSafe('validName', 1)).not.toThrow();
			expect(() => manager.setVariableSafe('_private', 2)).not.toThrow();
			expect(() => manager.setVariableSafe('$dollar', 3)).not.toThrow();
			expect(() => manager.setVariableSafe('camelCase123', 4)).not.toThrow();
		});

		test('非法变量名应抛出错误', () => {
			expect(() => manager.setVariableSafe('123abc', 1)).toThrow();
			expect(() => manager.setVariableSafe('a-b', 1)).toThrow();
			expect(() => manager.setVariableSafe('a b', 1)).toThrow();
			expect(() => manager.setVariableSafe('', 1)).toThrow();
		});

		test('合法名设置后应能获取', () => {
			manager.setVariableSafe('myVar', 'value');
			expect(manager.getVariable('myVar')).toBe('value');
		});
	});
});
