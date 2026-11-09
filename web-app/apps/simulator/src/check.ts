/**
 * Live check of a running simulator, run with `pnpm sim:check` (plan step 5, extended in step 15).
 * Listens to the broker like the backend does and verifies what actually arrives. Exits with
 * code 1 if any check fails.
 *
 * - `pnpm sim:check`: 12 s. Every sensor topic, every payload against machine.json, source "sim",
 *   the publishing intervals, the retained machine state, and the format of any batch message.
 * - `pnpm sim:check --cycle`: waits for the next batch to start and listens to it from start to
 *   finish (up to about 13 minutes), then checks the steps and that the masses balance across
 *   the scales, using only the published values (cycle.ts). No login needed: MQTT only.
 */
import {
  decodeBatchMessage,
  decodeReading,
  machineStateSchema,
  parseJson,
  parseTopic,
  sensorsByTopic,
  subscriptions,
} from '@mixline/shared';
import { loadMachineFile } from '@mixline/shared/node';
import { connect } from 'mqtt';

import { loadConfig } from './config.js';
import { type CheckResult, checkCycle, type Heard } from './cycle.js';
import { ANALOG_MS, FAST_MS, HEARTBEAT_MS } from './schedule.js';
import { loadSimConfig } from './simConfig.js';

const LISTEN_MS = 12_000;
/**
 * A batch takes about 3.75 (4 containers) to 6 minutes (10 containers, owner step 17), plus the
 * pause and the service: this waits for the next one to start, then hears it all.
 */
const CYCLE_LISTEN_MS = 14 * 60_000;
/** Allowed lateness for a message, on top of its period (timers and network). */
const SLACK_MS = 1_000;

const cycle = process.argv.includes('--cycle');
const config = loadConfig();
const machine = loadMachineFile(config.machineConfigPath);
const simConfig = loadSimConfig(config.simulatorConfigPath);
const byTopic = sensorsByTopic(machine);
/** Only installed parts send data (owner, step 16: a part with installed: false sends nothing). */
const installedSensors = new Set(
  machine.components.filter((c) => c.installed).flatMap((c) => c.sensors.map((s) => s.id)),
);
const expected = new Map([...byTopic].filter(([, sensor]) => installedSensors.has(sensor.id)));
const topics = subscriptions(machine);
const arrivals = new Map<string, number[]>();
/** Device times (ts) per sensor topic, for the 5 Hz upper bound. */
const stamps = new Map<string, number[]>();
const rejected: string[] = [];
const notSim: string[] = [];
const states: string[] = [];
const badStates: string[] = [];
const badBatch: string[] = [];
const heard: Heard[] = [];
let batches = 0;
let cycleStarted: string | undefined;
let cycleFinished = false;
let lastStep: string | undefined;

const client = connect(config.mqttUrl, {
  clientId: `mixline-sim-check-${String(process.pid)}`,
  username: config.mqttUsername,
  password: config.mqttPassword,
  reconnectPeriod: 0,
});

client.on('error', (error) => {
  console.error(`FAIL  cannot connect to ${config.mqttUrl}: ${error.message}`);
  process.exit(1);
});

client.on('message', (topic, body) => {
  const json = parseJson(body.toString());
  const parsed = parseTopic(machine, topic);
  if (parsed?.kind === 'state') {
    const state = json.ok ? machineStateSchema.safeParse(json.value) : undefined;
    if (state?.success) states.push(`${state.data.status} ${state.data.batchId ?? ''}`.trim());
    else badStates.push(json.ok ? 'state: not the doc 04 format' : json.error);
    return;
  }
  if (parsed?.kind === 'batch') {
    batches++;
    const decoded = json.ok ? decodeBatchMessage(machine, parsed.event, json.value) : json;
    if (!decoded.ok) badBatch.push(`${topic}: ${decoded.error}`);
    else if (cycle) follow(decoded.value.event, decoded.value.payload);
    if (json.ok && (!cycle || cycleStarted !== undefined))
      heard.push({ topic, payload: json.value });
    return;
  }

  const times = arrivals.get(topic) ?? [];
  times.push(Date.now());
  arrivals.set(topic, times);
  const sensor = byTopic.get(topic);
  if (!sensor) {
    rejected.push(`${topic}: no sensor in machine.json`);
    return;
  }
  const decoded = json.ok ? decodeReading(sensor, json.value) : json;
  if (!decoded.ok) {
    rejected.push(`${topic}: ${decoded.error}`);
    return;
  }
  if (decoded.value.source !== 'sim') notSim.push(topic);
  const ts = stamps.get(topic) ?? [];
  ts.push(Date.parse(decoded.value.ts));
  stamps.set(topic, ts);
  // In cycle mode keep readings from a few seconds before the batch starts (the "before" values).
  heard.push({ topic, payload: decoded.value });
  if (cycle && cycleStarted === undefined && heard.length > 2000)
    heard.splice(0, heard.length - 2000);
});

/** Cycle mode: report the batch's progress and stop after the refill that follows it. */
function follow(event: string, payload: { batchId: string | null; step?: string }): void {
  if (event === 'started' && cycleStarted === undefined) {
    cycleStarted = payload.batchId ?? '';
    console.log(`batch ${cycleStarted} started`);
  } else if (cycleStarted !== undefined && payload.batchId === cycleStarted && event === 'step') {
    if (payload.step && payload.step !== lastStep) process.stdout.write(`  ${payload.step}`);
    lastStep = payload.step;
  } else if (event === 'finished' && payload.batchId === cycleStarted) {
    cycleFinished = true;
    console.log(`\nbatch ${cycleStarted} finished; waiting for the refill message...`);
  } else if (event === 'refill' && cycleFinished) {
    setTimeout(report, 500);
  }
}

client.on('connect', () => {
  const all = [topics.sensors, topics.state, topics.batch];
  client.subscribe(all, (error) => {
    if (error) {
      console.error(`FAIL  subscribe: ${error.message}`);
      process.exit(1);
    }
    const seconds = (cycle ? CYCLE_LISTEN_MS : LISTEN_MS) / 1000;
    console.log(
      cycle
        ? `waiting for the next batch to start, up to ${String(seconds / 60)} minutes...`
        : `listening to ${all.join(', ')} for ${String(seconds)} s...`,
    );
    setTimeout(report, cycle ? CYCLE_LISTEN_MS : LISTEN_MS);
  });
});

/** Largest gap between messages, including from the start and to the end of listening. */
function maxGap(times: number[], start: number, end: number): number {
  const points = [start, ...times, end];
  let gap = 0;
  for (let i = 1; i < points.length; i++) {
    gap = Math.max(gap, (points[i] ?? 0) - (points[i - 1] ?? 0));
  }
  return gap;
}

let reported = false;

function report(): void {
  if (reported) return;
  reported = true;
  const results = cycle ? checkCycle(machine, simConfig, heard) : liveResults();
  results.push(['the machine state arrives (retained) in the doc 04 format', stateProblems()]);
  // checkCycle checks the batch formats itself.
  if (!cycle) results.push(['every batch message passes its format', badBatch.slice(0, 5)]);

  let failed = 0;
  console.log('');
  for (const [name, problems] of results) {
    if (problems.length) failed++;
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`);
    for (const p of problems) console.log(`        ${p}`);
  }
  const total = [...arrivals.values()].reduce((n, t) => n + t.length, 0);
  console.log(
    `\n${String(total)} readings on ${String(arrivals.size)} topics, ${String(states.length)} state and ${String(batches)} batch messages.`,
  );
  console.log(failed ? `${String(failed)} check(s) failed.` : 'All checks passed.');
  client.end(false, {}, () => process.exit(failed ? 1 : 0));
}

function stateProblems(): string[] {
  if (badStates.length) return badStates.slice(0, 5);
  return states.length ? [] : ['no state message (it is retained, so it should arrive at once)'];
}

function liveResults(): CheckResult[] {
  const end = Date.now();
  const start = end - LISTEN_MS;
  const results: CheckResult[] = [];

  const missing = [...expected.keys()].filter((t) => !arrivals.has(t));
  results.push([
    `all ${String(expected.size)} sensor topics of installed parts arrive`,
    missing.map((t) => `${t}: nothing received`),
  ]);
  results.push(['every message passes decodeReading against machine.json', rejected.slice(0, 5)]);
  results.push(['every message says source "sim"', notSim.slice(0, 5)]);

  const late: string[] = [];
  const tooFast: string[] = [];
  for (const [topic, sensor] of expected) {
    const times = arrivals.get(topic);
    if (!times) continue;
    // Skip the first period: the listener may start between two messages.
    const period = sensor.kind === 'analog' ? ANALOG_MS : HEARTBEAT_MS;
    const gap = maxGap(times, start + period, end);
    if (gap > period + SLACK_MS) late.push(`${topic}: ${String(gap)} ms without a message`);
    // Device times, not arrival times: the network may bunch messages together.
    const ts = stamps.get(topic) ?? [];
    const fastest = Math.min(...ts.slice(1).map((t, i) => t - (ts[i] ?? 0)));
    if (sensor.kind === 'analog' && fastest < FAST_MS - 50) {
      tooFast.push(`${topic}: two readings ${String(fastest)} ms apart`);
    }
  }
  results.push(['analog at least every 1 s, digital/enum at least every 5 s', late.slice(0, 5)]);
  results.push(['analog never faster than 5 Hz', tooFast.slice(0, 5)]);
  return results;
}
