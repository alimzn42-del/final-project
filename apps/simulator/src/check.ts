/**
 * Live check of a running simulator (plan step 5), run with `pnpm sim:check`.
 * Listens to the broker for a while, like the backend will, and verifies
 * what actually arrives. Exits with code 1 if any check fails.
 */
import { decodeReading, parseJson, sensorsByTopic, subscriptions } from '@mixline/shared';
import { loadMachineFile } from '@mixline/shared/node';
import { connect } from 'mqtt';

import { loadConfig } from './config.js';
import { HEARTBEAT_MS, TICK_MS } from './schedule.js';

const LISTEN_MS = 12_000;
/** Allowed lateness for a message, on top of its period (timers and network). */
const SLACK_MS = 1_000;

const config = loadConfig();
const machine = loadMachineFile(config.machineConfigPath);
const byTopic = sensorsByTopic(machine);
const arrivals = new Map<string, number[]>();
const rejected: string[] = [];
const notSim: string[] = [];

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
  const times = arrivals.get(topic) ?? [];
  times.push(Date.now());
  arrivals.set(topic, times);
  const sensor = byTopic.get(topic);
  if (!sensor) {
    rejected.push(`${topic}: no sensor in machine.json`);
    return;
  }
  const json = parseJson(body.toString());
  const decoded = json.ok ? decodeReading(sensor, json.value) : json;
  if (!decoded.ok) rejected.push(`${topic}: ${decoded.error}`);
  else if (decoded.value.source !== 'sim') notSim.push(topic);
});

client.on('connect', () => {
  client.subscribe(subscriptions(machine).sensors, (error) => {
    if (error) {
      console.error(`FAIL  subscribe: ${error.message}`);
      process.exit(1);
    }
    console.log(
      `listening to ${subscriptions(machine).sensors} for ${String(LISTEN_MS / 1000)} s...`,
    );
    setTimeout(report, LISTEN_MS);
  });
});

/** Largest gap between messages, including from the start and to the end of listening. */
function maxGap(times: number[], start: number, end: number): number {
  const points = [start, ...times, end];
  let gap = 0;
  for (let i = 1; i < points.length; i++)
    gap = Math.max(gap, (points[i] ?? 0) - (points[i - 1] ?? 0));
  return gap;
}

function report(): void {
  const end = Date.now();
  const start = end - LISTEN_MS;
  const results: [string, string[]][] = [];

  const missing = [...byTopic.keys()].filter((t) => !arrivals.has(t));
  results.push([
    `all ${String(byTopic.size)} sensor topics arrive`,
    missing.map((t) => `${t}: nothing received`),
  ]);
  results.push(['every message passes decodeReading against machine.json', rejected.slice(0, 5)]);
  results.push(['every message says source "sim"', notSim.slice(0, 5)]);

  const late: string[] = [];
  for (const [topic, sensor] of byTopic) {
    const times = arrivals.get(topic);
    if (!times) continue;
    // Skip the first period: the listener may start between two messages.
    const period = sensor.kind === 'analog' ? TICK_MS : HEARTBEAT_MS;
    const gap = maxGap(times, start + period, end);
    if (gap > period + SLACK_MS) late.push(`${topic}: ${String(gap)} ms without a message`);
  }
  results.push(['analog every 1 s, digital/enum at least every 5 s', late.slice(0, 5)]);

  let failed = 0;
  for (const [name, problems] of results) {
    if (problems.length) failed++;
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`);
    for (const p of problems) console.log(`        ${p}`);
  }
  const total = [...arrivals.values()].reduce((n, t) => n + t.length, 0);
  console.log(`\n${String(total)} messages on ${String(arrivals.size)} topics.`);
  console.log(failed ? `${String(failed)} check(s) failed.` : 'All checks passed.');
  client.end(false, {}, () => process.exit(failed ? 1 : 0));
}
