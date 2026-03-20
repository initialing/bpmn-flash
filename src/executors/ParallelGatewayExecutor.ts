import { ProcessState } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';

/**
 * 并行网关执行器
 * 处理并行网关节点（AND网关）
 */
export class ParallelGatewayExecutor extends BaseNodeExecutor {
  /**
   * 获取此执行器支持的节点类型
   */
  getSupportedTypes(): string[] {
    return [
      'bpmn:parallelGateway'
    ];
  }

  /**
   * 执行并行网关
   */
  execute(state: ProcessState, element: any, token: any): ProcessState {
    // 记录网关执行历史
    let newState = this.addHistoryEntry(
      state, 
      element, 
      'transition', 
      { tokenId: token.id, elementId: element.id }
    );

    try {
      // 获取入口令牌数量（到达此并行网关的所有令牌）
      const incomingTokens = this.getIncomingTokensForGateway(newState, element);
      
      // 获取出口顺序流数量
      const outgoingFlows = element.outgoing || [];
      
      // 对于并行汇聚网关（多个入口，一个出口）
      if (incomingTokens.length > 1 && outgoingFlows.length === 1) {
        // 等待所有入口令牌到达
        const allTokensForThisGateway = incomingTokens.filter(t => 
          this.isTokenForThisGateway(t, element)
        );
        
        if (allTokensForThisGateway.length >= this.getIncomingFlowCount(element)) {
          // 所有令牌都到达了，可以继续执行
          return this.handleParallelJoin(newState, element, token);
        } else {
          // 还有令牌未到达，移除当前令牌（因为它会被其他到达的令牌处理）
          return {
            ...newState,
            tokens: newState.tokens.filter(t => t.id !== token.id)
          };
        }
      } 
      // 对于并行分裂网关（一个入口，多个出口）
      else if (incomingTokens.length === 1 && outgoingFlows.length > 1) {
        // 创建多个令牌，每个出口一个
        return this.handleParallelSplit(newState, element, token);
      } 
      // 一般情况，按顺序流处理
      else {
        return this.handleNormalTransition(newState, element, token);
      }
    } catch (error) {
      // 记录错误
      newState = this.addHistoryEntry(
        newState,
        element,
        'error',
        { tokenId: token.id, elementId: element.id, error: error instanceof Error ? error.message : String(error) }
      );

      // 移除当前令牌
      return {
        ...newState,
        tokens: newState.tokens.filter(t => t.id !== token.id)
      };
    }
  }

  /**
   * 处理并行分裂（一个令牌分裂为多个）
   */
  private handleParallelSplit(state: ProcessState, element: any, token: any): ProcessState {
    // 获取所有出口顺序流
    const outgoingFlows = element.outgoing || [];
    
    // 为每个出口创建一个令牌
    const newTokens = outgoingFlows.map(flowId => {
      const nextElementId = this.getNextElementId(element, flowId);
      return this.createToken(nextElementId, token.data);
    }).filter(token => token.elementId); // 过滤掉无效的令牌

    // 更新状态：移除当前令牌，添加新令牌
    return {
      ...state,
      tokens: [
        ...state.tokens.filter(t => t.id !== token.id),
        ...newTokens
      ]
    };
  }

  /**
   * 处理并行汇聚（多个令牌汇聚为一个）
   */
  private handleParallelJoin(state: ProcessState, element: any, token: any): ProcessState {
    // 获取所有属于此网关的令牌
    const tokensForThisGateway = state.tokens.filter(t => 
      this.isTokenFromIncomingPaths(t, element)
    );

    // 移除所有这些令牌
    const remainingTokens = state.tokens.filter(t => 
      !tokensForThisGateway.some(gatewayToken => gatewayToken.id === t.id)
    );

    // 创建一个新令牌继续执行
    const outgoingFlows = element.outgoing || [];
    const newTokens = outgoingFlows.map(flowId => {
      const nextElementId = this.getNextElementId(element, flowId);
      return this.createToken(nextElementId, token.data);
    }).filter(token => token.elementId); // 过滤掉无效的令牌

    // 更新状态
    return {
      ...state,
      tokens: [
        ...remainingTokens,
        ...newTokens
      ]
    };
  }

  /**
   * 处理普通转换
   */
  private handleNormalTransition(state: ProcessState, element: any, token: any): ProcessState {
    // 获取出口顺序流
    const outgoingFlows = element.outgoing || [];
    
    if (outgoingFlows.length === 0) {
      // 没有出口，移除令牌
      return {
        ...state,
        tokens: state.tokens.filter(t => t.id !== token.id)
      };
    }

    // 为每个出口创建令牌
    const newTokens = outgoingFlows.map(flowId => {
      const nextElementId = this.getNextElementId(element, flowId);
      return this.createToken(nextElementId, token.data);
    }).filter(token => token.elementId); // 过滤掉无效的令牌

    // 更新状态：移除当前令牌，添加新令牌
    return {
      ...state,
      tokens: [
        ...state.tokens.filter(t => t.id !== token.id),
        ...newTokens
      ]
    };
  }

  /**
   * 获取进入此网关的令牌
   */
  private getIncomingTokensForGateway(state: ProcessState, element: any): any[] {
    // 简化实现：返回所有令牌
    // 在完整实现中，需要根据流程定义确定哪些令牌应该到达此网关
    return state.tokens;
  }

  /**
   * 检查令牌是否属于此网关
   */
  private isTokenForThisGateway(token: any, element: any): boolean {
    // 简化实现：假设所有令牌都可能与此网关相关
    // 在完整实现中，需要根据流程路径判断
    return true;
  }

  /**
   * 检查令牌是否来自入口路径
   */
  private isTokenFromIncomingPaths(token: any, element: any): boolean {
    // 简化实现：假设令牌来自入口路径
    // 在完整实现中，需要根据流程路径判断
    return true;
  }

  /**
   * 获取入口顺序流数量
   */
  private getIncomingFlowCount(element: any): number {
    // 简化实现：返回1
    // 在完整实现中，需要从流程定义中获取入口流的数量
    return 1;
  }

  /**
   * 获取下一个元素ID
   */
  private getNextElementId(element: any, flowId: string): string | null {
    // 这里需要从流程定义中获取目标元素ID
    // 简化实现，返回基于flowId的模拟ID
    return flowId.replace('flow', 'element');
  }
}