/**
 * 测试用例 BPMN XML 样本数据工厂
 * 提供各种标准测试流程定义
 */

// 简单线性流程：开始 -> 用户任务 -> 结束
export const simpleProcessXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_1">
  <bpmn:process id="simple-process" name="简单流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
    <bpmn:userTask id="task1" name="审批任务">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="task1" targetRef="end" />
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// 排他网关流程：开始 -> 网关(条件分支) -> 任务A/任务B -> 结束
export const gatewayProcessXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_2">
  <bpmn:process id="gateway-process" name="网关流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="gateway" />
    
    <bpmn:exclusiveGateway id="gateway" name="排他网关" default="defaultFlow">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
      <bpmn:outgoing>defaultFlow</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    
    <bpmn:sequenceFlow id="flow2" sourceRef="gateway" targetRef="approvedTask">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${data.approved === true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="defaultFlow" sourceRef="gateway" targetRef="rejectedTask" />
    
    <bpmn:userTask id="approvedTask" name="已审批任务">
      <bpmn:incoming>flow2</bpmn:incoming>
      <bpmn:outgoing>flow3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="rejectedTask" name="已拒绝任务">
      <bpmn:incoming>defaultFlow</bpmn:incoming>
      <bpmn:outgoing>flow4</bpmn:outgoing>
    </bpmn:userTask>
    
    <bpmn:sequenceFlow id="flow3" sourceRef="approvedTask" targetRef="end" />
    <bpmn:sequenceFlow id="flow4" sourceRef="rejectedTask" targetRef="end" />
    
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow3</bpmn:incoming>
      <bpmn:incoming>flow4</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// 复杂流程：包含多种任务类型
export const complexProcessXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_3">
  <bpmn:process id="complex-process" name="复杂流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>f1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="service1" />
    
    <bpmn:serviceTask id="service1" name="自动服务">
      <bpmn:incoming>f1</bpmn:incoming>
      <bpmn:outgoing>f2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="f2" sourceRef="service1" targetRef="script1" />
    
    <bpmn:scriptTask id="script1" name="脚本任务">
      <bpmn:incoming>f2</bpmn:incoming>
      <bpmn:outgoing>f3</bpmn:outgoing>
    </bpmn:scriptTask>
    <bpmn:sequenceFlow id="f3" sourceRef="script1" targetRef="user1" />
    
    <bpmn:userTask id="user1" name="用户审批">
      <bpmn:incoming>f3</bpmn:incoming>
      <bpmn:outgoing>f4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="f4" sourceRef="user1" targetRef="end" />
    
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>f4</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// 并行网关流程（预留）
export const parallelGatewayProcessXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_4">
  <bpmn:process id="parallel-process" name="并行流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="fork" />
    
    <bpmn:parallelGateway id="fork" name="分叉网关">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
      <bpmn:outgoing>flow3</bpmn:outgoing>
    </bpmn:parallelGateway>
    
    <bpmn:sequenceFlow id="flow2" sourceRef="fork" targetRef="taskA" />
    <bpmn:sequenceFlow id="flow3" sourceRef="fork" targetRef="taskB" />
    
    <bpmn:userTask id="taskA" name="任务A">
      <bpmn:incoming>flow2</bpmn:incoming>
      <bpmn:outgoing>flow4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="taskB" name="任务B">
      <bpmn:incoming>flow3</bpmn:incoming>
      <bpmn:outgoing>flow5</bpmn:outgoing>
    </bpmn:userTask>
    
    <bpmn:sequenceFlow id="flow4" sourceRef="taskA" targetRef="join" />
    <bpmn:sequenceFlow id="flow5" sourceRef="taskB" targetRef="join" />
    
    <bpmn:parallelGateway id="join" name="汇聚网关">
      <bpmn:incoming>flow4</bpmn:incoming>
      <bpmn:incoming>flow5</bpmn:incoming>
      <bpmn:outgoing>flow6</bpmn:outgoing>
    </bpmn:parallelGateway>
    
    <bpmn:sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow6</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// 无效XML（用于异常测试）
export const invalidXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="invalid-process">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <!-- 未闭合的标签 -->
    <bpmn:task id="task1" name="任务
  </bpmn:process>
</bpmn:definitions>`;

// 缺少process的XML
export const noProcessXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_empty">
</bpmn:definitions>`;

// 空元素流程
export const emptyProcessXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="empty-process" name="空流程">
  </bpmn:process>
</bpmn:definitions>`;

// 生成指定数量任务的流程（用于性能测试）
export function generateLargeProcess(taskCount: number): string {
	let elements = '';
	let flows = '';

	// 开始事件
	elements += `<bpmn:startEvent id="start" name="开始"><bpmn:outgoing>flow_start</bpmn:outgoing></bpmn:startEvent>`;
	flows += `<bpmn:sequenceFlow id="flow_start" sourceRef="start" targetRef="task0" />`;

	// 生成任务
	for (let i = 0; i < taskCount; i++) {
		elements += `<bpmn:userTask id="task${i}" name="任务${i}">`;
		elements += `<bpmn:incoming>flow${i}</bpmn:incoming>`;

		if (i < taskCount - 1) {
			elements += `<bpmn:outgoing>flow${i + 1}</bpmn:outgoing>`;
			elements += `</bpmn:userTask>`;
			flows += `<bpmn:sequenceFlow id="flow${i + 1}" sourceRef="task${i}" targetRef="task${i + 1}" />`;
		} else {
			elements += `<bpmn:outgoing>flow_end</bpmn:outgoing>`;
			elements += `</bpmn:userTask>`;
			flows += `<bpmn:sequenceFlow id="flow_end" sourceRef="task${i}" targetRef="end" />`;
		}
	}

	// 结束事件
	elements += `<bpmn:endEvent id="end" name="结束"><bpmn:incoming>flow_end</bpmn:incoming></bpmn:endEvent>`;

	return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="large-process-${taskCount}" name="大流程(${taskCount}任务)">
    ${elements}
    ${flows}
  </bpmn:process>
</bpmn:definitions>`;
}
