import { describe, test, expect } from 'vitest';
import { evaluateExpression } from '../../utils/ExpressionEvaluator';

describe('括号包裹 + 中括号表示法', () => {
  test('括号包裹 + 中括号 — 通过(10)', () => {
    const ctx = { 
      workflow: { actions: { 'Activity_0unfqws': '10' } },
      data: { workflow: { actions: { 'Activity_0unfqws': '10' } } }
    };
    expect(evaluateExpression("(workflow.actions['Activity_0unfqws'] === '10' )", ctx)).toBe(true);
  });

  test('括号包裹 + 中括号 — 拒绝(20)', () => {
    const ctx = { 
      workflow: { actions: { 'Activity_0unfqws': '20' } },
      data: { workflow: { actions: { 'Activity_0unfqws': '20' } } }
    };
    expect(evaluateExpression("(workflow.actions['Activity_0unfqws'] === '20' )", ctx)).toBe(true);
    expect(evaluateExpression("(workflow.actions['Activity_0unfqws'] === '10' )", ctx)).toBe(false);
  });

  test('括号包裹 + 中括号 — 未赋值 undefined', () => {
    const ctx = { workflow: {}, data: {} };
    expect(evaluateExpression("(workflow.actions['Activity_0unfqws'] === '10' )", ctx)).toBe(false);
    expect(evaluateExpression("(workflow.actions['Activity_0unfqws'] === '20' )", ctx)).toBe(false);
  });

  test('多层中括号', () => {
    const ctx = { a: { b: { c: 'val' } }, data: { a: { b: { c: 'val' } } } };
    expect(evaluateExpression("(a['b']['c'] === 'val')", ctx)).toBe(true);
  });

  test('现有简单表达式仍然正确', () => {
    expect(evaluateExpression('${amount > 100}', { amount: 200 })).toBe(true);
    expect(evaluateExpression('${amount > 100}', { amount: 50 })).toBe(false);
    expect(evaluateExpression('${status == "approved"}', { status: 'approved' })).toBe(true);
  });
});
