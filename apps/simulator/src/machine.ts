import { readFileSync } from 'node:fs';

import { type Machine, parseMachineOrThrow } from '@mixline/shared';

/** Reads and validates machine.json; throws one error listing every problem. */
export function loadMachine(path: string): Machine {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read machine config ${path}`, { cause: error });
  }
  return parseMachineOrThrow(data);
}
