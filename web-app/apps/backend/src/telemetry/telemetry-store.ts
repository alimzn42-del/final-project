/**
 * Where readings are kept. The ingest and the API depend only on this
 * interface: the backend uses TimescaleDB (PrismaTelemetryStore); the HTTP
 * tests use an in-memory store, so they run without Docker.
 */
import type { HistoryResolution, Source } from '@mixline/shared';

export const TELEMETRY_STORE = Symbol('TELEMETRY_STORE');

export interface TelemetryRow {
  /** Set by the backend when the message arrived. */
  receivedAt: Date;
  /** The device's own `ts`; may be off. */
  deviceTs: Date;
  sensorId: string;
  value: number;
  source: Source;
}

export interface HistoryQuery {
  sensorId: string;
  from: Date;
  to: Date;
  resolution: HistoryResolution;
  /** CLOCK_TOLERANCE_MS: decides device or received time per reading (raw). */
  toleranceMs: number;
}

export type HistoryPoints =
  | { resolution: 'raw'; points: { t: Date; v: number }[] }
  | { resolution: '1m'; points: { t: Date; min: number; max: number; avg: number }[] };

export interface TelemetryStore {
  insert(rows: readonly TelemetryRow[]): Promise<void>;
  history(query: HistoryQuery): Promise<HistoryPoints>;
}
