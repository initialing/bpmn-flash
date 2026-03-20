import { ExpressionContext, EvaluationResult } from '../types/index';
import { VariableEvaluationError } from '../errors/WorkflowErrors';

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
   * 求值表达式
   */
  evaluateExpression(expression: string, context?: ExpressionContext): EvaluationResult {
    try {
      // 构建执行上下文
      const evalContext = context ? { ...context.variables, ...this.variables } : this.variables;
      
      // 简单的安全检查：不允许某些危险操作
      if (this.containsUnsafeCode(expression)) {
        throw new VariableEvaluationError(`表达式包含不安全的操作: ${expression}`);
      }

      // 替换表达式中的变量引用（例如 ${variableName} 或 #{variableName}）
      let processedExpression = expression.trim();
      
      // 处理 ${variableName} 格式
      const varRegex = /\$\{([^}]+)\}/g;
      processedExpression = processedExpression.replace(varRegex, (match, varName) => {
        const value = evalContext[varName.trim()];
        if (value === undefined || value === null) {
          return 'undefined';
        }
        // 根据值的类型返回适当的表示
        return typeof value === 'string' ? `"${value}"` : String(value);
      });

      // 处理 #{variableName} 格式
      const beanRegex = /#\{([^}]+)\}/g;
      processedExpression = processedExpression.replace(beanRegex, (match, varName) => {
        const value = evalContext[varName.trim()];
        if (value === undefined || value === null) {
          return 'undefined';
        }
        return typeof value === 'string' ? `"${value}"` : String(value);
      });

      // 执行表达式
      // 注意：在生产环境中，应该使用更安全的表达式解析库
      // 这里仅作演示用途
      let result: any;
      try {
        // 创建一个安全的执行环境
        const safeEval = new Function(...Object.keys(evalContext), `return (${processedExpression})`);
        result = safeEval(...Object.values(evalContext));
      } catch (e) {
        // 如果表达式本身有问题，尝试直接求值
        result = eval(processedExpression);
      }

      return {
        success: true,
        value: result
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * 检查表达式是否包含不安全的代码
   */
  private containsUnsafeCode(expression: string): boolean {
    // 检查常见的危险模式
    const unsafePatterns = [
      /\b(import|require|process|global|window|document|eval|Function|constructor|__proto__|prototype)\b/,
      /require\s*\(/,
      /import\s+/,
      /from\s+/,
      /global\./,
      /process\./,
      /window\./,
      /document\./,
      /location\./,
      /history\./,
      /navigator\./,
      /XMLHttpRequest|fetch|WebSocket/,
      /setTimeout|setInterval|setImmediate/,
      /os\.|\bfs\b|\bchild_process\b|\bcrypto\b/,
    ];

    return unsafePatterns.some(pattern => pattern.test(expression));
  }
}