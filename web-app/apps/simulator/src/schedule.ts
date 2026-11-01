/**
 * Decides what the simulator publishes on each tick, following the
 * publishing rules in docs/04-architecture.md:
 *
 * - analog sensors: on a fixed timer (1 Hz; up to 5 Hz while dosing or
 *   filling arrives with simulator v2);
 * - digital and enum sensors: on change, plus a heartbeat every 5 s.
 *
 * Pure logic (no network): main.ts calls tick() once a second and sends
 * the result. Every message is checked with decodeReading() first, so the
 * simulator can never publish something the backend would reject.
 */
import {
  decodeReading,
  type Machine,
  type Reading,
  type Sensor,
  sensorTopic,
} from '@mixline/shared';

import { analogValue, nominal, type Random } from './values.js';

export const TICK_MS = 1000;
export const HEARTBEAT_MS = 5000;

export interface Outgoing {
  topic: string;
  payload: Reading;
}

interface Sent {
  value: number;
  at: number;
}

export class Schedule {
  private readonly sensors: { sensor: Sensor; topic: string }[];
  /** Last value and time sent, for digital and enum sensors. */
  private readonly lastSent = new Map<string, Sent>();

  constructor(
    machine: Machine,
    private readonly random: Random = Math.random,
  ) {
    this.sensors = machine.components.flatMap((c) =>
      c.sensors.map((sensor) => ({ sensor, topic: sensorTopic(machine, sensor) })),
    );
  }

  /** Forget what was sent, so the next tick sends every sensor (e.g. after a reconnect). */
  reset(): void {
    this.lastSent.clear();
  }

  tick(now: number): Outgoing[] {
    const ts = new Date(now).toISOString();
    const out: Outgoing[] = [];
    for (const { sensor, topic } of this.sensors) {
      const value = sensor.kind === 'analog' ? analogValue(sensor, this.random) : nominal(sensor);
      if (sensor.kind !== 'analog' && !this.isDue(sensor.id, value, now)) continue;

      const decoded = decodeReading(sensor, { ts, value, unit: sensor.unit, source: 'sim' });
      if (!decoded.ok) throw new Error(`simulator bug: ${decoded.error}`);
      out.push({ topic, payload: decoded.value });
      if (sensor.kind !== 'analog') this.lastSent.set(sensor.id, { value, at: now });
    }
    return out;
  }

  /** Digital / enum: send on change, or when the 5 s heartbeat is due. */
  private isDue(sensorId: string, value: number, now: number): boolean {
    const last = this.lastSent.get(sensorId);
    if (!last) return true;
    return last.value !== value || now - last.at >= HEARTBEAT_MS;
  }
}
