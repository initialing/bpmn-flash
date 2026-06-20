/**
 * v3 测试用 BPMN XML 样本
 * 为新架构的各种测试场景提供标准 BPMN XML
 */

// ============================================================
// 1. 最简流程：start → userTask → end
// ============================================================
export const SIMPLE_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_simple">
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

// ============================================================
// 2. 自动通过流程：start → task(普通) → end（无人挂起）
// ============================================================
export const AUTO_PASS_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_auto">
  <bpmn:process id="auto-process" name="自动流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
    <bpmn:task id="task1" name="自动任务">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:sequenceFlow id="flow2" sourceRef="task1" targetRef="end" />
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// ============================================================
// 3. 排他网关流程：start → gateway → approvedTask/rejectedTask → end
// ============================================================
export const EXCLUSIVE_GATEWAY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_exclusive">
  <bpmn:process id="exclusive-process" name="排他网关流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="gateway" />

    <bpmn:exclusiveGateway id="gateway" name="排他网关" default="defaultFlow">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow_approved</bpmn:outgoing>
      <bpmn:outgoing>defaultFlow</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:sequenceFlow id="flow_approved" sourceRef="gateway" targetRef="approvedTask">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${approved === true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="defaultFlow" sourceRef="gateway" targetRef="rejectedTask" />

    <bpmn:userTask id="approvedTask" name="已审批任务">
      <bpmn:incoming>flow_approved</bpmn:incoming>
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

// ============================================================
// 4. 并行网关流程：start → fork → taskA + taskB → join → end
// ============================================================
export const PARALLEL_GATEWAY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_parallel">
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

// ============================================================
// 5. 脚本任务流程：start → scriptTask → end
// ============================================================
export const SCRIPT_TASK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_script">
  <bpmn:process id="script-process" name="脚本流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="script1" />
    <bpmn:scriptTask id="script1" name="计算任务">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:scriptTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="script1" targetRef="end" />
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// ============================================================
// 6. suspend + resume 流程：start → userTask → serviceTask → end
// ============================================================
export const SUSPEND_RESUME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_suspend">
  <bpmn:process id="suspend-process" name="挂起恢复流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="userTask1" />
    <bpmn:userTask id="userTask1" name="用户审批">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="userTask1" targetRef="serviceTask1" />
    <bpmn:serviceTask id="serviceTask1" name="服务调用">
      <bpmn:incoming>flow2</bpmn:incoming>
      <bpmn:outgoing>flow3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow3" sourceRef="serviceTask1" targetRef="end" />
    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow3</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// ============================================================
// 7. 多 suspend 并行流程：
//    start → fork → userTaskA + userTaskB → join → end
// ============================================================
export const MULTI_SUSPEND_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_multi_suspend">
  <bpmn:process id="multi-suspend-process" name="多挂起流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="fork" />

    <bpmn:parallelGateway id="fork" name="分叉">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
      <bpmn:outgoing>flow3</bpmn:outgoing>
    </bpmn:parallelGateway>

    <bpmn:sequenceFlow id="flow2" sourceRef="fork" targetRef="userTaskA" />
    <bpmn:sequenceFlow id="flow3" sourceRef="fork" targetRef="userTaskB" />

    <bpmn:userTask id="userTaskA" name="审批A">
      <bpmn:incoming>flow2</bpmn:incoming>
      <bpmn:outgoing>flow4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="userTaskB" name="审批B">
      <bpmn:incoming>flow3</bpmn:incoming>
      <bpmn:outgoing>flow5</bpmn:outgoing>
    </bpmn:userTask>

    <bpmn:sequenceFlow id="flow4" sourceRef="userTaskA" targetRef="join" />
    <bpmn:sequenceFlow id="flow5" sourceRef="userTaskB" targetRef="join" />

    <bpmn:parallelGateway id="join" name="汇聚">
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

// ============================================================
// 8. 包含网关流程：start → inclusiveGw → taskA + taskB + taskC → join → end
// ============================================================
export const INCLUSIVE_GATEWAY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_inclusive">
  <bpmn:process id="inclusive-process" name="包含网关流程" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="igw" />

    <bpmn:inclusiveGateway id="igw" name="包含网关" default="defaultFlow">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flowA</bpmn:outgoing>
      <bpmn:outgoing>flowB</bpmn:outgoing>
      <bpmn:outgoing>defaultFlow</bpmn:outgoing>
    </bpmn:inclusiveGateway>

    <bpmn:sequenceFlow id="flowA" sourceRef="igw" targetRef="taskA">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${amount > 100}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="flowB" sourceRef="igw" targetRef="taskB">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${amount > 500}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="defaultFlow" sourceRef="igw" targetRef="taskC" />

    <bpmn:userTask id="taskA" name="任务A">
      <bpmn:incoming>flowA</bpmn:incoming>
      <bpmn:outgoing>flow4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="taskB" name="任务B">
      <bpmn:incoming>flowB</bpmn:incoming>
      <bpmn:outgoing>flow5</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="taskC" name="任务C">
      <bpmn:incoming>defaultFlow</bpmn:incoming>
      <bpmn:outgoing>flow6</bpmn:outgoing>
    </bpmn:userTask>

    <bpmn:sequenceFlow id="flow4" sourceRef="taskA" targetRef="end" />
    <bpmn:sequenceFlow id="flow5" sourceRef="taskB" targetRef="end" />
    <bpmn:sequenceFlow id="flow6" sourceRef="taskC" targetRef="end" />

    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow4</bpmn:incoming>
      <bpmn:incoming>flow5</bpmn:incoming>
      <bpmn:incoming>flow6</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// ============================================================
// 9. 排他网关（无条件单出口）
// ============================================================
export const EXCLUSIVE_SINGLE_OUT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_single">
  <bpmn:process id="single-out-process" name="单出口排他网关" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="gateway" />

    <bpmn:exclusiveGateway id="gateway" name="网关">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:sequenceFlow id="flow2" sourceRef="gateway" targetRef="end" />

    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// ============================================================
// 10. 排他网关（审批 → 网关 → 分支）
//     start → userTask → gateway → taskA/taskB → end
// ============================================================
export const EXCLUSIVE_AFTER_TASK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_exclusive_after">
  <bpmn:process id="exclusive-after-process" name="审批后排他网关" isExecutable="true">
    <bpmn:startEvent id="start" name="开始">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="userTask1" />

    <bpmn:userTask id="userTask1" name="主管审批">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="userTask1" targetRef="gateway" />

    <bpmn:exclusiveGateway id="gateway" name="判断网关" default="defaultFlow">
      <bpmn:incoming>flow2</bpmn:incoming>
      <bpmn:outgoing>flow_yes</bpmn:outgoing>
      <bpmn:outgoing>defaultFlow</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:sequenceFlow id="flow_yes" sourceRef="gateway" targetRef="taskA">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${approved === true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="defaultFlow" sourceRef="gateway" targetRef="taskB" />

    <bpmn:serviceTask id="taskA" name="执行审批通过">
      <bpmn:incoming>flow_yes</bpmn:incoming>
      <bpmn:outgoing>flow5</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="taskB" name="执行审批拒绝">
      <bpmn:incoming>defaultFlow</bpmn:incoming>
      <bpmn:outgoing>flow6</bpmn:outgoing>
    </bpmn:serviceTask>

    <bpmn:sequenceFlow id="flow5" sourceRef="taskA" targetRef="end" />
    <bpmn:sequenceFlow id="flow6" sourceRef="taskB" targetRef="end" />

    <bpmn:endEvent id="end" name="结束">
      <bpmn:incoming>flow5</bpmn:incoming>
      <bpmn:incoming>flow6</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;
