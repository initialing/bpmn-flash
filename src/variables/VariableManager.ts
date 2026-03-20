/**
 * @fileoverview Variable Manager
 * 管理流程变量的读写和表达式求值
 */

import { ExpressionContext, EvaluationResult } from '../types/index.js';
import { VariableEvaluationError } from '../errors/WorkflowErrors.js';
import { evaluateExpression } from '../utils/ExpressionEvaluator.js';

/**
 * 变量管理器
 * 负责流程变量的存储、访问和表达式求值
 */
export class VariableManager {
	private variables: Record<string, any> = {};

	/**
	 * 设置变量值
	 */
	setVariable(name: string, value: any): void {
		this.variables[name] = value;
	}

	/**
	 * 获取变量值
	 */
	getVariable(name: string): any {
		return this.variables[name];
	}

	/**
	 * 批量设置变量
	 */
	setVariables(variables: Record<string, any>): void {
		this.variables = { ...this.variables, ...variables };
	}

	/**
	 * 获取所有变量
	 */
	getAllVariables(): Record<string, any> {
		return { ...this.variables };
	}

	/**
	 * 清除所有变量
	 */
	clear(): void {
		this.variables = {};
	}

	/**
	 * 从流程状态加载变量
	 */
	loadFromState(stateVariables: Record<string, any>): void {
		this.variables = { ...stateVariables };
	}

	/**
	 * 保存变量到流程状态
	 */
	saveToState(): Record<string, any> {
		return { ...this.variables };
	}

	/**
	 * 求值表达式（使用安全的表达式求值器）
	 */
	evaluateExpression(
		expression: string,
		context?: ExpressionContext
	): EvaluationResult {
		try {
			// 构建执行上下文
			const evalContext = context
				? { ...context.variables, ...this.variables }
				: this.variables;

			// 使用安全的表达式求值器（替代 new Function 和 eval）
			const result = evaluateExpression(expression, evalContext);

			return {
				success: true,
				value: result,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	}

	/**
	 * 验证变量名是否合法
	 */
	private validateVariableName(name: string): boolean {
		// 变量名只能包含字母、数字、下划线和$，且不能以数字开头
		return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
	}

	/**
	 * 设置变量（带验证）
	 */
	setVariableSafe(name: string, value: any): void {
		if (!this.validateVariableName(name)) {
			throw new VariableEvaluationError(`无效的变量名：${name}`);
		}
		this.setVariable(name, value);
	}
}
