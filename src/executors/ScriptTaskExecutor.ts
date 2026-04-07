import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { evaluateExpressionResult } from '../utils/ExpressionEvaluator.js';

/**
 * 脚本任务执行结果
 */
interface ScriptExecutionResult {
	success: boolean;
	value?: any;
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
		element: any,
		token: any
	): Promise<ProcessState> {
		// 记录脚本任务执行历史
		let newState = this.addHistoryEntry(state, element, 'start', {
			tokenId: token.id,
			elementId: element.id,
		});

		try {
			// 执行脚本
			const result = await this.executeScript(element, token.data);

			if (result.success) {
				// 记录执行成功
				newState = this.addHistoryEntry(newState, element, 'complete', {
					tokenId: token.id,
					elementId: element.id,
					result: result.value,
				});

				// 更新流程数据（如果脚本返回了新数据）
				if (result.value && typeof result.value === 'object') {
					newState = {
						...newState,
						data: { ...newState.data, ...result.value },
					};
				}
			} else {
				// 记录执行错误
				newState = this.addHistoryEntry(newState, element, 'error', {
					tokenId: token.id,
					elementId: element.id,
					error: result.error,
				});
			}

			// 移除当前令牌
			newState = {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};

			// 继续执行后续节点
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
			// 记录错误
			newState = this.addHistoryEntry(newState, element, 'error', {
				tokenId: token.id,
				elementId: element.id,
				error: error instanceof Error ? error.message : String(error),
			});

			// 移除当前令牌
			newState = {
				...newState,
				tokens: newState.tokens.filter(t => t.id !== token.id),
			};

			return newState;
		}
	}

	/**
	 * 执行具体的脚本
	 * @param element 脚本任务元素
	 * @param inputData 输入数据
	 * @returns 执行结果
	 */
	private async executeScript(
		element: any,
		inputData: any
	): Promise<ScriptExecutionResult> {
		// 从元素中获取脚本信息
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
			// 根据脚本语言选择执行方式
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
	 * 使用表达式求值器替代 eval，确保安全性
	 * @param script 脚本内容
	 * @param inputData 输入数据
	 * @returns 执行结果
	 */
	private executeJavaScript(
		script: string,
		inputData: any
	): ScriptExecutionResult {
		// 安全检查：检测不安全的关键字
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
			// 尝试将脚本作为表达式求值
			// 支持多行脚本，最后一行作为返回值
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

			// 如果只有一行，直接作为表达式求值
			if (lines.length === 1) {
				const result = evaluateExpressionResult(lines[0], inputData);
				return {
					success: result.success,
					value: result.success ? result.value : undefined,
					error: result.error,
				};
			}

			// 多行脚本：执行前面的语句，最后一行作为返回值
			const context = { ...inputData };
			let lastResult: any;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const isLastLine = i === lines.length - 1;

				// 处理变量赋值语句
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
					// 最后一行作为返回值
					const result = evaluateExpressionResult(line, context);
					if (!result.success) {
						return {
							success: false,
							error: `第${i + 1}行执行失败：${result.error}`,
						};
					}
					lastResult = result.value;
				} else {
					// 其他语句作为表达式执行
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
	 * @param expression 表达式字符串
	 * @param inputData 输入数据
	 * @returns 执行结果
	 */
	private executeExpression(
		expression: string,
		inputData: any
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
	 * @param state 当前流程状态
	 * @param element 当前元素
	 * @param outputData 输出数据
	 * @returns 新的流程状态
	 */
	private continueToNextElements(
		state: ProcessState,
		element: any,
		outputData: any
	): ProcessState {
		// 获取后续元素 ID（从流程定义中获取 outgoing sequence flows）
		const nextElementIds = element.outgoing || [];

		// 为每个后续元素创建新的令牌
		const newTokens = nextElementIds.map(elementId =>
			this.createToken(elementId, outputData)
		);

		// 添加新令牌到状态
		return {
			...state,
			tokens: [...state.tokens, ...newTokens],
		};
	}
}
