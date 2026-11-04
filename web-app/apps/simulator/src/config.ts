/**
 * Simulator settings from environment variables (see .env.example).
 * Inside Docker, docker-compose.yml sets MQTT_URL to the broker's service name.
 */
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/** config/ in the repo; this file runs from apps/simulator/src or /dist. */
const inConfig = (name: string) =>
  fileURLToPath(new URL(`../../../config/${name}`, import.meta.url));

const envSchema = z.object({
  MQTT_URL: z.url().default('mqtt://localhost:1883'),
  MQTT_USERNAME: z.string().min(1),
  MQTT_PASSWORD: z.string().min(1),
  MACHINE_CONFIG: z.string().min(1).default(inConfig('machine.json')),
  /** The simulator's tuning file: recipes, rates, timings (plan step 15). */
  SIMULATOR_CONFIG: z.string().min(1).default(inConfig('simulator.json')),
});

export interface SimulatorConfig {
  mqttUrl: string;
  mqttUsername: string;
  mqttPassword: string;
  machineConfigPath: string;
  simulatorConfigPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SimulatorConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`simulator settings are invalid (check .env):\n${problems.join('\n')}`);
  }
  const e = parsed.data;
  return {
    mqttUrl: e.MQTT_URL,
    mqttUsername: e.MQTT_USERNAME,
    mqttPassword: e.MQTT_PASSWORD,
    machineConfigPath: e.MACHINE_CONFIG,
    simulatorConfigPath: e.SIMULATOR_CONFIG,
  };
}
