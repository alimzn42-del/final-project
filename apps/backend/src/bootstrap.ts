import 'reflect-metadata';

import { loadConfigFiles } from '@mixline/shared/node';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule, type RateLimits } from './app.module.js';
import { type BackendConfig, loadConfig } from './config.js';
import type { UserStore } from './users/user-store.js';

/** Every route lives under /api, so the web app can be served next to it. */
export const API_PREFIX = 'api';

export interface CreateAppOptions {
  /** Replaces the database user store (HTTP tests run without Docker). */
  userStore?: UserStore;
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
  const files = loadConfigFiles(config.machineConfigPath, config.localesDir);
  const app = await NestFactory.create(
    AppModule.register({
      files,
      config,
      userStore: options.userStore,
      rateLimits: options.rateLimits,
    }),
    { logger: options.logs === false ? ['error'] : ['error', 'warn', 'log'] },
  );
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return { app, config };
}
