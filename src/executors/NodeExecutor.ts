import { ProcessState } from '../state/WorkflowState.js';

/**
 * 节点执行器接口
 * 定义所有节点执行器需要实现的方法
 */
export interface NodeExecutor {
  /**
   * 执行节点
   * @param state 当前流程状态
   * @param element 节点元素定义
   * @param token 当前令牌
   * @returns 执行后的流程状态
   */
  execute(state: ProcessState, element: any, token: any): ProcessState;

  /**
   * 获取此执行器支持的节点类型
   * @returns 节点类型列表
   */
  getSupportedTypes(): string[];

  /**
   * 检查此执行器是否能处理指定类型的节点
   * @param elementType 节点类型
   * @returns 是否能处理
   */
  canHandle(elementType: string): boolean;
}

/**
 * 节点执行器基类
 * 提供通用的执行器功能
 */
export abstract class BaseNodeExecutor implements NodeExecutor {
  /**
   * 执行节点
   */
  abstract execute(state: ProcessState, element: any, token: any): ProcessState;

  /**
   * 获取此执行器支持的节点类型
   */
  abstract getSupportedTypes(): string[];

  /**
   * 检查此执行器是否能处理指定类型的节点
   */
  canHandle(elementType: string): boolean {
    return this.getSupportedTypes().includes(elementType);
  }

  /**
   * 生成唯一ID
   */
  protected generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 创建任务项
   */
  protected createTaskItem(element: any, token: any): any {
    return {
      id: this.generateId(),
      elementId: element.id,
      name: element.name,
      type: element.type,
      status: 'wait', // 默认为等待状态
      data: { ...token.data },
      startedAt: new Date(),
      assignee: null,
      candidateUsers: null,
      candidateGroups: null
    };
  }

  /**
   * 创建新的令牌
   */
  protected createToken(elementId: string, data: any): any {
    return {
      id: this.generateId(),
      elementId,
      data,
      createdAt: new Date(),
    };
  }

  /**
   * 添加历史记录
   */
  protected addHistoryEntry(state: ProcessState, element: any, action: string, data?: any): ProcessState {
    const historyEntry = {
      id: this.generateId(),
      elementId: element.id,
      elementType: element.type,
      action,
      timestamp: new Date(),
      data
    };

    return {
      ...state,
      history: [...state.history, historyEntry]
    };
  }
}