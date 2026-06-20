# BPMN Flash

A lightweight, fast BPMN 2.0 workflow engine written in TypeScript.  
ESModule + CommonJS dual format, zero external runtime dependencies.

> **Design philosophy:** The engine only handles token routing (tokens flow along SequenceFlows, gateways fork/join, StartEvent→EndEvent). All business logic — user tasks, service calls, script execution, persistence — is delegated to external applications via hooks.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [BPMN XML Format](#bpmn-xml-format)
  - [BPMN 2.0 Namespace](#bpmn-20-namespace)
  - [Supported Elements](#supported-elements)
  - [Gateway Condition Expressions](#gateway-condition-expressions)
- [Architecture](#architecture)
- [API Reference](#api-reference)
  - [FlowEngine](#flowengine)
  - [Hooks / Events](#hooks--events)
  - [Script Plugin](#script-executor-plugin)
  - [Plugin System](#plugin-system)
  - [ProcessState](#processstate)
  - [BPMNParser](#bpmnparser)
  - [Utilities](#utilities)
  - [Errors](#errors)
- [Suspend & Resume (Approval Flow Pattern)](#suspend--resume-approval-flow-pattern)
- [Default Behavior](#default-behavior)
- [Examples](#examples)
- [Benchmarks](#benchmarks)
- [Development](#development)
- [License](#license)

---

## Installation

```bash
npm install bpmn-flash
```

---

## Quick Start

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
    <bpmn:userTask id="task" name="Approve">
      <bpmn:incoming>f1</bpmn:incoming>
      <bpmn:outgoing>f2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="f2" sourceRef="task" targetRef="end" />
    <bpmn:endEvent id="end">
      <bpmn:incoming>f2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// Register a hook to suspend on user tasks
engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') {
    ctx.suspend();                                     // ⏸️ suspend token
    console.log('Task suspended:', ctx.node.name, ctx.token.id);
  }
});

// Start the process
let state = await engine.startProcess(bpmnXML, { amount: 1000, applicant: 'Alice' });
console.log('Instance:', state.id, 'Status:', state.status);

// Find the suspended token
const suspended = engine.getSuspendedTokens(state, bpmnXML);
const [first] = suspended;
console.log('Suspended at:', first.nodeName);

// Resume it (simulating approval)
state = await engine.resume(state, first.tokenId, bpmnXML, { approved: true, comment: 'Looks good' });
console.log('Final status:', state.status);  // 'completed'
```

---

## BPMN XML Format

### BPMN 2.0 Namespace

BPMN Flash supports the standard BPMN 2.0 namespace:

```xml
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
```

The `bpmn:` prefix is **optional** — the parser regex handles both with and without the prefix.  
These are equivalent:

```xml
<!-- With prefix -->
<bpmn:userTask id="task_1" name="Review" />

<!-- Without prefix -->
<userTask id="task_1" name="Review" />
```

### Supported Elements

| BPMN Element           | Type String                    | Engine Behavior                           |
|------------------------|--------------------------------|-------------------------------------------|
| `bpmn:startEvent`      | `bpmn:startEvent`              | Auto-pass through (triggers `nodeEnter`/`nodeLeave` hooks, then traverses) |
| `bpmn:endEvent`        | `bpmn:endEvent`                | Destroys the token; when all tokens gone, status → `completed` |
| `bpmn:userTask`        | `bpmn:userTask`                | Hooks decide — call `ctx.suspend()` to pause, or let it auto-pass |
| `bpmn:serviceTask`     | `bpmn:serviceTask`             | Same as userTask; auto-passes if no suspend |
| `bpmn:scriptTask`      | `bpmn:scriptTask`              | Same; can call `ctx.executeScript()` if a ScriptExecutorPlugin is registered |
| `bpmn:task`            | `bpmn:task`                    | Same generic behavior |
| `bpmn:exclusiveGateway`| `bpmn:exclusiveGateway`        | Evaluates conditions on outgoing flows, picks the first match (or default) |
| `bpmn:parallelGateway` | `bpmn:parallelGateway`         | Fork: creates one token per outgoing flow. Join: waits for all incoming tokens, then creates one outgoing token |
| `bpmn:inclusiveGateway`| `bpmn:inclusiveGateway`        | Fork: takes all outgoing flows whose conditions match. Join: waits for all incoming tokens |
| `bpmn:eventBasedGateway`| `bpmn:eventBasedGateway`       | Currently passes through (passthrough, no special logic) |

### Gateway Condition Expressions

Conditions are written as `${expression}` in `bpmn:conditionExpression`:

```xml
<bpmn:sequenceFlow id="f2" name="Approve" sourceRef="gateway" targetRef="end1">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${amount >= 1000}</bpmn:conditionExpression>
</bpmn:sequenceFlow>
<bpmn:sequenceFlow id="f3" name="Reject" sourceRef="gateway" targetRef="end2" />
```

The expression evaluator supports:
- **Comparison:** `==`, `!=`, `>`, `<`, `>=`, `<=`
- **Arithmetic:** `+`, `-`, `*`, `/`
- **Logic:** `&&`, `||`, `!`
- **String values:** `== "hello"`
- **Variables:** refer to both process-level `state.variables` and token-level `token.data` (merged)
- **Arrays:** `${items[index]}` bracket notation
- **Security:** the evaluator is a custom safe parser — no `eval()`, `new Function()`, or prototype access

If no condition matches and a `default` flow is specified, the default flow is used.  
If there's only one outgoing flow, it's taken unconditionally.

---

## Architecture

```
                     External Application
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         onNodeEnter   onNodeLeave   onSequenceFlow
              │             │             │
              ▼             ▼             ▼
┌──────────────────────────────────────────────────────────┐
│                      FlowEngine                          │
│                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │ Token      │  │ Gateway      │  │ Flow           │   │
│  │ Manager    │  │ Resolver     │  │ Traverser      │   │
│  │            │  │              │  │                │   │
│  │ create()   │  │ Exclusive    │  │ evaluateCond() │   │
│  │ move()     │  │ Parallel     │  │ traverse()     │   │
│  │ suspend()  │  │ Inclusive    │  │                │   │
│  │ resume()   │  │              │  │                │   │
│  │ destroy()  │  └──────────────┘  └────────────────┘   │
│  └────────────┘                                          │
│                                                          │
│  ┌────────────┐  ┌────────────────┐  ┌──────────────┐   │
│  │ BPMN       │  │ State          │  │ Hook         │   │
│  │ Parser     │  │ Manager        │  │ Manager      │   │
│  └────────────┘  └────────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Key concepts:**

- **Token (TokenV3):** a marker that sits on a node, with `status: 'active' | 'suspended'` and `data` payload. One process can have multiple tokens (parallel gateway).
- **ProcessState:** immutable — every operation returns a new `ProcessState` object. The engine never mutates state in place.
- **Hook:** the only way to intercept execution. No hardcoded executors for node types.
- **Gateway:** the only nodes with built-in logic inside the engine (exclusive/parallel/inclusive resolution).

---

## API Reference

### FlowEngine

#### `new FlowEngine(options?)`

| Option            | Type                                 | Description                          |
|-------------------|--------------------------------------|--------------------------------------|
| `onNodeEnter`     | `(ctx: NodeHookContext) => void`     | Shorthand for `.on('nodeEnter', fn)` |
| `onNodeLeave`     | `(ctx: NodeHookContext) => void`     | Shorthand for `.on('nodeLeave', fn)` |
| `onSequenceFlow`  | `(ctx: FlowHookContext) => void`     | Shorthand for `.on('sequenceFlow', fn)` |
| `onProcessStart`  | `(ctx: ProcessHookContext) => void`  | Shorthand for `.on('processStart', fn)` |
| `onProcessEnd`    | `(ctx: ProcessHookContext) => void`  | Shorthand for `.on('processEnd', fn)` |
| `scriptExecutor`  | `ScriptExecutorPlugin`              | Plugin for executing script tasks    |

```javascript
// Via constructor
const engine = new FlowEngine({
  onNodeEnter: (ctx) => { /* ... */ },
  scriptExecutor: myExecutor,
});
```

---

#### `engine.on(event, handler)`

Register a hook handler. Multiple handlers can be registered on the same event.

```javascript
engine.on('nodeEnter', (ctx) => { console.log('enter:', ctx.node.name); });
engine.on('nodeEnter', (ctx) => { /* second handler */ });
```

**Returns:** `this` (chainable)

---

#### `engine.off(event, handler)`

Unregister a previously registered handler. Must be the exact same function reference.

```javascript
const handler = (ctx) => console.log(ctx.node.name);
engine.on('nodeEnter', handler);
// ...
engine.off('nodeEnter', handler);
```

**Returns:** `this` (chainable)

---

#### `async engine.startProcess(bpmnXML, initialData?)`

Start a new process instance from an XML string.

| Param        | Type     | Description                                          |
|--------------|----------|------------------------------------------------------|
| `bpmnXML`    | `string` | BPMN 2.0 XML definition                               |
| `initialData`| `object` | Optional. Initial process-level variables.            |

**Returns:** `Promise<ProcessState>` — the process state after the first tick of execution (may have suspended tokens).

```javascript
const state = await engine.startProcess(xml, { applicant: 'Alice', amount: 5000 });
```

---

#### `async engine.resume(state, tokenId, bpmnXML, data?)`

Resume a suspended token, continue execution.

| Param     | Type     | Description                                    |
|-----------|----------|------------------------------------------------|
| `state`   | `ProcessState` | Current process state (from `startProcess` or previous `resume`) |
| `tokenId` | `string` | Token ID to resume (get from `getSuspendedTokens`) |
| `bpmnXML` | `string` | Same BPMN XML (re-parsed to rebuild definition) |
| `data`    | `object` | Optional. Data to merge into the token.        |

**Returns:** `Promise<ProcessState>` — the updated process state.

```javascript
const updatedState = await engine.resume(state, tokenId, xml, { approved: true });
```

**Throws:** If the token is not found or not suspended.

---

#### `engine.terminate(state)`

Terminate a process immediately — destroys all tokens, sets status to `'terminated'`.

```javascript
state = engine.terminate(state);
```

**Returns:** `ProcessState`

---

#### `engine.getSuspendedTokens(state, bpmnXML)`

Get information on all currently suspended tokens.

```javascript
const info = engine.getSuspendedTokens(state, bpmnXML);
// info: Array<{
//   tokenId: string,
//   nodeId: string,
//   nodeType: string,
//   nodeName: string,
//   nodeProperties: object,
//   tokenData: object,
//   suspendedAt: Date,
// }>
```

---

#### `engine.use(plugin)`

Install a plugin (batch hook registration). A plugin is an object with `name`, `version`, and `install(engine)`.

```javascript
const loggerPlugin = {
  name: 'logger',
  version: '1.0.0',
  install(engine) {
    engine.on('nodeEnter', ctx => console.log('Enter:', ctx.node.name));
    engine.on('processEnd', ctx => console.log('Done:', ctx.state.id));
  },
};
engine.use(loggerPlugin);
```

**Returns:** `this` (chainable)

---

### Hooks / Events

Five hook events are supported:

| Event             | Context Type          | Trigger                                    |
|-------------------|-----------------------|--------------------------------------------|
| `nodeEnter`       | `NodeHookContext`      | Token arrives at any node                  |
| `nodeLeave`       | `NodeHookContext`      | Token is about to leave a node             |
| `sequenceFlow`    | `FlowHookContext`      | Token traverses a SequenceFlow line        |
| `processStart`    | `ProcessHookContext`   | Process instance created (before startEvent) |
| `processEnd`      | `ProcessHookContext`   | All tokens consumed, status → `completed`  |

#### NodeHookContext (for `nodeEnter` / `nodeLeave`)

```typescript
interface NodeHookContext {
  state: ProcessState;
  token: Token;
  node: Element;
  definition: ProcessDefinition;

  /** Suspend the token — engine stops advancing this path. */
  suspend(): void;

  /** Merge data into the token's local data (available to downstream). */
  setTokenData(data: Record<string, any>): void;

  /** Merge data into process-level variables. */
  setVariables(variables: Record<string, any>): void;

  /** Execute a script (only works if a ScriptExecutorPlugin is registered). */
  executeScript(script: string): Promise<Record<string, any>>;
}
```

#### FlowHookContext (for `sequenceFlow`)

```typescript
interface FlowHookContext {
  state: ProcessState;
  token: Token;
  flow: SequenceFlow;
  sourceNode: Element;
  targetNode: Element;
  definition: ProcessDefinition;
}
```

#### ProcessHookContext (for `processStart` / `processEnd`)

```typescript
interface ProcessHookContext {
  state: ProcessState;
  definition: ProcessDefinition;
}
```

> **Important:** On gateway nodes (`exclusiveGateway`, `parallelGateway`, `inclusiveGateway`), `suspend()` and `setTokenData()` in `nodeEnter` have **no effect** — the engine always processes gateways internally. On `startEvent`/`endEvent` nodes, `suspend()` is ignored.

---

### Script Executor Plugin

For `bpmn:scriptTask` nodes, you can register a script executor plugin to run custom scripts.

```javascript
import { FlowEngine } from 'bpmn-flash';

const sandboxExecutor = {
  execute(state, script, cb) {
    try {
      // DANGER: real use should sandbox this
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
    // ctx.suspend() is optional — the token auto-passes if not suspended
  }
});
```

---

### Plugin System

A plugin is a reusable package that registers hooks in bulk:

```javascript
const auditPlugin = {
  name: 'audit',
  version: '1.0.0',
  install(engine) {
    engine.on('nodeEnter', ctx => {
      ctx.state.trace.push({ /* custom audit entry */ });
    });
    engine.on('processEnd', ctx => {
      console.log(`[AUDIT] Process ${ctx.state.id} ended`);
    });
  },
};

engine.use(auditPlugin);
// Can chain: engine.use(a).use(b);
```

---

### ProcessState

The `ProcessState` object is the authoritative snapshot of a running process instance. It is **immutable** — every operation returns a new copy.

```typescript
interface ProcessState {
  id: string;                               // Unique instance ID
  name: string;                             // Process name (from XML)
  status: 'running' | 'completed' | 'terminated';
  definitionId: string;                     // BPMN process id
  variables: Record<string, unknown>;       // Process-level shared variables
  tokens: TokenV3[];                        // All tokens (active + suspended)
  trace: TraceEntry[];                      // Execution history
  _gatewayWait: Record<string, string[]>;   // Internal: parallel gateway join state
  createdAt: Date;
  startedAt: Date;
  endedAt?: Date;
}
```

**Serialization helpers:**

```javascript
import { serialize, deserialize } from 'bpmn-flash';

const json = serialize(state);          // → JSON string
const restored = deserialize(json);     // → ProcessState (Date fields restored)
```

---

### BPMNParser

```javascript
import { BPMNParser } from 'bpmn-flash';

// Parse XML into ProcessDefinition (Map<string, Element> + Map<string, SequenceFlow>)
const definition = BPMNParser.parse(xml, validate = true);
```

---

### Utilities

```javascript
import { evaluateExpression, evaluateExpressionResult } from 'bpmn-flash';

// Evaluate a condition expression
const result = evaluateExpression('${amount >= 1000}', { data: { amount: 5000 } });

// Evaluate with structured result
const { success, value, error } = evaluateExpressionResult('${x + y}', { data: { x: 1, y: 2 } });
```

```javascript
import { VariableManager } from 'bpmn-flash';

const vm = new VariableManager(variableDefinitions, initialValues);
vm.get('amount');        // → value
vm.set('amount', 2000);
vm.validate();           // → ValidationResult
```

```javascript
import { generateId, generateLongId } from 'bpmn-flash';

generateId();       // → "V1StGXR8_Z5jdHi6B-myT"  (nanoid, ~55k/s)
generateLongId();   // → longer ID (nanoid 21 chars)
```

**Validation helpers:**

```javascript
import { BpmnValidator } from 'bpmn-flash';

const definition = BPMNParser.parse(xml);
const result = BpmnValidator.validate(definition);
// { isValid: boolean, errors: Array<{elementId, message, code}>, warnings: [...] }
```

---

### Errors

Custom error classes, all extending `WorkflowError`:

| Class                  | Code                     | Description                    |
|------------------------|--------------------------|--------------------------------|
| `ParseError`           | `PARSE_ERROR`            | XML parsing failure            |
| `ValidationError`      | `VALIDATION_ERROR`       | BPMN validation failure        |
| `ExecutionError`       | `EXECUTION_ERROR`        | Runtime execution failure      |
| `ConfigurationError`   | `CONFIGURATION_ERROR`    | Engine configuration error     |
| `VariableEvaluationError` | `VARIABLE_EVALUATION_ERROR` | Expression evaluation failure |

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

## Suspend & Resume (Approval Flow Pattern)

The suspend/resume mechanism is the core pattern for human-in-the-loop workflows.

```
           suspend()              resume(tx, data)
StartEvent ──→ UserTask ──(⏸️)──→ UserTask ──→ EndEvent
              token stuck         token freed
```

```javascript
const engine = new FlowEngine();

// 1. Register hook to suspend on user tasks
engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') {
    ctx.suspend();
    // Optionally set data
    ctx.setTokenData({ assignedTo: 'admin' });
  }
});

// 2. Start process
let state = await engine.startProcess(xml);
// State has 1 suspended token at UserTask

// 3. Later, find and resume
const tokens = engine.getSuspendedTokens(state, xml);
const token = tokens[0];
state = await engine.resume(state, token.tokenId, xml, {
  approved: true,
  comment: 'Approved by manager',
});
// Token resumes, advances to EndEvent, process completes
```

---

## Default Behavior

If you **don't register** any hooks, the engine behaves as follows:

| Node Type        | Default Behavior                                    |
|------------------|-----------------------------------------------------|
| `startEvent`     | Auto-pass (triggers hooks, then traverses)          |
| `endEvent`       | Destroy token; process completes when no tokens left|
| `userTask`       | **Auto-pass** — token flows through immediately     |
| `serviceTask`    | **Auto-pass** — same as userTask                    |
| `scriptTask`     | **Auto-pass** — unless `executeScript()` is used    |
| `exclusiveGateway` | Evaluate conditions; pick first match or default |
| `parallelGateway`  | Fork: split. Join: wait for all incoming.           |
| `inclusiveGateway` | Fork: take matched branches. Join: wait for all.    |
| `eventBasedGateway` | Passthrough (no special logic)                     |

> **To make a `userTask` or `serviceTask` actually wait for human action, you must call `ctx.suspend()` in the `nodeEnter` hook.** Without it, the token passes through and the process completes immediately.

---

## Examples

### Simple Auto-Complete Flow

```javascript
const engine = new FlowEngine();
const state = await engine.startProcess(`
  <?xml version="1.0"?>
  <bpmn:definitions xmlns:bpmn="..." id="d">
    <bpmn:process id="p" isExecutable="true">
      <bpmn:startEvent id="s"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="svc" />
      <bpmn:serviceTask id="svc" name="Auto">
        <bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing>
      </bpmn:serviceTask>
      <bpmn:sequenceFlow id="f2" sourceRef="svc" targetRef="e" />
      <bpmn:endEvent id="e"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    </bpmn:process>
  </bpmn:definitions>
`);
console.log(state.status); // 'completed'
```

### Exclusive Gateway

```javascript
const engine = new FlowEngine();

engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
});

let state = await engine.startProcess(gatewayXML, { approved: true });
const tokens = engine.getSuspendedTokens(state, gatewayXML);
state = await engine.resume(state, tokens[0].tokenId, gatewayXML);
// If approved == true, goes to approve-end
// If approved == false or undefined, goes to reject-end
```

### Parallel Gateway

```javascript
const engine = new FlowEngine();
engine.on('nodeEnter', (ctx) => {
  if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
});

let state = await engine.startProcess(parallelXML);
// Two tokens suspended: one at UserTask_A, one at UserTask_B

// Resume both (order doesn't matter)
const t1 = engine.getSuspendedTokens(state, parallelXML);
state = await engine.resume(state, t1[0].tokenId, parallelXML);
// Token A moves to join gateway, waits for B

const t2 = engine.getSuspendedTokens(state, parallelXML);
state = await engine.resume(state, t2[0].tokenId, parallelXML);
// Join satisfied → process completes
```

### Using Constructor Hooks

```javascript
const engine = new FlowEngine({
  onNodeEnter: (ctx) => {
    if (ctx.node.type === 'bpmn:userTask') ctx.suspend();
  },
  onProcessEnd: (ctx) => {
    console.log(`Process ${ctx.state.id} completed`);
  },
});
```

### Logging All SequenceFlows

```javascript
engine.on('sequenceFlow', (ctx) => {
  console.log(`Token ${ctx.token.id}: ${ctx.sourceNode.name} → ${ctx.targetNode.name} via ${ctx.flow.id}`);
});
```

---

## Benchmarks

Tested on Raspberry Pi 4 (4-core ARM64, 3.7GB RAM):

| Scenario                              | Throughput  |
|---------------------------------------|-------------|
| XML parsing (simple)                  | ~12,000/s   |
| Auto-complete flow                    | ~3,100/s    |
| Suspend + resume (approval pattern)   | ~6,200/s    |
| Exclusive gateway                     | ~3,100/s    |
| Parallel gateway (2-branch fork/join) | ~750/s      |
| Bulk launch 10k instances             | ~4,000/s    |
| ID generation (nanoid)                | ~55,000/s   |

On x86 server hardware, expect 2-5x higher throughput.

---

## Development

```bash
# Build
npm run build

# Test (all 283+ tests)
npm test

# Test with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format
```

---

## License

MIT
