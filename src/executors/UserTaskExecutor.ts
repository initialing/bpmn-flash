import { ProcessState, Item } from '../state/WorkflowState.js';
import { BaseNodeExecutor } from './NodeExecutor.js';

/**
 * 用户任务执行器
 * 处理用户任务节点
 */
export class UserTaskExecutor extends BaseNodeExecutor {
  /**
   * 获取此执行器支持的节点类型
   */
  getSupportedTypes(): string[] {
    return [
      'bpmn:userTask',
      'bpmn:manualTask'
    ];
  }

  /**
   * 执行用户任务
   */
  execute(state: ProcessState, element: any, token: any): ProcessState {
    // 记录用户任务执行历史
    let newState = this.addHistoryEntry(
      state, 
      element, 
      'start', 
      { tokenId: token.id, elementId: element.id }
    );

    // 创建用户任务项
    const taskItem: Item = {
      id: this.generateId(),
      elementId: element.id,
      name: element.name || element.id,
      type: element.type,
      status: 'wait', // 用户任务默认为等待状态
      data: { ...token.data },
      startedAt: new Date(),
      assignee: this.extractAssignee(element),
      candidateUsers: this.extractCandidateUsers(element),
      candidateGroups: this.extractCandidateGroups(element),
      endedAt: undefined
    };

    // 添加任务到状态
    newState = {
      ...newState,
      items: [...newState.items, taskItem],
      // 移除当前令牌，因为用户任务需要等待用户操作
      tokens: newState.tokens.filter(t => t.id !== token.id)
    };

    // 设置流程状态为等待（如果有用户任务需要处理）
    if (newState.status === 'running') {
      newState = {
        ...newState,
        status: 'suspended' // 流程暂停等待用户操作
      };
    }

    return newState;
  }

  /**
   * 从元素中提取负责人
   */
  private extractAssignee(element: any): string | undefined {
    // 从元素属性中提取分配给特定用户的信息
    // 这里简化处理，实际实现中会从bpmn:extensionElements中提取
    if (element.properties && element.properties.assignee) {
      return element.properties.assignee;
    }
    return undefined;
  }

  /**
   * 从元素中提取候选用户
   */
  private extractCandidateUsers(element: any): string[] | undefined {
    // 从元素属性中提取候选用户信息
    if (element.properties && element.properties.candidateUsers) {
      return element.properties.candidateUsers.split(',');
    }
    return undefined;
  }

  /**
   * 从元素中提取候选组
   */
  private extractCandidateGroups(element: any): string[] | undefined {
    // 从元素属性中提取候选组信息
    if (element.properties && element.properties.candidateGroups) {
      return element.properties.candidateGroups.split(',');
    }
    return undefined;
  }
}