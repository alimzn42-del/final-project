/**
 * Backend settings from environment variables (see .env.example). Checked
 * once at startup: a bad or missing value stops the backend with a list of
 * every problem.
 */
import { fileURLToPath } from 'node:url';

import { DEFAULT_CLOCK_TOLERANCE_MS } from '@mixline/shared';
import { z } from 'zod';

/** Repo paths; this file runs from apps/backend/src or apps/backend/dist. */
const repoConfig = (relative: string) =>
  fileURLToPath(new URL(`../../../config/${relative}`, import.meta.url));

const optional = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MACHINE_CONFIG: z.string().min(1).default(repoConfig('machine.json')),
    LOCALES_DIR: z.string().min(1).default(repoConfig('locales')),

    // Database: DATABASE_URL, or built from the POSTGRES_* values (same rule as prisma.config.ts).
    DATABASE_URL: optional,
    POSTGRES_USER: optional,
    POSTGRES_PASSWORD: optional,
    POSTGRES_DB: optional,
    POSTGRES_HOST: z.string().min(1).default('localhost'),
    POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),

    // Login sessions.
    JWT_SECRET: z.string().min(32, 'at least 32 characters; use a long random value'),
    SESSION_HOURS: z.coerce.number().positive().max(168).default(8),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // MQTT broker (telemetry intake). Without a login the backend runs without intake.
    MQTT_URL: z.url().default('mqtt://localhost:1883'),
    MQTT_USERNAME: optional,
    MQTT_PASSWORD: optional,
    // Charts use the received time when a device clock is further off than this (owner).
    CLOCK_TOLERANCE_MS: z.coerce.number().int().min(0).default(DEFAULT_CLOCK_TOLERANCE_MS),

    // The first manager account, created at startup if no manager exists.
    MANAGER_EMAIL: optional,
    MANAGER_PASSWORD: optional,
  })
  .superRefine((e, ctx) => {
    if (Boolean(e.MANAGER_EMAIL) !== Boolean(e.MANAGER_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['MANAGER_PASSWORD'],
        message: 'set MANAGER_EMAIL and MANAGER_PASSWORD together',
      });
    }
  });

export interface BackendConfig {
  port: number;
  machineConfigPath: string;
  localesDir: string;
  /** Undefined when no database settings are given (tests with an in-memory store). */
  databaseUrl: string | undefined;
  session: { secret: string; hours: number; secureCookie: boolean };
  firstManager: { email: string; password: string } | undefined;
  /** Undefined when MQTT_USERNAME / MQTT_PASSWORD are not set (no intake). */
  mqtt: { url: string; username: string; password: string } | undefined;
  clockToleranceMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`backend settings are invalid (check .env):\n${problems.join('\n')}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    machineConfigPath: e.MACHINE_CONFIG,
    localesDir: e.LOCALES_DIR,
    databaseUrl: databaseUrl(e),
    session: { secret: e.JWT_SECRET, hours: e.SESSION_HOURS, secureCookie: e.COOKIE_SECURE },
    firstManager:
      e.MANAGER_EMAIL && e.MANAGER_PASSWORD
        ? { email: e.MANAGER_EMAIL.trim().toLowerCase(), password: e.MANAGER_PASSWORD }
        : undefined,
    mqtt:
      e.MQTT_USERNAME && e.MQTT_PASSWORD
        ? { url: e.MQTT_URL, username: e.MQTT_USERNAME, password: e.MQTT_PASSWORD }
        : undefined,
    clockToleranceMs: e.CLOCK_TOLERANCE_MS,
  };
}

function databaseUrl(e: z.infer<typeof envSchema>): string | undefined {
  if (e.DATABASE_URL) return e.DATABASE_URL;
  if (!e.POSTGRES_USER || !e.POSTGRES_PASSWORD || !e.POSTGRES_DB) return undefined;
  const user = encodeURIComponent(e.POSTGRES_USER);
  const password = encodeURIComponent(e.POSTGRES_PASSWORD);
  return `postgresql://${user}:${password}@${e.POSTGRES_HOST}:${String(e.POSTGRES_PORT)}/${e.POSTGRES_DB}`;
}
