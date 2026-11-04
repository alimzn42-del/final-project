/**
 * Simulator entry point: runs the simulated line (simulator v2, plan step 15) and publishes
 * what the hardware will publish, on the real MQTT topics (doc 04): every sensor of
 * machine.json, the retained machine state, and the batch events.
 */
import { loadMachineFile } from '@mixline/shared/node';
import { connect } from 'mqtt';

import { loadConfig } from './config.js';
import { TICK_MS } from './schedule.js';
import { skipMessage } from './recipes.js';
import { loadSimConfig } from './simConfig.js';
import { type Message, Simulation } from './simulation.js';

const SUMMARY_EVERY_MS = 60_000;
/** After a pause longer than this (the computer slept), skip ahead instead of catching up. */
const MAX_LAG_MS = 2_000;

function log(message: string): void {
  console.log(`${new Date().toISOString()} simulator: ${message}`);
}

/**
 * QoS 0 for readings (only the latest value matters; a lost one is replaced a second later).
 * QoS 1 for the state and batch events, which are not repeated; the state is retained, so a new
 * listener gets it at once.
 */
function publishOptions(message: Message): { qos: 0 | 1; retain: boolean } {
  if (message.kind === 'reading') return { qos: 0, retain: false };
  return { qos: 1, retain: message.kind === 'state' };
}

function main(): void {
  const config = loadConfig();
  const machine = loadMachineFile(config.machineConfigPath);
  const simConfig = loadSimConfig(config.simulatorConfigPath);
  // Refuses to start when machine.json lacks a sensor or part the process needs (bindings.ts).
  const simulation = new Simulation(machine, simConfig, {
    startMs: Date.now(),
    maxLagMs: MAX_LAG_MS,
  });
  const sensorCount = machine.components.reduce((n, c) => n + c.sensors.length, 0);
  log(`loaded ${config.machineConfigPath}: ${String(sensorCount)} sensors`);
  log(`loaded ${config.simulatorConfigPath}: ${String(simConfig.recipes.list.length)} recipes`);
  for (const skipped of simulation.skipped) log(skipMessage(skipped));

  const client = connect(config.mqttUrl, {
    clientId: 'mixline-simulator',
    username: config.mqttUsername,
    password: config.mqttPassword,
    reconnectPeriod: 2000,
  });

  client.on('connect', () => {
    // Send every sensor and the state at once after (re)connecting, then follow the rules.
    simulation.reset();
    log(`connected to ${config.mqttUrl}`);
  });
  client.on('reconnect', () => {
    log('reconnecting...');
  });
  client.on('offline', () => {
    log('broker offline');
  });
  client.on('error', (error) => {
    log(`MQTT error: ${error.message}`);
  });

  let published = 0;
  let batches = 0;
  // The line runs even while the broker is away; what happens meanwhile is not sent.
  const ticker = setInterval(() => {
    const messages = simulation.advanceTo(Date.now());
    if (!client.connected) return;
    for (const message of messages) {
      client.publish(message.topic, JSON.stringify(message.payload), publishOptions(message));
      published++;
      if (message.kind === 'batch' && message.event === 'finished') batches++;
    }
  }, TICK_MS);

  const summary = setInterval(() => {
    log(
      `published ${String(published)} messages in the last minute (${String(batches)} batches done)`,
    );
    published = 0;
  }, SUMMARY_EVERY_MS);

  const stop = (signal: string) => {
    log(`${signal}: stopping`);
    clearInterval(ticker);
    clearInterval(summary);
    client.end(false, {}, () => process.exit(0));
  };
  process.once('SIGINT', () => {
    stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    stop('SIGTERM');
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
