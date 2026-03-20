import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';
import { evaluateExpression } from '../utils/ExpressionEvaluator.js';

/**
 * 服务任务执行器
 * 处理服务任务节点
 */
export class ServiceTaskExecutor extends BaseNodeExecutor {
  /**
   * 获取此执行器支持的节点类型
   */
  getSupportedTypes(): string[] {
    return [
      'bpmn:serviceTask'
    ];
  }

  /**
   * 执行服务任务
   */
  async execute(state: ProcessState, element: any, token: any): Promise<ProcessState> {
    // 记录服务任务执行历史
    let newState = this.addHistoryEntry(
      state, 
      element, 
      'start', 
      { tokenId: token.id, elementId: element.id }
    );

    try {
      // 执行服务任务逻辑
      const result = await this.executeServiceTask(element, token.data);

      // 记录执行结果
      newState = this.addHistoryEntry(
        newState,
        element,
        'complete',
        { tokenId: token.id, elementId: element.id, result }
      );

      // 移除当前令牌
      newState = {
        ...newState,
        tokens: newState.tokens.filter(t => t.id !== token.id)
      };

      // 更新流程数据（如果服务任务返回了新数据）
      if (result && typeof result === 'object') {
        newState = {
          ...newState,
          data: { ...newState.data, ...result }
        };
      }

      // 继续执行后续节点
      newState = this.continueToNextElements(newState, element, { ...token.data, ...result });

      return newState;
    } catch (error) {
      // 记录错误
      newState = this.addHistoryEntry(
        newState,
        element,
        'error',
        { tokenId: token.id, elementId: element.id, error: error instanceof Error ? error.message : String(error) }
      );

      // 移除当前令牌
      newState = {
        ...newState,
        tokens: newState.tokens.filter(t => t.id !== token.id)
      };

      return newState;
    }
  }

  /**
   * 执行具体的服务任务
   */
  private async executeServiceTask(element: any, inputData: any): Promise<any> {
    // 这里应该是实际的服务任务执行逻辑
    // 在当前实现中，我们提供一个模拟执行
    // 在真实场景中，这里会调用外部服务或执行具体业务逻辑

    // 从元素中获取服务任务的实现信息
    const implementation = element.properties?.implementation || element.properties?.class;

    if (implementation) {
      // 如果指定了具体实现，可以根据实现类型执行不同的逻辑
      switch (implementation) {
        case 'http-service':
          return this.executeHttpService(element, inputData);
        case 'email-service':
          return this.executeEmailService(element, inputData);
        case 'script':
          return this.executeScriptService(element, inputData);
        default:
          // 默认情况下，模拟执行并返回输入数据
          return new Promise(resolve => {
            setTimeout(() => {
              resolve(inputData);
            }, 100); // 模拟异步执行
          });
      }
    } else {
      // 没有指定实现，直接返回输入数据
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(inputData);
        }, 100); // 模拟异步执行
      });
    }
  }

  /**
   * 执行HTTP服务
   */
  private async executeHttpService(element: any, inputData: any): Promise<any> {
    // 这里应该执行HTTP请求
    // 模拟实现
    console.log(`Executing HTTP service for element ${element.id}`);
    return { ...inputData, httpResult: 'success' };
  }

  /**
   * 执行邮件服务
   */
  private async executeEmailService(element: any, inputData: any): Promise<any> {
    // 这里应该发送邮件
    // 模拟实现
    console.log(`Sending email for element ${element.id}`);
    return { ...inputData, emailSent: true };
  }

  /**
   * 执行脚本服务
   */
  private async executeScriptService(element: any, inputData: any): Promise<any> {
    // 这里应该执行嵌入的脚本
    // 注意：在实际实现中，这需要安全的沙箱环境
    const script = element.properties?.script;
    if (script) {
      // 模拟脚本执行
      console.log(`Executing script for element ${element.id}`);
      return { ...inputData, scriptResult: 'executed' };
    }
    return inputData;
  }

  /**
   * 继续执行后续节点
   */
  private continueToNextElements(state: ProcessState, element: any, outputData: any): ProcessState {
    // 获取后续元素ID（从流程定义中获取outgoing sequence flows）
    const nextElementIds = element.outgoing || [];

    // 为每个后续元素创建新的令牌
    const newTokens = nextElementIds.map(elementId => 
      this.createToken(elementId, outputData)
    );

    // 添加新令牌到状态
    return {
      ...state,
      tokens: [...state.tokens, ...newTokens]
    };
  }
}