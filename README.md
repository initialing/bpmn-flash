# BPMN Flash

一个轻量级、快速的BPMN 2.0引擎实现，使用TypeScript编写，支持ESModule和CommonJS两种模块格式。

## 简介

BPMN Flash是一个简单但功能强大的工作流引擎，支持BPMN 2.0标准的部分元素。它能够解析BPMN XML定义并执行业务流程。项目采用TypeScript编写，支持现代JavaScript模块系统，并提供完整的类型定义。

## 特性

- 解析BPMN 2.0 XML定义
- 支持多种BPMN元素：
    - 开始事件和结束事件
    - 用户任务
    - 服务任务
    - 脚本任务
    - 排他网关
- 基于令牌的执行模型
- 条件表达式评估
- 任务分配和完成机制
- 支持ESModule和CommonJS两种模块格式
- 完整的TypeScript类型定义

## 安装

```bash
npm install bpmn-flash
```

## 使用示例

### JavaScript (ESModule)

```javascript
import StandaloneBPMNEngine from 'bpmn-flash';

const engine = new StandaloneBPMNEngine();

const bpmnXML = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
    <bpmn:process id="test-process" isExecutable="true">
        <bpmn:startEvent id="StartEvent_1">
            <bpmn:outgoing>SequenceFlow_1</bpmn:outgoing>
        </bpmn:startEvent>
        <bpmn:sequenceFlow id="SequenceFlow_1" sourceRef="StartEvent_1" targetRef="UserTask_1" />
        <bpmn:userTask id="UserTask_1" name="审批任务">
            <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
            <bpmn:outgoing>SequenceFlow_3</bpmn:outgoing>
        </bpmn:userTask>
        <bpmn:sequenceFlow id="SequenceFlow_3" sourceRef="UserTask_1" targetRef="EndEvent_1" />
        <bpmn:endEvent id="EndEvent_1">
            <bpmn:incoming>SequenceFlow_3</bpmn:incoming>
        </bpmn:endEvent>
    </bpmn:process>
</bpmn:definitions>
`;

try {
	// 通过XML启动流程
	const execution = await engine.startFromXml(bpmnXML, {
		applicant: '张三',
		amount: 1000,
	});

	console.log('流程实例ID:', execution.id);

	// 获取用户任务
	const items = execution.getItems();
	const userTask = items.find(item => item.type === 'bpmn:userTask');

	if (userTask) {
		console.log('找到用户任务:', userTask.name);

		// 分配任务
		await engine.assign(
			{
				instanceId: execution.id,
				elementId: userTask.elementId,
			},
			{},
			{
				assignee: '李四',
			},
			'系统'
		);

		// 完成任务
		await engine.invoke(
			{
				instanceId: execution.id,
				elementId: userTask.elementId,
			},
			{
				approved: true,
				comment: '审批通过',
			}
		);

		console.log('任务已完成:', execution.status);
	}

	console.log('流程执行完成');
} catch (error) {
	console.error('执行出错:', error);
}
```

### TypeScript

```typescript
import StandaloneBPMNEngine from 'bpmn-flash';
// 或者
// import { StandaloneBPMNEngine } from 'bpmn-flash';

const engine = new StandaloneBPMNEngine();

const bpmnXML = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
    <bpmn:process id="test-process" isExecutable="true">
        // ... BPMN定义 ...
    </bpmn:process>
</bpmn:definitions>
`;

try {
	const execution = await engine.startFromXml(bpmnXML, {
		applicant: '张三',
		amount: 1000,
	});

	// 类型安全的API调用
	const items = execution.getItems();
	// ...
} catch (error) {
	console.error('执行出错:', error);
}
```

## 支持的BPMN元素

- `bpmn:startEvent` - 开始事件
- `bpmn:endEvent` - 结束事件
- `bpmn:userTask` - 用户任务
- `bpmn:serviceTask` - 服务任务
- `bpmn:scriptTask` - 脚本任务
- `bpmn:exclusiveGateway` - 排他网关

## API

### StandaloneBPMNEngine

#### startFromXml(xml, data)

从BPMN XML定义启动流程实例

#### start(name, data)

从已注册的流程定义启动流程实例

#### invoke(itemQuery, data)

完成指定任务

#### assign(itemQuery, assignment)

分配任务给用户或组

## 开发

### 构建项目

```bash
npm run build
```

### 运行测试

```bash
npm test
```

### 代码检查

```bash
npm run lint
```

### 代码格式化

```bash
npm run format
```

## 许可证

MIT

完善baseCheckBPMNExecution方法，返回错误信息，首先检查bpmn根对像是否有且仅有一个属性，否则返回‘xml definations错误’，并且检查该属性的值对象的tagName值是否是definations，否则返回‘xml definations错误’，检查该值对象的children数组是否有且只有一个元素，否则返回‘xml process错误’，继续检查children里的唯一值对象，查看这个对象的tagName是否是process，如果不是则返回‘xml process错误’，查看这个值对象的children数组，如果是空数组则返回‘未配置流程节点’，检查数组里的所有对象，查看是否有且一个对象的唯一键对应的值对象的tagName是startEvent，不是则返回‘流程开始节点配置错误’，检查其他对象从startEvent开始，查看对应对象唯一值对应的值对象里的children数组，
