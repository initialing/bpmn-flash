/**
 * BPMN-Flash performance benchmark
 * Run: node benchmark.mjs
 */
import { FlowEngine, BPMNParser, generateId, generateLongId } from './dist/index.js';
import { performance } from 'node:perf_hooks';

// ==================== BPMN XML test definitions ====================

const SIMPLE_FLOW_XML = '<?xml version="1.0" encoding="UTF-8"?>' +
'<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">' +
'<bpmn:process id="simple-process" isExecutable="true">' +
'<bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>' +
'<bpmn:sequenceFlow id="f1" sourceRef="StartEvent_1" targetRef="UserTask_1" />' +
'<bpmn:userTask id="UserTask_1" name="approve"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:userTask>' +
'<bpmn:sequenceFlow id="f2" sourceRef="UserTask_1" targetRef="EndEvent_1" />' +
'<bpmn:endEvent id="EndEvent_1"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>' +
'</bpmn:process></bpmn:definitions>';

const AUTO_FLOW_XML = '<?xml version="1.0" encoding="UTF-8"?>' +
'<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">' +
'<bpmn:process id="auto-process" isExecutable="true">' +
'<bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>' +
'<bpmn:sequenceFlow id="f1" sourceRef="StartEvent_1" targetRef="ServiceTask_1" />' +
'<bpmn:serviceTask id="ServiceTask_1" name="auto"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:serviceTask>' +
'<bpmn:sequenceFlow id="f2" sourceRef="ServiceTask_1" targetRef="EndEvent_1" />' +
'<bpmn:endEvent id="EndEvent_1"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>' +
'</bpmn:process></bpmn:definitions>';

const GW_XML = '<?xml version="1.0" encoding="UTF-8"?>' +
'<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">' +
'<bpmn:process id="gw-process" isExecutable="true">' +
'<bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>' +
'<bpmn:sequenceFlow id="f1" sourceRef="StartEvent_1" targetRef="ExclusiveGateway_1" />' +
'<bpmn:exclusiveGateway id="ExclusiveGateway_1" name="judge" default="f3">' +
'<bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing><bpmn:outgoing>f3</bpmn:outgoing>' +
'</bpmn:exclusiveGateway>' +
'<bpmn:sequenceFlow id="f2" name="pass" sourceRef="ExclusiveGateway_1" targetRef="EndEvent_1">' +
'<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${approved == true}</bpmn:conditionExpression>' +
'</bpmn:sequenceFlow>' +
'<bpmn:sequenceFlow id="f3" name="reject" sourceRef="ExclusiveGateway_1" targetRef="EndEvent_2" />' +
'<bpmn:endEvent id="EndEvent_1" name="pass-end" />' +
'<bpmn:endEvent id="EndEvent_2" name="reject-end" />' +
'</bpmn:process></bpmn:definitions>';

const PARALLEL_XML = '<?xml version="1.0" encoding="UTF-8"?>' +
'<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">' +
'<bpmn:process id="parallel-process" isExecutable="true">' +
'<bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>' +
'<bpmn:sequenceFlow id="f1" sourceRef="StartEvent_1" targetRef="ParallelGateway_1" />' +
'<bpmn:parallelGateway id="ParallelGateway_1" name="fork">' +
'<bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing><bpmn:outgoing>f3</bpmn:outgoing>' +
'</bpmn:parallelGateway>' +
'<bpmn:sequenceFlow id="f2" sourceRef="ParallelGateway_1" targetRef="UserTask_A" />' +
'<bpmn:sequenceFlow id="f3" sourceRef="ParallelGateway_1" targetRef="UserTask_B" />' +
'<bpmn:userTask id="UserTask_A" name="forkA"><bpmn:incoming>f2</bpmn:incoming><bpmn:outgoing>f4</bpmn:outgoing></bpmn:userTask>' +
'<bpmn:userTask id="UserTask_B" name="forkB"><bpmn:incoming>f3</bpmn:incoming><bpmn:outgoing>f5</bpmn:outgoing></bpmn:userTask>' +
'<bpmn:sequenceFlow id="f4" sourceRef="UserTask_A" targetRef="ParallelGateway_2" />' +
'<bpmn:sequenceFlow id="f5" sourceRef="UserTask_B" targetRef="ParallelGateway_2" />' +
'<bpmn:parallelGateway id="ParallelGateway_2" name="join">' +
'<bpmn:incoming>f4</bpmn:incoming><bpmn:incoming>f5</bpmn:incoming><bpmn:outgoing>f6</bpmn:outgoing>' +
'</bpmn:parallelGateway>' +
'<bpmn:sequenceFlow id="f6" sourceRef="ParallelGateway_2" targetRef="EndEvent_1" />' +
'<bpmn:endEvent id="EndEvent_1"><bpmn:incoming>f6</bpmn:incoming></bpmn:endEvent>' +
'</bpmn:process></bpmn:definitions>';

function makeLongFlowXml(n) {
  let s = '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">' +
    '<bpmn:process id="p" isExecutable="true">' +
    '<bpmn:startEvent id="s"><bpmn:outgoing>e0</bpmn:outgoing></bpmn:startEvent>' +
    '<bpmn:sequenceFlow id="e0" sourceRef="s" targetRef="n1" />';
  for (let i = 1; i <= n; i++) {
    s += '<bpmn:serviceTask id="n' + i + '" name="t' + i + '">' +
      '<bpmn:incoming>e' + (i - 1) + '</bpmn:incoming>' +
      '<bpmn:outgoing>e' + i + '</bpmn:outgoing></bpmn:serviceTask>' +
      '<bpmn:sequenceFlow id="e' + i + '" sourceRef="n' + i + '" targetRef="' + (i < n ? 'n' + (i + 1) : 'end') + '" />';
  }
  s += '<bpmn:endEvent id="end"><bpmn:incoming>e' + n + '</bpmn:incoming></bpmn:endEvent>' +
    '</bpmn:process></bpmn:definitions>';
  return s;
}

function fmt(ms) {
  return ms < 1 ? (ms * 1000).toFixed(1) + 'us' : ms.toFixed(2) + 'ms';
}

function fmtN(n) {
  return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

// ==================== Benchmarks ====================

async function benchParse(count) {
  const samples = [SIMPLE_FLOW_XML, GW_XML, PARALLEL_XML, makeLongFlowXml(50)];
  const labels = ['simple', 'x-gateway', 'parallel', 'long(50)'];
  console.log('\n--- 1) Parse throughput (x' + fmtN(count) + ') ---');
  for (let i = 0; i < 4; i++) {
    const xml = samples[i];
    const t0 = performance.now();
    for (let j = 0; j < count; j++) BPMNParser.parse(xml, false);
    const t = performance.now() - t0;
    console.log('  ' + labels[i].padEnd(10) + ' avg ' + fmt(t / count).padEnd(7) + ' -> ' + ((count / t) * 1000).toFixed(0).padStart(6) + '/s');
  }
}

async function benchAuto(count) {
  console.log('\n--- 2) Auto-complete (x' + fmtN(count) + ') ---');
  const e = new FlowEngine();
  const t0 = performance.now();
  const p = [];
  for (let i = 0; i < count; i++) p.push(e.startProcess(AUTO_FLOW_XML));
  const states = await Promise.all(p);
  const t = performance.now() - t0;
  const ok = states.filter(s => s.status === 'completed').length;
  console.log('  OK ' + ok + '/' + count + ' avg ' + fmt(t / count).padEnd(7) + ' -> ' + ((count / t) * 1000).toFixed(0).padStart(6) + '/s  total ' + (t / 1000).toFixed(2) + 's');
}

async function benchSuspendResume(count) {
  console.log('\n--- 3) suspend + resume (x' + fmtN(count) + ') ---');
  const e = new FlowEngine();
  e.on('nodeEnter', ctx => { if (ctx.node.type === 'bpmn:userTask') ctx.suspend(); });

  const t0 = performance.now();
  const p = [];
  for (let i = 0; i < count; i++) p.push(e.startProcess(SIMPLE_FLOW_XML));
  let states = await Promise.all(p);
  console.log('  launch: ' + (performance.now() - t0).toFixed(0) + 'ms');

  // Collect suspended tokens
  const suspended = [];
  for (const s of states) {
    for (const info of e.getSuspendedTokens(s, SIMPLE_FLOW_XML)) {
      suspended.push({ state: s, tokenId: info.tokenId });
    }
  }
  console.log('  suspended: ' + suspended.length);

  const r0 = performance.now();
  const resumeP = suspended.map(x => e.resume(x.state, x.tokenId, SIMPLE_FLOW_XML));
  const finalStates = await Promise.all(resumeP);
  const rt = performance.now() - r0;
  const ok = finalStates.filter(s => s.status === 'completed').length;
  console.log('  resume: ' + rt.toFixed(0) + 'ms  avg ' + fmt(rt / count).padEnd(7) + ' -> ' + ((count / rt) * 1000).toFixed(0).padStart(6) + '/s');
  console.log('  OK ' + ok + '/' + count);
}

async function benchGateway(count) {
  console.log('\n--- 4) Exclusive gateway (x' + fmtN(count) + ') ---');
  const e = new FlowEngine();
  const t0 = performance.now();
  const p = [];
  for (let i = 0; i < count; i++) p.push(e.startProcess(GW_XML, { approved: i % 2 === 0 }));
  const states = await Promise.all(p);
  const t = performance.now() - t0;
  const ok = states.filter(s => s.status === 'completed').length;
  console.log('  OK ' + ok + '/' + count + ' avg ' + fmt(t / count).padEnd(7) + ' -> ' + ((count / t) * 1000).toFixed(0).padStart(6) + '/s');
}

async function benchParallel(count) {
  console.log('\n--- 5) Parallel gateway 2-branch suspend+resume (x' + fmtN(count) + ') ---');
  const e = new FlowEngine();

  // Collect token IDs per instance
  const instTokens = new Map();
  e.on('nodeEnter', ctx => {
    if (ctx.node.type === 'bpmn:userTask') {
      ctx.suspend();
      if (!instTokens.has(ctx.state.id)) instTokens.set(ctx.state.id, []);
      instTokens.get(ctx.state.id).push(ctx.token.id);
    }
  });

  const t0 = performance.now();
  const p = [];
  for (let i = 0; i < count; i++) p.push(e.startProcess(PARALLEL_XML));
  const states = await Promise.all(p);
  const stateMap = new Map(states.map(s => [s.id, s]));
  console.log('  launch: ' + (performance.now() - t0).toFixed(0) + 'ms  tokens: ' + [...instTokens.values()].reduce((a, b) => a + b.length, 0));

  const r0 = performance.now();
  for (const [id, tokenIds] of instTokens) {
    let s = stateMap.get(id);
    // Resume branch A
    s = await e.resume(s, tokenIds[0], PARALLEL_XML);
    stateMap.set(id, s);
    // Get remaining suspended token from updated state
    const rem = e.getSuspendedTokens(s, PARALLEL_XML);
    if (rem.length) {
      s = await e.resume(s, rem[0].tokenId, PARALLEL_XML);
      stateMap.set(id, s);
    }
  }
  const rt = performance.now() - r0;
  const total = (performance.now() - t0);
  const ok = [...stateMap.values()].filter(s => s.status === 'completed').length;
  console.log('  resume: ' + rt.toFixed(0) + 'ms');
  console.log('  OK ' + ok + '/' + count + '  end-to-end: ' + ((count / total) * 1000).toFixed(0).padStart(6) + '/s');
}

async function benchIdGen(count) {
  console.log('\n--- 6) ID generator (x' + fmtN(count) + ') ---');
  let t0 = performance.now();
  for (let i = 0; i < count; i++) generateId();
  let t1 = performance.now() - t0;
  t0 = performance.now();
  for (let i = 0; i < count; i++) generateLongId();
  let t2 = performance.now() - t0;
  console.log('  nanoid()     ' + fmt(t1 / count).padEnd(7) + ' -> ' + ((count / t1) * 1000).toFixed(0).padStart(8) + '/s');
  console.log('  nanoid(21)   ' + fmt(t2 / count).padEnd(7) + ' -> ' + ((count / t2) * 1000).toFixed(0).padStart(8) + '/s');
}

async function benchLongFlow() {
  console.log('\n--- 7) Long flow throughput (auto-complete) ---');
  for (const len of [10, 50, 100, 200]) {
    const xml = makeLongFlowXml(len);
    const e = new FlowEngine();
    const n = len > 100 ? 200 : 500;
    const t0 = performance.now();
    const p = [];
    for (let i = 0; i < n; i++) p.push(e.startProcess(xml));
    const states = await Promise.all(p);
    const t = performance.now() - t0;
    const ok = states.filter(s => s.status === 'completed').length;
    console.log('  ' + String(len).padStart(3) + ' nodes  avg ' + fmt(t / n).padEnd(7) + ' -> ' + ((n / t) * 1000).toFixed(0).padStart(7) + '/s  OK ' + ok + '/' + n);
  }
}

async function benchBulk(count) {
  console.log('\n--- 8) Bulk launch (x' + fmtN(count) + ') ---');
  const e = new FlowEngine();
  const t0 = performance.now();
  const p = [];
  for (let i = 0; i < count; i++) p.push(e.startProcess(AUTO_FLOW_XML));
  const states = await Promise.all(p);
  const t = performance.now() - t0;
  const ok = states.filter(s => s.status === 'completed').length;
  console.log('  total ' + (t / 1000).toFixed(2) + 's  avg ' + fmt(t / count).padEnd(7) + ' -> ' + ((count / t) * 1000).toFixed(0).padStart(8) + '/s  OK ' + ok + '/' + count);
}

async function main() {
  console.log(new Array(45).join('='));
  console.log('  BPMN-Flash Benchmark');
  console.log('  Node ' + process.version + '  ' + process.platform + ' ' + process.arch);
  const os = await import('os');
  console.log('  RAM ' + (os.totalmem() / 1073741824).toFixed(1) + 'GB  CPU ' + os.cpus().length + ' cores');
  console.log(new Array(45).join('='));

  // Warmup
  console.log('\nWarmup (100)...');
  const e = new FlowEngine();
  const w = [];
  for (let i = 0; i < 100; i++) w.push(e.startProcess(AUTO_FLOW_XML));
  await Promise.all(w);
  console.log('Done.\n');

  await benchParse(5000);
  await benchAuto(5000);
  await benchIdGen(50000);
  await benchSuspendResume(500);
  await benchGateway(5000);
  await benchParallel(200);
  await benchLongFlow();
  await benchBulk(10000);

  console.log('\nDone. ' + new Date().toLocaleString('zh-CN'));
}

main().catch(err => { console.error('FAIL:', err); process.exit(1); });
