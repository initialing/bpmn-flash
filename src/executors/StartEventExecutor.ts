import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';

/**
 * 开始事件执行器
 * 处理各种类型的开始事件
 */
export class StartEventExecutor extends BaseNodeExecutor {
  /**
   * 获取此执行器支持的节点类型
   */
  getSupportedTypes(): string[] {
    return [
      'bpmn:startEvent',
      'bpmn:timerStartEvent',
      'bpmn:messageStartEvent',
      'bpmn:signalStartEvent'
    ];
  }

  /**
   * 执行开始事件
   */
  execute(state: ProcessState, element: any, token: any): ProcessState {
    // 记录开始事件执行历史
    let newState = this.addHistoryEntry(
      state, 
      element, 
      'start', 
      { tokenId: token.id, elementId: element.id }
    );

    // 对于开始事件，主要是推进到下一个节点
    // 创建新的令牌用于后续节点
    const nextElementIds = this.getNextElementIds(element, newState);
    
    // 创建新的令牌指向下一个节点
    const newTokens = nextElementIds.map(elementId => 
      this.createToken(elementId, { ...token.data })
    );

    // 更新状态：移除当前令牌，添加新令牌
    newState = {
      ...newState,
      tokens: [
        ...newState.tokens.filter(t => t.id !== token.id),
        ...newTokens
      ]
    };

    // 如果这是流程的第一个事件，更新流程状态
    if (newState.status === 'created') {
      newState = {
        ...newState,
        status: 'running',
        startedAt: newState.startedAt || new Date()
      };
    }

    return newState;
  }

  /**
   * 获取下一个元素ID列表
   */
  private getNextElementIds(element: any, state: ProcessState): string[] {
    // 这里需要访问流程定义来获取下一个元素
    // 由于当前状态中没有流程定义的引用，我们暂时返回空数组
    // 在完整实现中，这里会查找当前元素的outgoing sequence flows
    // 并返回对应的target elements
    return element.outgoing || [];
  }
}