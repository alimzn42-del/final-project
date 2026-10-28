import 'reflect-metadata';

import { loadConfigFiles, loadDepartmentsFile } from '@mixline/shared/node';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule, type RateLimits } from './app.module.js';
import { type BackendConfig, loadConfig } from './config.js';
import type { TelemetryStore } from './telemetry/telemetry-store.js';
import type { UserStore } from './users/user-store.js';

/** Every route lives under /api, so the web app can be served next to it. */
export const API_PREFIX = 'api';

export interface CreateAppOptions {
  /** Replace the database stores (HTTP tests run without Docker). */
  userStore?: UserStore;
  telemetryStore?: TelemetryStore;
  rateLimits?: RateLimits;
  /** Nest's own startup logs; on by default. */
  logs?: boolean;
}

/**
 * Builds the app: checks the settings, then loads and validates machine.json
 * and both locale files together. Any problem throws one error listing all
 * of them, so a broken config never starts serving.
 */
export async function createApp(
  env: NodeJS.ProcessEnv = process.env,
  options: CreateAppOptions = {},
): Promise<{ app: INestApplication; config: BackendConfig }> {
  const config = loadConfig(env);
  const { machine, locales } = loadConfigFiles(config.machineConfigPath, config.localesDir);
  const departments = loadDepartmentsFile(config.departmentsPath, locales);
  const files = { machine, locales, departments };
  const app = await NestFactory.create(
    AppModule.register({
      files,
      config,
      userStore: options.userStore,
      telemetryStore: options.telemetryStore,
      rateLimits: options.rateLimits,
    }),
    { logger: options.logs === false ? ['error'] : ['error', 'warn', 'log'] },
  );
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return { app, config };
}
