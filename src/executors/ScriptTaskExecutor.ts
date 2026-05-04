import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { evaluateExpressionResult } from '../utils/ExpressionEvaluator.js';
import { ElementLike, TokenLike } from '../types/index.js';

/**
 * 脚本任务执行结果
 */
interface ScriptExecutionResult {
	success: boolean;
	value?: Record<string, any>;
	error?: string;
}

/**
 * 脚本任务执行器
 * 处理脚本任务节点（bpmn:scriptTask）
 * 支持安全的脚本执行，使用表达式求值器替代 eval
 */
export class ScriptTaskExecutor extends BaseNodeExecutor {
	/**
	 * 获取此执行器支持的节点类型
	 */
	getSupportedTypes(): string[] {
		return ['bpmn:scriptTask'];
	}

	/**
	 * 执行脚本任务
	 */
	async execute(
		state: ProcessState,
		element: ElementLike,
		token: TokenLike
	): Promise<ProcessState> {
		let newState = this.addHistoryEntry(state, element, 'start', {
			tokenId: token.id,
			elementId: element.id,
		});

		try {
			const result = await this.executeScript(element, token.data);

			if (result.success) {
				newState = this.addHistoryEntry(newState, element, 'complete', {
					tokenId: token.id,
					elementId: element.id,
					result: result.value,
				});

				if (result.value && typeof result.value === 'object') {
					newState = {
						...newState,
						data: { ...newState.data, ...result.value },
					};
				}
			} else {
				newState = this.addHistoryEntry(newState, element, 'error', {
					tokenId: token.id,
					elementId: element.id,
					error: result.error,
				});
			}

			newState = {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};

			const outputData = result.success
				? { ...token.data, ...result.value }
				: token.data;

			newState = this.continueToNextElements(
				newState,
				element,
				outputData
			);

			return newState;
		} catch (error) {
			newState = this.addHistoryEntry(newState, element, 'error', {
				tokenId: token.id,
				elementId: element.id,
				error: error instanceof Error ? error.message : String(error),
			});

			newState = {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};

			return newState;
		}
	}

	/**
	 * 执行具体的脚本
	 */
	private async executeScript(
		element: ElementLike,
		inputData: Record<string, any>
	): Promise<ScriptExecutionResult> {
		const script = element.properties?.script;
		const scriptLanguage =
			element.properties?.scriptLanguage || 'javascript';

		if (!script) {
			return {
				success: false,
				error: '未指定脚本内容',
			};
		}

		try {
			switch (scriptLanguage.toLowerCase()) {
			case 'javascript':
			case 'js':
				return this.executeJavaScript(script, inputData);
			case 'expression':
				return this.executeExpression(script, inputData);
			default:
				return {
					success: false,
					error: `不支持的脚本语言：${scriptLanguage}`,
				};
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 执行 JavaScript 脚本（安全模式）
	 */
	private executeJavaScript(
		script: string,
		inputData: Record<string, any>
	): ScriptExecutionResult {
		const unsafeKeywords = [
			'eval',
			'Function',
			'require',
			'import',
			'process',
			'global',
			'window',
			'document',
			'console',
			'setTimeout',
			'setInterval',
			'XMLHttpRequest',
			'fetch',
		];

		for (const keyword of unsafeKeywords) {
			const regex = new RegExp(`\\b${keyword}\\b`, 'i');
			if (regex.test(script)) {
				return {
					success: false,
					error: `脚本包含不安全的关键字：${keyword}`,
				};
			}
		}

		try {
			const lines = script
				.trim()
				.split('\n')
				.map(line => line.trim());

			if (lines.length === 0) {
				return {
					success: true,
					value: inputData,
				};
			}

			if (lines.length === 1) {
				const result = evaluateExpressionResult(lines[0], inputData);
				return {
					success: result.success,
					value: result.success ? result.value : undefined,
					error: result.error,
				};
			}

			const context = { ...inputData };
			let lastResult: any;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const isLastLine = i === lines.length - 1;

				const assignmentMatch = line.match(
					/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/
				);
				if (assignmentMatch) {
					const [, varName, expression] = assignmentMatch;
					const result = evaluateExpressionResult(
						expression,
						context
					);
					if (!result.success) {
						return {
							success: false,
							error: `第${i + 1}行执行失败：${result.error}`,
						};
					}
					context[varName] = result.value;
					lastResult = result.value;
				} else if (isLastLine) {
					const result = evaluateExpressionResult(line, context);
					if (!result.success) {
						return {
							success: false,
							error: `第${i + 1}行执行失败：${result.error}`,
						};
					}
					lastResult = result.value;
				} else {
					const result = evaluateExpressionResult(line, context);
					if (!result.success) {
						return {
							success: false,
							error: `第${i + 1}行执行失败：${result.error}`,
						};
					}
					lastResult = result.value;
				}
			}

			return {
				success: true,
				value: lastResult !== undefined ? lastResult : context,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 执行简单表达式
	 */
	private executeExpression(
		expression: string,
		inputData: Record<string, any>
	): ScriptExecutionResult {
		const result = evaluateExpressionResult(expression, inputData);
		return {
			success: result.success,
			value: result.success ? result.value : undefined,
			error: result.error,
		};
	}

	/**
	 * 继续执行后续节点
	 */
	private continueToNextElements(
		state: ProcessState,
		element: ElementLike,
		outputData: Record<string, any>
	): ProcessState {
		const nextElementIds = element.outgoing || [];
		const newTokens = nextElementIds.map(elementId =>
			this.createToken(elementId, outputData)
		);

		return {
			...state,
			tokens: [...state.tokens, ...newTokens],
		};
	}
}
