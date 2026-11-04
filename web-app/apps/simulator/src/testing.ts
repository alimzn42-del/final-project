/**
 * Test-only helpers: the real config files, read fresh for each test so a test can break its
 * own copy. Excluded from the build (see tsconfig.build.json).
 */
import { fileURLToPath } from 'node:url';

import { type Machine, machineSchema } from '@mixline/shared';
import { readJsonFile } from '@mixline/shared/node';

import { parseSimConfig, type SimConfig } from './simConfig.js';

const inConfig = (name: string) =>
  fileURLToPath(new URL(`../../../config/${name}`, import.meta.url));

/** The raw files as plain JSON, to break on purpose. */
export const rawMachine = () => readJsonFile(inConfig('machine.json')) as Record<string, unknown>;
export const rawSimConfig = () =>
  readJsonFile(inConfig('simulator.json')) as Record<string, Record<string, unknown>>;

export const realMachine = (): Machine => machineSchema.parse(rawMachine());
export const realSimConfig = (): SimConfig => parseSimConfig(rawSimConfig());
