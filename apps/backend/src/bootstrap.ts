import 'reflect-metadata';

import { loadConfigFiles } from '@mixline/shared/node';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { type BackendConfig, loadConfig } from './config.js';

/** Every route lives under /api, so the web app can be served next to it. */
export const API_PREFIX = 'api';

/**
 * Builds the app: checks the settings, then loads and validates machine.json
 * and both locale files together. Any problem throws one error listing all
 * of them, so a broken config never starts serving.
 */
export async function createApp(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ app: INestApplication; config: BackendConfig }> {
  const config = loadConfig(env);
  const files = loadConfigFiles(config.machineConfigPath, config.localesDir);
  const app = await NestFactory.create(AppModule.register(files), {
    logger: ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return { app, config };
}
