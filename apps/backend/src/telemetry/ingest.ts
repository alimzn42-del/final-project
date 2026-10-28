/**
 * Turns MQTT messages into readings (docs/04-architecture.md, "telemetry").
 *
 * - Only sensor topics of this machine, with a payload that passes
 *   decodeReading() against machine.json, are accepted.
 * - Anything else is dropped without an error: the backend must never crash
 *   on a malformed message (robustness, not a line rule; owner, step 6).
 * - Each accepted reading keeps the device `ts` and the time it was received,
 *   is queued for the database, and becomes the sensor's latest value.
 * - A device clock that drifts beyond CLOCK_TOLERANCE_MS is logged once per
 *   station when it goes out of tolerance and once when it comes back.
 */
import {
  chartTime,
  decodeReading,
  type LatestReading,
  type LatestValue,
  type Machine,
  parseJson,
  parseTopic,
  type Sensor,
  sensorsByTopic,
} from '@mixline/shared';

import type { TelemetryRow } from './telemetry-store.js';

export interface IngestLog {
  warn(message: string): void;
  log(message: string): void;
}

export class TelemetryIngest {
  private readonly sensors: Map<string, Sensor>;
  private readonly latestBySensor = new Map<string, TelemetryRow>();
  /** Stations whose device clock is currently beyond the tolerance. */
  private readonly skewedStations = new Set<string>();

  constructor(
    private readonly machine: Machine,
    private readonly write: (row: TelemetryRow) => void,
    private readonly toleranceMs: number,
    private readonly logger: IngestLog,
  ) {
    this.sensors = sensorsByTopic(machine);
  }

  /** Handles one message. Returns false if it was dropped. Never throws. */
  handle(topic: string, payload: Buffer | string, receivedAt: number = Date.now()): boolean {
    try {
      const parsed = parseTopic(this.machine, topic);
      const sensor = this.sensors.get(topic);
      if (parsed?.kind !== 'sensor' || !sensor) return false;

      const json = parseJson(payload.toString());
      if (!json.ok) return false;
      const reading = decodeReading(sensor, json.value);
      if (!reading.ok) return false;

      const row: TelemetryRow = {
        receivedAt: new Date(receivedAt),
        deviceTs: new Date(reading.value.ts),
        sensorId: sensor.id,
        value: reading.value.value,
        source: reading.value.source,
      };
      this.watchClock(sensor.station, row);
      this.latestBySensor.set(sensor.id, row);
      this.write(row);
      return true;
    } catch {
      return false;
    }
  }

  /** The latest reading of every sensor heard so far; `ts` is the chart time. */
  latest(): Record<string, LatestReading> {
    const out: Record<string, LatestReading> = {};
    for (const [id, row] of this.latestBySensor) {
      const received = row.receivedAt.getTime();
      out[id] = {
        value: row.value,
        ts: new Date(chartTime(row.deviceTs.getTime(), received, this.toleranceMs)).toISOString(),
        receivedAt: row.receivedAt.toISOString(),
        source: row.source,
      };
    }
    return out;
  }

  /** The latest value of every sensor heard so far, as machineStates() needs it. */
  latestValues(): Map<string, LatestValue> {
    const out = new Map<string, LatestValue>();
    for (const [id, row] of this.latestBySensor) {
      out.set(id, { value: row.value, receivedAt: row.receivedAt.getTime() });
    }
    return out;
  }

  private watchClock(station: string, row: TelemetryRow): void {
    const offset = row.deviceTs.getTime() - row.receivedAt.getTime();
    const skewed = Math.abs(offset) > this.toleranceMs;
    if (skewed && !this.skewedStations.has(station)) {
      this.skewedStations.add(station);
      this.logger.warn(
        `device clock of station "${station}" is off by ${String(offset)} ms (tolerance ${String(this.toleranceMs)} ms): charts use the received time`,
      );
    } else if (!skewed && this.skewedStations.has(station)) {
      this.skewedStations.delete(station);
      this.logger.log(`device clock of station "${station}" is back within tolerance`);
    }
  }
}
