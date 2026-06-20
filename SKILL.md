---
name: bpmn-flow
description: "Create, inspect, execute, and manage BPMN 2.0 workflow instances with a local TypeScript workflow engine."
allowed-tools: [exec, read, write, edit, web_search]
user-invocable: false
---

# BPMN Flow Engine

A lightweight BPMN 2.0 workflow engine located at `~/myJob/bpmn-flash/`.

**Architecture:** engine handles token routing only; business logic goes through hooks.

## Quick Reference

```bash
# Build
cd ~/myJob/bpmn-flash && npm run build

# Run tests
cd ~/myJob/bpmn-flash && npm test

# Run benchmark
cd ~/myJob/bpmn-flash && node benchmark.mjs
```

## Engine API (runtime usage)

Import from `~/myJob/bpmn-flash/dist/index.js` (ESM) or `.cjs` (CJS).

**new FlowEngine(options)** — hooks can be passed in constructor:
- `onNodeEnter`, `onNodeLeave`, `onSequenceFlow`, `onProcessStart`, `onProcessEnd`
- `scriptExecutor`: a `{ execute(state, script, cb) }` plugin for script tasks

**engine.on(event, handler)** / **engine.off(event, handler)** — register/unregister hooks. Chainable.
- events: `nodeEnter` | `nodeLeave` | `sequenceFlow` | `processStart` | `processEnd`

**engine.startProcess(bpmnXML, initialData?)** → `Promise<ProcessState>`
- Parses XML, runs one tick, returns state (may have suspended tokens).

**engine.resume(state, tokenId, bpmnXML, data?)** → `Promise<ProcessState>`
- Resumes a suspended token, continues execution.

**engine.terminate(state)** → `ProcessState`
- Kills all tokens, sets status `terminated`.

**engine.getSuspendedTokens(state, bpmnXML)** → `SuspendedTokenInfo[]`
- Lists all suspended tokens with node details.

**engine.use(plugin)** — plugin: `{ name, version, install(engine) }`.

## XML Format

`bpmn:` prefix is optional. Standard BPMN 2.0 elements:

```xml
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">
  <bpmn:process id="p" isExecutable="true">
    <bpmn:startEvent id="s"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="task" />
    <bpmn:userTask id="task" name="审批">
      <bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="f2" sourceRef="task" targetRef="e" />
    <bpmn:endEvent id="e"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>
```

Supported: `startEvent`, `endEvent`, `userTask`, `serviceTask`, `scriptTask`, `task`, `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway`.

**Gateway condition:** `${expr}` inside `<bpmn:conditionExpression>`. Evaluator supports `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, `+`, `-`, `*`, `/`, array `[]` notation. Variables = merged state.variables + token.data.

## Suspend / Resume Pattern

The hook must call `ctx.suspend()` to pause a token at a task node. Without it, tokens pass through immediately.

**NodeHookContext** (in `nodeEnter`/`nodeLeave`):
- `state`, `token`, `node`, `definition`
- `suspend()` — pause the token
- `setTokenData(data)` — merge into token-local data
- `setVariables(vars)` — merge into process-level variables
- `executeScript(script)` — run script (requires `scriptExecutor`)

**FlowHookContext** (in `sequenceFlow`):
- `state`, `token`, `flow`, `sourceNode`, `targetNode`, `definition`

**ProcessHookContext** (in `processStart`/`processEnd`):
- `state`, `definition`

## Default behavior (no hooks)

- `startEvent`/`endEvent`: auto-pass/destroy
- `userTask`/`serviceTask`/`scriptTask`/`task`: **auto-pass** (passes through instantly)
- Gateways: resolved internally

Only `ctx.suspend()` stops a node. Without it, the process completes in one tick.

## Script Executor Plugin

```javascript
const executor = {
  execute(state, script, cb) {
    try {
      const fn = new Function('vars', script);
      cb(null, fn(state.variables));
    } catch(e) { cb(e); }
  },
};
new FlowEngine({ scriptExecutor: executor });
```

Then in a hook: `const result = await ctx.executeScript('return vars.amount * 2');`

## State Helpers

```javascript
import { serialize, deserialize } from 'bpmn-flash';
const json = serialize(state);           // → string
const restored = deserialize(json);      // → ProcessState
```

## Parser

```javascript
import { BPMNParser, BpmnValidator } from 'bpmn-flash';
const def = BPMNParser.parse(xml, validate = true);
BpmnValidator.validate(def); // → { isValid, errors, warnings }
```

## Key exported types

`FlowEngine`, `BPMNParser`, `BpmnValidator`, `HookManager`, `TokenManager`, `GatewayResolver`, `FlowTraverser`, `VariableManager`, `evaluateExpression`, `evaluateExpressionResult`, `serialize`, `deserialize`, `generateId`, `generateLongId`, `ParseError`, `ValidationError`, `ExecutionError`, `ConfigurationError`, `VariableEvaluationError`, `WorkflowError`

## Project Structure

```
~/myJob/bpmn-flash/
├── src/engine/     # FlowEngine, TokenManager, GatewayResolver, FlowTraverser
├── src/parser/     # BPMNParser, BpmnValidator (regex-based, bpmn: prefix optional)
├── src/hooks/      # HookManager, types (NodeHookContext, etc.)
├── src/state/      # ProcessState + serialize/deserialize
├── src/utils/      # ExpressionEvaluator, ParseUtil, ExecuteUtil
├── src/variables/  # VariableManager
├── src/errors/     # WorkflowError hierarchy
├── src/types/      # All type definitions
└── benchmark.mjs   # Performance benchmark
```
