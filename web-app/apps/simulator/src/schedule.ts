/**
 * Decides what the simulator publishes on each tick, following the publishing rules in
 * docs/04-architecture.md:
 *
 * - analog sensors: on a fixed timer, 1 Hz (5 Hz while dosing or filling: the `fast` set);
 * - digital and enum sensors: on change, plus a heartbeat every 5 s.
 *
 * Pure logic (no network). The simulation ticks every TICK_MS and hands over each sensor's
 * value; a sensor without one keeps simulator v1's value (nominal plus noise). Every message is
 * checked with decodeReading() first, so the simulator can never publish something the backend
 * would reject.
 */
import {
  decodeReading,
  type Machine,
  type Reading,
  type Sensor,
  sensorTopic,
} from '@mixline/shared';

import type { Random } from './random.js';
import { analogValue, nominal } from './values.js';

/** The simulation's time step: fast enough for the 5 Hz rate and for short pulses. */
export const TICK_MS = 200;
export const ANALOG_MS = 1000;
export const FAST_MS = 200;
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
  /** Last value and time sent, per sensor. */
  private readonly lastSent = new Map<string, Sent>();

  constructor(
    machine: Machine,
    private readonly random: Random = Math.random,
  ) {
    // A part that is not installed sends nothing, like the real line (owner, step 16).
    this.sensors = machine.components
      .filter((c) => c.installed)
      .flatMap((c) => c.sensors.map((sensor) => ({ sensor, topic: sensorTopic(machine, sensor) })));
  }

  /** Forget what was sent, so the next tick sends every sensor (e.g. after a reconnect). */
  reset(): void {
    this.lastSent.clear();
  }

  /**
   * `values`: the process's value per sensor id. `fast`: analog sensors at 5 Hz right now.
   */
  tick(
    now: number,
    values: ReadonlyMap<string, number> = new Map(),
    fast: ReadonlySet<string> = new Set(),
  ): Outgoing[] {
    const ts = new Date(now).toISOString();
    const out: Outgoing[] = [];
    for (const { sensor, topic } of this.sensors) {
      const given = values.get(sensor.id);
      const value =
        given === undefined
          ? sensor.kind === 'analog'
            ? analogValue(sensor, this.random)
            : nominal(sensor)
          : shown(sensor, given);
      if (!this.isDue(sensor, value, now, fast.has(sensor.id))) continue;

      const decoded = decodeReading(sensor, { ts, value, unit: sensor.unit, source: 'sim' });
      if (!decoded.ok) throw new Error(`simulator bug: ${decoded.error}`);
      out.push({ topic, payload: decoded.value });
      this.lastSent.set(sensor.id, { value, at: now });
    }
    return out;
  }

  private isDue(sensor: Sensor, value: number, now: number, fast: boolean): boolean {
    const last = this.lastSent.get(sensor.id);
    if (!last) return true;
    // Half a tick of slack, so timer jitter never skips a whole period.
    const since = now - last.at + TICK_MS / 2;
    if (sensor.kind === 'analog') return since >= (fast ? FAST_MS : ANALOG_MS);
    return last.value !== value || since >= HEARTBEAT_MS;
  }
}

/** An analog value with the sensor's own decimals (machine.json), so numbers never jitter. */
function shown(sensor: Sensor, value: number): number {
  if (sensor.kind !== 'analog') return value;
  const rounded = Number(value.toFixed(sensor.decimals ?? 0));
  return rounded === 0 ? 0 : rounded;
}
