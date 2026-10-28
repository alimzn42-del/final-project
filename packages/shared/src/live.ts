/**
 * The live connection between backend and frontend (socket.io), plan step 10.
 * The path is under /api because the login cookie is only sent there.
 */
import type { StateChanges, StateSnapshot } from './state.js';
import type { LatestReading } from './telemetry.js';

export const LIVE_PATH = '/api/socket.io';

/** Server -> client events. */
export const LIVE_EVENTS = {
  /** Once, right after connecting: everything known so far. */
  snapshot: 'snapshot',
  /** Every 0.5 s: the sensors that sent something new, by sensor id. */
  readings: 'readings',
  /** When a state changes (checked every second): only the changes. */
  states: 'states',
} as const;

export interface LiveSnapshot {
  readings: Record<string, LatestReading>;
  states: StateSnapshot;
}

export type LiveReadings = Record<string, LatestReading>;
export type LiveStates = StateChanges;
