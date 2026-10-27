/**
 * Backend settings from environment variables (see .env.example). Checked
 * once at startup: a bad or missing value stops the backend with a list of
 * every problem.
 */
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/** Repo paths; this file runs from apps/backend/src or apps/backend/dist. */
const repoConfig = (relative: string) =>
  fileURLToPath(new URL(`../../../config/${relative}`, import.meta.url));

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MACHINE_CONFIG: z.string().min(1).default(repoConfig('machine.json')),
  LOCALES_DIR: z.string().min(1).default(repoConfig('locales')),
});

export interface BackendConfig {
  port: number;
  machineConfigPath: string;
  localesDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`backend settings are invalid (check .env):\n${problems.join('\n')}`);
  }
  return {
    port: parsed.data.PORT,
    machineConfigPath: parsed.data.MACHINE_CONFIG,
    localesDir: parsed.data.LOCALES_DIR,
  };
}
