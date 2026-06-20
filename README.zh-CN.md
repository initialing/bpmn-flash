# BPMN Flash

轻量级、高性能的 BPMN 2.0 工作流引擎，使用 TypeScript 编写。  
同时支持 ESModule 和 CommonJS 两种模块格式，零外部运行时依赖。

> **设计理念：** 引擎只负责令牌流转（Token 沿 SequenceFlow 移动、网关分支/合并、StartEvent→EndEvent）。所有业务逻辑——用户任务、服务调用、脚本执行、持久化——都通过钩子委托给外部应用处理。

---

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [BPMN XML 格式](#bpmn-xml-格式)
  - [BPMN 2.0 命名空间处理](#bpmn-20-命名空间处理)
  - [支持的 BPMN 元素](#支持的-bpmn-元素)
  - [网关条件表达式](#网关条件表达式)
- [架构](#架构)
- [API 参考](#api-参考)
  - [FlowEngine](#flowengine)
  - [钩子 / 事件](#钩子--事件)
  - [脚本执行插件](#脚本执行插件)
  - [插件系统](#插件系统)
  - [ProcessState 流程状态](#processstate-流程状态)
  - [BPMNParser 解析器](#bpmnparser-解析器)
  - [工具函数](#工具函数)
  - [错误类型](#错误类型)
- [挂起与恢复（审批流模式）](#挂起与恢复审批流模式)
- [默认行为](#默认行为)
- [完整示例](#完整示例)
- [性能基准](#性能基准)
- [开发](#开发)
- [许可证](#许可证)

---

## 安装

```bash
npm install bpmn-flash
```

---

## 快速开始

```javascript
import { FlowEngine } from 'bpmn-flash';

const engine = new FlowEngine();

const bpmnXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">
  <bpmn:process id="approval" isExecutable="true">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>f1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="task" />
    <bpmn:userTask id="task" name="审批">
      <bpmn:incoming>f1</bpmn:incoming>
      <bpmn:outgoing>f2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="f2" sourceRef="task" targetRef="end" />
    <bpmn:endEvent id="end">
      <bpmn:incoming>f2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// 注册钩子：遇到用户任务时挂起令牌
engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') {
    ctx.suspend();                                     // ⏸️ 挂起令牌
    console.log('任务被挂起:', ctx.node.name, ctx.token.id);
  }
});

// 启动流程
let state = await engine.startProcess(bpmnXML, { amount: 1000, applicant: '张三' });
console.log('实例:', state.id, '状态:', state.status);

// 查找挂起的令牌
const suspended = engine.getSuspendedTokens(state, bpmnXML);
const [first] = suspended;
console.log('挂起在:', first.nodeName);

// 恢复令牌（模拟审批通过）
state = await engine.resume(state, first.tokenId, bpmnXML, { approved: true, comment: '通过' });
console.log('最终状态:', state.status);  // 'completed'
```

---

## BPMN XML 格式

### BPMN 2.0 命名空间处理

引擎支持标准 BPMN 2.0 命名空间：

```xml
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
```

`bpmn:` 前缀是**可选的**——解析器的正则同时支持带前缀和不带前缀的写法。以下两种写法等价：

```xml
<!-- 带前缀 -->
<bpmn:userTask id="task_1" name="审核" />

<!-- 不带前缀 -->
<userTask id="task_1" name="审核" />
```

### 支持的 BPMN 元素

| BPMN 元素              | 类型字符串                    | 引擎行为                                       |
|------------------------|-------------------------------|-----------------------------------------------|
| `bpmn:startEvent`      | `bpmn:startEvent`             | 自动通过（触发 `nodeEnter`/`nodeLeave` 钩子，然后推进） |
| `bpmn:endEvent`        | `bpmn:endEvent`               | 销毁令牌；所有令牌消失后状态变为 `completed` |
| `bpmn:userTask`        | `bpmn:userTask`               | 由钩子决定——调用 `ctx.suspend()` 暂停，否则自动通过 |
| `bpmn:serviceTask`     | `bpmn:serviceTask`            | 同 userTask，不挂起则自动通过                |
| `bpmn:scriptTask`      | `bpmn:scriptTask`             | 同 userTask；可调用 `ctx.executeScript()`（需注册插件） |
| `bpmn:task`            | `bpmn:task`                   | 通用节点，行为同上                          |
| `bpmn:exclusiveGateway`| `bpmn:exclusiveGateway`       | 评估出线条件，选择第一个满足的分支（或默认分支） |
| `bpmn:parallelGateway` | `bpmn:parallelGateway`        | 分裂：每个出线创建一个令牌。汇聚：等待所有入线令牌到齐 |
| `bpmn:inclusiveGateway`| `bpmn:inclusiveGateway`       | 分裂：走所有条件满足的出线。汇聚：等待所有入线 |
| `bpmn:eventBasedGateway`| `bpmn:eventBasedGateway`      | 直通（当前版本无特殊逻辑）                   |

### 网关条件表达式

条件表达式以 `${expression}` 的形式写在 `bpmn:conditionExpression` 中：

```xml
<bpmn:sequenceFlow id="f2" name="通过" sourceRef="gateway" targetRef="end1">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${amount >= 1000}</bpmn:conditionExpression>
</bpmn:sequenceFlow>
<bpmn:sequenceFlow id="f3" name="拒绝" sourceRef="gateway" targetRef="end2" />
```

表达式求值器支持：
- **比较：** `==`, `!=`, `>`, `<`, `>=`, `<=`
- **算术：** `+`, `-`, `*`, `/`
- **逻辑：** `&&`, `||`, `!`
- **字符串：** `== "hello"`
- **变量：** 同时可访问流程级 `state.variables` 和令牌级 `token.data`（合并后求值）
- **数组：** `${items[index]}` 中括号取值
- **安全：** 自定义安全解析器——不使用 `eval()`、`new Function()`、不访问原型链

如果没有条件匹配且指定了 `default` 分支，则走默认分支。  
如果只有一条出线，则无条件通过。

---

## 架构

```
                      外部应用
                          │
              ┌───────────┼───────────┐
              │           │           │
         onNodeEnter  onNodeLeave  onSequenceFlow
              │           │           │
              ▼           ▼           ▼
┌────────────────────────────────────────────────────────┐
│                      FlowEngine                        │
│                                                        │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Token      │  │ Gateway      │  │ Flow         │   │
│  │ Manager    │  │ Resolver     │  │ Traverser    │   │
│  │            │  │              │  │              │   │
│  │ create()   │  │ 排他网关     │  │ 条件求值     │   │
│  │ move()     │  │ 并行网关     │  │ traverse()   │   │
│  │ suspend()  │  │ 包含网关     │  │              │   │
│  │ resume()   │  │              │  │              │   │
│  │ destroy()  │  └──────────────┘  └──────────────┘   │
│  └────────────┘                                        │
│                                                        │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ BPMN       │  │ State        │  │ Hook         │   │
│  │ Parser     │  │ Manager      │  │ Manager      │   │
│  └────────────┘  └──────────────┘  └──────────────┘   │
└────────────────────────────────────────────────────────┘
```

**核心概念：**

- **Token 令牌（TokenV3）：** 标记当前执行位置的游标，拥有 `status: 'active' | 'suspended'` 状态和 `data` 载荷。一个流程可同时有多个令牌（并行网关）。
- **ProcessState 状态：** 不可变——每次操作都返回新的 `ProcessState` 对象。引擎绝不原地修改状态。
- **Hook 钩子：** 拦截执行的唯一方式。引擎内部没有为节点类型硬编码的执行器。
- **Gateway 网关：** 引擎内部唯一自带逻辑的节点（排他/并行/包含网关的分支与合并逻辑）。

---

## API 参考

### FlowEngine

#### `new FlowEngine(options?)`

| 选项              | 类型                                     | 说明                                |
|-------------------|------------------------------------------|-------------------------------------|
| `onNodeEnter`     | `(ctx: NodeHookContext) => void`         | 等价于 `.on('nodeEnter', fn)`       |
| `onNodeLeave`     | `(ctx: NodeHookContext) => void`         | 等价于 `.on('nodeLeave', fn)`       |
| `onSequenceFlow`  | `(ctx: FlowHookContext) => void`         | 等价于 `.on('sequenceFlow', fn)`    |
| `onProcessStart`  | `(ctx: ProcessHookContext) => void`      | 等价于 `.on('processStart', fn)`    |
| `onProcessEnd`    | `(ctx: ProcessHookContext) => void`      | 等价于 `.on('processEnd', fn)`      |
| `scriptExecutor`  | `ScriptExecutorPlugin`                   | 脚本任务执行插件                    |

```javascript
// 通过构造函数注册
const engine = new FlowEngine({
  onNodeEnter: (ctx) => { /* ... */ },
  scriptExecutor: myExecutor,
});
```

---

#### `engine.on(event, handler)`

注册钩子处理器。同一事件可注册多个处理器。

```javascript
engine.on('nodeEnter', (ctx) => { console.log('进入:', ctx.node.name); });
engine.on('nodeEnter', (ctx) => { /* 第二个处理器 */ });
```

**返回值：** `this`（可链式调用）

---

#### `engine.off(event, handler)`

注销之前注册的处理器。需传入完全相同的函数引用。

```javascript
const handler = (ctx) => console.log(ctx.node.name);
engine.on('nodeEnter', handler);
// ...
engine.off('nodeEnter', handler);
```

**返回值：** `this`（可链式调用）

---

#### `async engine.startProcess(bpmnXML, initialData?)`

从 BPMN XML 字符串启动一个新流程实例。

| 参数          | 类型     | 说明                              |
|---------------|----------|-----------------------------------|
| `bpmnXML`     | `string` | BPMN 2.0 XML 定义                  |
| `initialData` | `object` | 可选，初始流程级变量               |

**返回值：** `Promise<ProcessState>` — 执行一轮后的流程状态（可能包含挂起的令牌）。

```javascript
const state = await engine.startProcess(xml, { applicant: '张三', amount: 5000 });
```

---

#### `async engine.resume(state, tokenId, bpmnXML, data?)`

恢复一个挂起的令牌，继续执行流程。

| 参数      | 类型            | 说明                                          |
|-----------|----------------|-----------------------------------------------|
| `state`   | `ProcessState` | 当前流程状态（来自 `startProcess` 或上次 `resume`） |
| `tokenId` | `string`       | 要恢复的令牌 ID（通过 `getSuspendedTokens` 获取） |
| `bpmnXML` | `string`       | 同一份 BPMN XML（内部重新解析以重建流程定义）    |
| `data`    | `object`       | 可选，要合并到令牌数据中的内容                  |

**返回值：** `Promise<ProcessState>` — 更新后的流程状态。

```javascript
const updatedState = await engine.resume(state, tokenId, xml, { approved: true });
```

**可能抛出：** 如果令牌不存在或不是挂起状态。

---

#### `engine.terminate(state)`

立即终止流程——销毁所有令牌，状态设为 `'terminated'`。

```javascript
state = engine.terminate(state);
```

**返回值：** `ProcessState`

---

#### `engine.getSuspendedTokens(state, bpmnXML)`

查询所有当前挂起的令牌信息。

```javascript
const info = engine.getSuspendedTokens(state, bpmnXML);
// info: Array<{
//   tokenId: string,       // 令牌 ID（用于 resume）
//   nodeId: string,        // 所在节点 ID
//   nodeType: string,      // 节点类型
//   nodeName: string,      // 节点名称
//   nodeProperties: object, // 节点属性
//   tokenData: object,     // 令牌携带的数据
//   suspendedAt: Date,     // 挂起时间
// }>
```

---

#### `engine.use(plugin)`

安装插件（批量注册钩子的快捷方式）。

```javascript
const loggerPlugin = {
  name: 'logger',
  version: '1.0.0',
  install(engine) {
    engine.on('nodeEnter', ctx => console.log('进入:', ctx.node.name));
    engine.on('processEnd', ctx => console.log('完成:', ctx.state.id));
  },
};
engine.use(loggerPlugin);
```

**返回值：** `this`（可链式调用）

---

### 钩子 / 事件

共 5 种钩子事件：

| 事件             | 上下文类型            | 触发时机                        |
|------------------|----------------------|---------------------------------|
| `nodeEnter`      | `NodeHookContext`     | 令牌到达任意节点时              |
| `nodeLeave`      | `NodeHookContext`     | 令牌即将离开节点时              |
| `sequenceFlow`   | `FlowHookContext`     | 令牌沿 SequenceFlow 移动时      |
| `processStart`   | `ProcessHookContext`  | 流程实例创建时（在 startEvent 之前）|
| `processEnd`     | `ProcessHookContext`  | 所有令牌消耗完毕，状态变为 `completed` 时 |

#### NodeHookContext（`nodeEnter` / `nodeLeave`）

```typescript
interface NodeHookContext {
  state: ProcessState;         // 当前流程状态
  token: Token;                // 当前令牌
  node: Element;               // 当前节点
  definition: ProcessDefinition; // 流程定义

  /** 挂起令牌——引擎停止推进此路径 */
  suspend(): void;

  /** 合并数据到令牌本地数据（下游可访问） */
  setTokenData(data: Record<string, any>): void;

  /** 合并数据到流程级变量 */
  setVariables(variables: Record<string, any>): void;

  /** 执行脚本（仅在注册了 ScriptExecutorPlugin 时可用） */
  executeScript(script: string): Promise<Record<string, any>>;
}
```

#### FlowHookContext（`sequenceFlow`）

```typescript
interface FlowHookContext {
  state: ProcessState;
  token: Token;
  flow: SequenceFlow;         // 当前连线
  sourceNode: Element;        // 源节点
  targetNode: Element;        // 目标节点
  definition: ProcessDefinition;
}
```

#### ProcessHookContext（`processStart` / `processEnd`）

```typescript
interface ProcessHookContext {
  state: ProcessState;
  definition: ProcessDefinition;
}
```

> **重要：** 在网关节点（`exclusiveGateway`、`parallelGateway`、`inclusiveGateway`）上，`nodeEnter` 中的 `suspend()` 和 `setTokenData()` **不生效**——引擎始终内部处理网关逻辑。在 `startEvent`/`endEvent` 上，`suspend()` 被忽略。

---

### 脚本执行插件

对于 `bpmn:scriptTask` 节点，可注册脚本执行插件来运行自定义脚本：

```javascript
import { FlowEngine } from 'bpmn-flash';

const sandboxExecutor = {
  execute(state, script, cb) {
    try {
      // 注意：生产环境应使用沙箱隔离
      const fn = new Function('data', 'vars', script);
      const result = fn(state.variables, state.variables);
      cb(null, result);
    } catch (err) {
      cb(err);
    }
  },
};

const engine = new FlowEngine({ scriptExecutor: sandboxExecutor });

engine.on('nodeEnter', async (ctx) => {
  if (ctx.node.type === 'bpmn:scriptTask') {
    const script = ctx.node.properties?.script || '';
    const result = await ctx.executeScript(script);
    ctx.setTokenData(result);
    // ctx.suspend() 可选——不挂起则自动通过
  }
});
```

---

### 插件系统

插件是可复用的钩子批量注册包：

```javascript
const auditPlugin = {
  name: 'audit',
  version: '1.0.0',
  install(engine) {
    engine.on('nodeEnter', ctx => {
      ctx.state.trace.push({ /* 自定义审计条目 */ });
    });
    engine.on('processEnd', ctx => {
      console.log(`[审计] 流程 ${ctx.state.id} 结束`);
    });
  },
};

engine.use(auditPlugin);
// 可链式调用：engine.use(a).use(b);
```

---

### ProcessState 流程状态

`ProcessState` 对象是流程实例的权威快照。它是**不可变的**——每次操作都返回新副本。

```typescript
interface ProcessState {
  id: string;                               // 实例唯一 ID
  name: string;                             // 流程名称（来自 XML）
  status: 'running' | 'completed' | 'terminated';
  definitionId: string;                     // BPMN process id
  variables: Record<string, unknown>;       // 流程级共享变量
  tokens: TokenV3[];                        // 所有令牌（活跃 + 挂起）
  trace: TraceEntry[];                      // 执行轨迹
  _gatewayWait: Record<string, string[]>;   // 内部：并行网关汇聚状态
  createdAt: Date;
  startedAt: Date;
  endedAt?: Date;
}
```

**序列化 / 反序列化：**

```javascript
import { serialize, deserialize } from 'bpmn-flash';

const json = serialize(state);          // → JSON 字符串
const restored = deserialize(json);     // → ProcessState（Date 字段自动恢复）
```

---

### BPMNParser 解析器

```javascript
import { BPMNParser } from 'bpmn-flash';

// 将 XML 解析为 ProcessDefinition
// 第二个参数 validate 控制是否验证，默认 true
const definition = BPMNParser.parse(xml, validate = true);
// definition.elements: Map<string, Element>
// definition.sequenceFlows: Map<string, SequenceFlow>
```

---

### 工具函数

**条件表达式求值：**

```javascript
import { evaluateExpression, evaluateExpressionResult } from 'bpmn-flash';

// 直接求值
const result = evaluateExpression('${amount >= 1000}', { data: { amount: 5000 } });

// 结构化求值
const { success, value, error } = evaluateExpressionResult('${x + y}', { data: { x: 1, y: 2 } });
```

**变量管理器：**

```javascript
import { VariableManager } from 'bpmn-flash';

const vm = new VariableManager(variableDefinitions, initialValues);
vm.get('amount');       // → 获取值
vm.set('amount', 2000); // → 设置值
vm.validate();          // → ValidationResult
```

**ID 生成器（基于 nanoid）：**

```javascript
import { generateId, generateLongId } from 'bpmn-flash';

generateId();       // → "V1StGXR8_Z5jdHi6B-myT"  (约 55,000/s)
generateLongId();   // → 更长 ID（nanoid 21 字符）
```

**验证辅助：**

```javascript
import { BpmnValidator } from 'bpmn-flash';

const definition = BPMNParser.parse(xml);
const result = BpmnValidator.validate(definition);
// result: { isValid, errors: [{elementId, message, code}], warnings }
```

---

### 错误类型

所有错误类继承自 `WorkflowError`：

| 类                      | 错误码                   | 说明               |
|-------------------------|--------------------------|--------------------|
| `ParseError`            | `PARSE_ERROR`            | XML 解析失败        |
| `ValidationError`       | `VALIDATION_ERROR`       | BPMN 校验失败       |
| `ExecutionError`        | `EXECUTION_ERROR`        | 运行期执行错误      |
| `ConfigurationError`    | `CONFIGURATION_ERROR`    | 引擎配置错误        |
| `VariableEvaluationError` | `VARIABLE_EVALUATION_ERROR` | 表达式求值失败   |

```javascript
import { ParseError, ValidationError, ExecutionError, WorkflowError } from 'bpmn-flash';

try {
  const state = await engine.startProcess(xml);
} catch (err) {
  if (err instanceof WorkflowError) {
    console.error(err.code, err.message, err.details);
  }
}
```

---

## 挂起与恢复（审批流模式）

挂起/恢复机制是实现人工审批流程的核心模式：

```
           suspend()              resume(tx, data)
StartEvent ──→ UserTask ──(⏸️)──→ UserTask ──→ EndEvent
              令牌卡住             令牌释放
```

```javascript
const engine = new FlowEngine();

// 1. 注册钩子，让用户任务挂起
engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') {
    ctx.suspend();
    ctx.setTokenData({ assignedTo: '管理员' });
  }
});

// 2. 启动流程
let state = await engine.startProcess(xml);
// 状态：1 个挂起令牌在 UserTask

// 3. 后续恢复
const tokens = engine.getSuspendedTokens(state, xml);
state = await engine.resume(state, tokens[0].tokenId, xml, {
  approved: true,
  comment: '经理审批通过',
});
// 令牌恢复 → 推进到 EndEvent → 流程完成
```

---

## 默认行为

如果**不注册任何钩子**，引擎的行为如下：

| 节点类型             | 默认行为                                      |
|----------------------|-----------------------------------------------|
| `startEvent`         | 自动通过（触发钩子后推进）                    |
| `endEvent`           | 销毁令牌；无令牌时流程完成                    |
| `userTask`           | **自动通过**——令牌立即流过                    |
| `serviceTask`        | **自动通过**——同 userTask                     |
| `scriptTask`         | **自动通过**——除非使用 `executeScript()`       |
| `exclusiveGateway`   | 评估条件；选择第一个匹配或默认分支            |
| `parallelGateway`    | 分裂：分叉。汇聚：等待所有入线                |
| `inclusiveGateway`   | 分裂：走匹配分支。汇聚：等待所有入线          |
| `eventBasedGateway`  | 直通（无特殊逻辑）                            |

> **要让 `userTask` 或 `serviceTask` 真正等待人工操作，必须在 `nodeEnter` 钩子中调用 `ctx.suspend()`。** 否则令牌直接通过，流程瞬间完成。

---

## 完整示例

### 纯自动完成流程

```javascript
const engine = new FlowEngine();
const state = await engine.startProcess(`
  <?xml version="1.0"?>
  <bpmn:definitions xmlns:bpmn="..." id="d">
    <bpmn:process id="p" isExecutable="true">
      <bpmn:startEvent id="s"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="svc" />
      <bpmn:serviceTask id="svc" name="自动处理">
        <bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing>
      </bpmn:serviceTask>
      <bpmn:sequenceFlow id="f2" sourceRef="svc" targetRef="e" />
      <bpmn:endEvent id="e"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    </bpmn:process>
  </bpmn:definitions>
`);
console.log(state.status); // 'completed'
```

### 排他网关

```javascript
const engine = new FlowEngine();

engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
});

let state = await engine.startProcess(gatewayXML, { approved: true });
const tokens = engine.getSuspendedTokens(state, gatewayXML);
state = await engine.resume(state, tokens[0].tokenId, gatewayXML);
// approved == true → 走"通过"分支 → 通过结束
// approved == false/undefined → 走默认分支 → 拒绝结束
```

### 并行网关

```javascript
const engine = new FlowEngine();
engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
});

let state = await engine.startProcess(parallelXML);
// 两个令牌分别挂起在 UserTask_A 和 UserTask_B

// 分别恢复（顺序无关）
const t1 = engine.getSuspendedTokens(state, parallelXML);
state = await engine.resume(state, t1[0].tokenId, parallelXML);
// 分支 A 推进到汇聚网关，等待 B

const t2 = engine.getSuspendedTokens(state, parallelXML);
state = await engine.resume(state, t2[0].tokenId, parallelXML);
// 汇聚条件满足 → 流程完成
```

### 构造函数注册钩子

```javascript
const engine = new FlowEngine({
  onNodeEnter: (ctx) => {
    if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
  },
  onProcessEnd: (ctx) => {
    console.log(`流程 ${ctx.state.id} 执行完毕`);
  },
});
```

### 记录所有连线流转

```javascript
engine.on('sequenceFlow', (ctx) => {
  console.log(`Token ${ctx.token.id}: ${ctx.sourceNode.name} → ${ctx.targetNode.name} 经过 ${ctx.flow.id}`);
});
```

---

## 性能基准

测试于树莓派 4（4核 ARM64，3.7GB RAM）：

| 场景                                   | 吞吐量       |
|----------------------------------------|--------------|
| XML 解析（简单流程）                   | ~12,000/s    |
| 自动完成流程                           | ~3,100/s     |
| 挂起 + 恢复（审批模式）                | ~6,200/s     |
| 排他网关                               | ~3,100/s     |
| 并行网关（2 分支 fork/join）           | ~750/s       |
| 批量启动 10,000 实例                   | ~4,000/s     |
| ID 生成（nanoid）                      | ~55,000/s    |

在 x86 服务器上，预计吞吐量为树莓派的 2-5 倍。

---

## 开发

```bash
# 构建
npm run build

# 测试（283+ 个测试用例）
npm test

# 测试 + 覆盖率
npm run test:coverage

# 代码检查
npm run lint

# 代码格式化
npm run format
```

---

## 许可证

MIT
