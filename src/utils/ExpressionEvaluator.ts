/**
 * 表达式评估器
 * 用于安全地评估条件表达式，避免使用 new Function 或 eval
 * 支持算术运算、比较运算、逻辑运算和变量替换
 */

// 不安全表达式模式检测
const UNSAFE_PATTERNS = [
	/\bprocess\b/,
	/\brequire\b/,
	/\bimport\b/,
	/\beval\b/,
	/\bFunction\b/,
	/\bconstructor\b/,
	/\b__proto__\b/,
	/\bprototype\b/,
	/\bglobal\b/,
	/\bwindow\b/,
	/\bdocument\b/,
];

/**
 * 检查表达式是否安全
 */
function isSafeExpression(expression: string): boolean {
	for (const pattern of UNSAFE_PATTERNS) {
		if (pattern.test(expression)) {
			return false;
		}
	}
	return true;
}

/**
 * 表达式评估结果
 */
export interface ExpressionResult {
	success: boolean;
	value?: any;
	error?: string;
}

/**
 * 评估表达式（返回完整结果）
 * @param expression 表达式字符串
 * @param context 变量上下文
 * @returns 评估结果
 */
export function evaluateExpressionResult(
	expression: string | null,
	context: Record<string, any>
): ExpressionResult {
	if (!expression) {
		return { success: true, value: true };
	}

	// 安全检查
	if (!isSafeExpression(expression)) {
		return {
			success: false,
			error: '表达式包含不安全的内容',
		};
	}

	try {
		// 支持 ${...} 或 #{...} 格式的表达式
		let innerExpression = expression.trim();

		// 如果整个表达式是单个 ${...} 或 #{...} 包裹的表达式，
		// 提取内部内容作为完整表达式进行求值（支持 ${amount > 500} 这种写法）
		const singleWrapMatch = innerExpression.match(/^(\$\{|#\{)([^}]+)\}$/);
		if (singleWrapMatch) {
			const innerContent = singleWrapMatch[2]!.trim();
			// 如果内部包含运算符，作为完整表达式求值
			if (/[><=!&|+\-*/]/.test(innerContent)) {
				// 替换内部表达式中的变量引用为实际值
				// 跳过字符串字面值（双引号或单引号内的内容）
				innerExpression = innerContent.replace(
					/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([a-zA-Z_][a-zA-Z0-9_.]*)/g,
					(fullMatch, strLiteral, varMatch) => {
						// 如果匹配到字符串字面值，原样保留
						if (strLiteral) {
							return strLiteral;
						}
						// 跳过字面值关键字
						if (
							['true', 'false', 'null', 'undefined'].includes(
								varMatch.toLowerCase()
							)
						) {
							return varMatch;
						}
						const value = getValue(varMatch, context);
						if (value === undefined) {
							return 'undefined';
						}
						if (typeof value === 'string') {
							return `'${value}'`;
						}
						return String(value);
					}
				);
			} else {
				// 简单变量引用，如 ${amount}
				const value = getValue(innerContent, context);
				if (value === undefined) {
					innerExpression = 'undefined';
				} else if (typeof value === 'string') {
					innerExpression = `'${value}'`;
				} else {
					innerExpression = String(value);
				}
			}
		} else {
			// 替换所有的 ${var} 和 #{var} 为对应的值
			innerExpression = innerExpression.replace(
				/(\$\{|#\{)([^}]+)\}/g,
				(match, prefix, content) => {
					const value = getValue(content.trim(), context);
					if (value === undefined) {
						return 'undefined';
					}
					if (typeof value === 'string') {
						return `'${value}'`;
					}
					return String(value);
				}
			);
		}

		const result = evaluateSimpleExpression(innerExpression, context);
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
 * 评估表达式（返回布尔值，向后兼容）
 * @param expression 表达式字符串
 * @param context 变量上下文
 * @returns 布尔结果
 */
export function evaluateExpression(
	expression: string | null,
	context: Record<string, any>
): boolean {
	const result = evaluateExpressionResult(expression, context);
	if (result.success) {
		return Boolean(result.value);
	}
	return false;
}

/**
 * 评估简单表达式
 * 支持算术运算、比较运算和逻辑运算
 */
function evaluateSimpleExpression(
	expr: string,
	context: Record<string, any>
): any {
	// 移除多余的空白字符
	expr = expr.trim();

	// 剥离外层匹配的括号，将(...)内的表达式作为整体计算
	while (expr.startsWith('(') && expr.endsWith(')')) {
		// 确认左右括号是匹配的顶层括号
		let depth = 0;
		let matched = true;
		for (let i = 0; i < expr.length; i++) {
			if (expr[i] === '(') depth++;
			if (expr[i] === ')') depth--;
			// 如果在到达末尾前 depth 归零，说明不是包裹整个表达式的括号
			if (depth === 0 && i < expr.length - 1) {
				matched = false;
				break;
			}
		}
		if (matched && depth === 0) {
			expr = expr.slice(1, -1).trim();
		} else {
			break;
		}
	}

	// 处理逻辑运算符（优先级最低）
	if (expr.includes('||')) {
		const parts = splitByOperator(expr, '||');
		return parts.some(part =>
			evaluateSimpleExpression(part.trim(), context)
		);
	}

	if (expr.includes('&&')) {
		const parts = splitByOperator(expr, '&&');
		return parts.every(part =>
			evaluateSimpleExpression(part.trim(), context)
		);
	}

	// 处理逻辑非
	if (expr.startsWith('!')) {
		const innerExpr = expr.substring(1).trim();
		return !evaluateSimpleExpression(innerExpr, context);
	}

	// 处理比较运算符（优先级中等）
	if (expr.includes('===')) {
		const [left, right] = splitComparison(expr, '===');
		return (
			getValue(left.trim(), context) === getValue(right.trim(), context)
		);
	}

	if (expr.includes('==')) {
		const [left, right] = splitComparison(expr, '==');
		return (
			getValue(left.trim(), context) == getValue(right.trim(), context)
		);
	}

	if (expr.includes('!==')) {
		const [left, right] = splitComparison(expr, '!==');
		return (
			getValue(left.trim(), context) !== getValue(right.trim(), context)
		);
	}

	if (expr.includes('!=')) {
		const [left, right] = splitComparison(expr, '!=');
		return (
			getValue(left.trim(), context) != getValue(right.trim(), context)
		);
	}

	if (expr.includes('>=')) {
		const [left, right] = splitComparison(expr, '>=');
		return (
			Number(getValue(left.trim(), context)) >=
			Number(getValue(right.trim(), context))
		);
	}

	if (expr.includes('<=')) {
		const [left, right] = splitComparison(expr, '<=');
		return (
			Number(getValue(left.trim(), context)) <=
			Number(getValue(right.trim(), context))
		);
	}

	if (expr.includes('>') && !expr.includes('>>')) {
		const [left, right] = splitComparison(expr, '>');
		return (
			Number(getValue(left.trim(), context)) >
			Number(getValue(right.trim(), context))
		);
	}

	if (expr.includes('<') && !expr.includes('<<')) {
		const [left, right] = splitComparison(expr, '<');
		return (
			Number(getValue(left.trim(), context)) <
			Number(getValue(right.trim(), context))
		);
	}

	// 处理算术运算符（优先级最高）
	// 先处理加法（注意：要区分字符串拼接和数字加法）
	if (expr.includes('+')) {
		const parts = splitByOperator(expr, '+');
		if (parts.length > 1) {
			const values = parts.map(part => getValue(part.trim(), context));
			// 如果有任何一个值是字符串，进行字符串拼接
			if (values.some(v => typeof v === 'string')) {
				return values.map(v => String(v)).join('');
			}
			// 否则进行数字加法
			return values.reduce((sum, val) => sum + Number(val), 0);
		}
	}

	if (expr.includes('-')) {
		const parts = splitByOperator(expr, '-');
		if (parts.length > 1) {
			const values = parts.map(part => getValue(part.trim(), context));
			return values.reduce((diff, val, index) => {
				return index === 0 ? Number(val) : diff - Number(val);
			});
		}
	}

	if (expr.includes('*')) {
		const parts = splitByOperator(expr, '*');
		if (parts.length > 1) {
			const values = parts.map(part => getValue(part.trim(), context));
			return values.reduce((product, val) => product * Number(val), 1);
		}
	}

	if (expr.includes('/')) {
		const parts = splitByOperator(expr, '/');
		if (parts.length > 1) {
			const values = parts.map(part => getValue(part.trim(), context));
			return values.reduce((quotient, val, index) => {
				return index === 0 ? Number(val) : quotient / Number(val);
			});
		}
	}

	// 如果只是一个变量名或字面值，返回其值
	return getValue(expr, context);
}

/**
 * 根据上下文获取值
 */
function getValue(expr: string, context: Record<string, any>): any {
	expr = expr.trim();

	// 如果是数字字面值
	if (/^-?\d+(\.\d+)?$/.test(expr)) {
		return parseFloat(expr);
	}

	// 如果是字符串字面值（用引号包围）
	if (
		(expr.startsWith('"') && expr.endsWith('"')) ||
		(expr.startsWith("'") && expr.endsWith("'"))
	) {
		return expr.substring(1, expr.length - 1);
	}

	// 如果是布尔字面值
	if (expr.toLowerCase() === 'true') {
		return true;
	}
	if (expr.toLowerCase() === 'false') {
		return false;
	}

	// 如果是 null 或 undefined
	if (expr.toLowerCase() === 'null') {
		return null;
	}
	if (expr.toLowerCase() === 'undefined') {
		return undefined;
	}

	// 从上下文中获取变量值
	// 支持点号表示法，例如：user.age
	// 支持中括号表示法，例如：actions['key'] 或 actions["key"]
	// 支持链式中括号，例如：a['b']['c']
	const parts = expr.split('.');
	let value: any = context;

	for (const part of parts) {
		if (
			value === null ||
			value === undefined ||
			typeof value !== 'object'
		) {
			value = undefined;
			break;
		}

		if (/\[['"]/.test(part)) {
			// 包含中括号表示法（如 actions['key'] 或 a['b']['c']）
			// 用正则依次提取 propName 和 bracketKey
			const segRegex = /(\w+)|\[(['"])([^'"]*)\2\]/g;
			let segMatch;
			while ((segMatch = segRegex.exec(part)) !== null) {
				const key: string = segMatch[1] ?? segMatch[3] ?? '';
				if (
					value === null ||
					value === undefined ||
					typeof value !== 'object'
				) {
					value = undefined;
					break;
				}
				value = value[key];
			}
		} else {
			value = value[part];
		}
	}

	return value;
}

/**
 * 按操作符分割表达式，考虑括号
 */
function splitByOperator(expr: string, operator: string): string[] {
	const result: string[] = [];
	let current = '';
	let parenLevel = 0;
	let i = 0;

	while (i < expr.length) {
		const char = expr[i];

		if (char === '(') {
			parenLevel++;
			current += char;
		} else if (char === ')') {
			parenLevel--;
			current += char;
		} else if (
			parenLevel === 0 &&
			expr.substr(i, operator.length) === operator
		) {
			result.push(current);
			current = '';
			i += operator.length - 1; // 跳过操作符的其余字符
		} else {
			current += char;
		}

		i++;
	}

	if (current) {
		result.push(current);
	}

	return result;
}

/**
 * 按比较操作符分割表达式
 */
function splitComparison(expr: string, operator: string): [string, string] {
	// 找到最后一次出现的位置以避免嵌套问题
	const index = expr.lastIndexOf(operator);
	if (index > 0) {
		return [
			expr.substring(0, index),
			expr.substring(index + operator.length),
		];
	}
	throw new Error(`Invalid comparison expression: ${expr}`);
}
