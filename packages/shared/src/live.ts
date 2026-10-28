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

/** Server -> client events with their data, for typed socket.io servers and clients. */
export interface LiveServerEvents {
  [LIVE_EVENTS.snapshot]: (data: LiveSnapshot) => void;
  [LIVE_EVENTS.readings]: (data: LiveReadings) => void;
  [LIVE_EVENTS.states]: (data: LiveStates) => void;
}

/**
 * Why a connection was refused: the message of the client's `connect_error`.
 * Same access as /api/telemetry. A connection the server closes later (every
 * minute it re-checks the user) gets no code: ask GET /api/auth/me why.
 */
export const LIVE_REFUSALS = {
  /** No valid session (none, forged, expired, or the user was deleted). */
  loginRequired: 'LOGIN_REQUIRED',
  /** Same code as the HTTP 403: the temporary password must be changed first. */
  passwordChangeRequired: 'PASSWORD_CHANGE_REQUIRED',
  /** Logged in, but not staff: customers never reach line data. */
  forbidden: 'FORBIDDEN',
  /** The login could not be checked (database down); try again later. */
  unavailable: 'UNAVAILABLE',
} as const;
export type LiveRefusal = (typeof LIVE_REFUSALS)[keyof typeof LIVE_REFUSALS];
