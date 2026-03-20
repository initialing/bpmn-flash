/**
 * 表达式评估器
 * 用于安全地评估条件表达式，避免使用 new Function 或 eval
 */

// 简单的表达式解析器，支持基本的比较和逻辑运算
export function evaluateExpression(
	expression: string | null,
	context: Record<string, any>
): boolean {
	if (!expression) {
		return true; // 如果没有表达式，默认为真
	}

	try {
		// 支持 \${...} 格式的表达式
		if (expression.startsWith('${') && expression.endsWith('}')) {
			const innerExpression = expression
				.substring(2, expression.length - 1)
				.trim();
			return evaluateSimpleExpression(innerExpression, context);
		} else {
			// 如果不是标准格式，直接评估整个表达式
			return evaluateSimpleExpression(expression, context);
		}
	} catch (error) {
		console.error(`表达式评估错误: ${expression}`, error);
		return false;
	}
}

/**
 * 评估简单表达式
 * 支持基本的比较运算符和逻辑运算符
 */
function evaluateSimpleExpression(
	expr: string,
	context: Record<string, any>
): boolean {
	// 移除多余的空白字符
	expr = expr.trim();

	// 处理逻辑运算符
	if (expr.includes('&&')) {
		const parts = splitByOperator(expr, '&&');
		return parts.every(part =>
			evaluateSimpleExpression(part.trim(), context)
		);
	}

	if (expr.includes('||')) {
		const parts = splitByOperator(expr, '||');
		return parts.some(part =>
			evaluateSimpleExpression(part.trim(), context)
		);
	}

	if (expr.startsWith('!')) {
		const innerExpr = expr.substring(1).trim();
		return !evaluateSimpleExpression(innerExpr, context);
	}

	// 处理比较运算符
	if (expr.includes('==')) {
		const [left, right] = splitComparison(expr, '==');
		return (
			getValue(left.trim(), context) == getValue(right.trim(), context)
		);
	}

	if (expr.includes('===')) {
		const [left, right] = splitComparison(expr, '===');
		return (
			getValue(left.trim(), context) === getValue(right.trim(), context)
		);
	}

	if (expr.includes('!=')) {
		const [left, right] = splitComparison(expr, '!=');
		return (
			getValue(left.trim(), context) != getValue(right.trim(), context)
		);
	}

	if (expr.includes('!==')) {
		const [left, right] = splitComparison(expr, '!==');
		return (
			getValue(left.trim(), context) !== getValue(right.trim(), context)
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

	if (expr.includes('>')) {
		const [left, right] = splitComparison(expr, '>');
		return (
			Number(getValue(left.trim(), context)) >
			Number(getValue(right.trim(), context))
		);
	}

	if (expr.includes('<')) {
		const [left, right] = splitComparison(expr, '<');
		return (
			Number(getValue(left.trim(), context)) <
			Number(getValue(right.trim(), context))
		);
	}

	// 如果只是一个变量名或字面值，返回其布尔值
	const value = getValue(expr, context);
	return Boolean(value);
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

	// 如果是null或undefined
	if (expr.toLowerCase() === 'null') {
		return null;
	}
	if (expr.toLowerCase() === 'undefined') {
		return undefined;
	}

	// 从上下文中获取变量值
	// 支持点号表示法，例如: user.age
	const parts = expr.split('.');
	let value: any = context;

	for (const part of parts) {
		if (value && typeof value === 'object') {
			value = value[part];
		} else {
			// 如果路径不存在，返回undefined
			value = undefined;
			break;
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
