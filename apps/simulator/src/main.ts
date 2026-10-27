/**
 * Simulator entry point: publishes fake telemetry for every sensor in
 * machine.json on the real MQTT topics, exactly as the hardware will.
 */
import { connect } from 'mqtt';

import { loadConfig } from './config.js';
import { loadMachine } from './machine.js';
import { Schedule, TICK_MS } from './schedule.js';

const SUMMARY_EVERY_MS = 60_000;

function log(message: string): void {
  console.log(`${new Date().toISOString()} simulator: ${message}`);
}

function main(): void {
  const config = loadConfig();
  const machine = loadMachine(config.machineConfigPath);
  const schedule = new Schedule(machine);
  const sensorCount = machine.components.reduce((n, c) => n + c.sensors.length, 0);
  log(`loaded ${config.machineConfigPath}: ${String(sensorCount)} sensors`);

  const client = connect(config.mqttUrl, {
    clientId: 'mixline-simulator',
    username: config.mqttUsername,
    password: config.mqttPassword,
    reconnectPeriod: 2000,
  });

  client.on('connect', () => {
    // Send every sensor at once after (re)connecting, then follow the rules.
    schedule.reset();
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
  const ticker = setInterval(() => {
    if (!client.connected) return;
    for (const { topic, payload } of schedule.tick(Date.now())) {
      client.publish(topic, JSON.stringify(payload), { qos: 0 });
      published++;
    }
  }, TICK_MS);

  const summary = setInterval(() => {
    log(`published ${String(published)} messages in the last minute`);
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
