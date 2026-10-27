import { fileURLToPath } from 'node:url';

import { decodeReading, sensorsByTopic, valueState } from '@mixline/shared';
import { loadMachineFile } from '@mixline/shared/node';
import { describe, expect, it } from 'vitest';

import { HEARTBEAT_MS, Schedule, TICK_MS } from './schedule.js';
import { analogValue, okBand } from './values.js';

const machine = loadMachineFile(
  fileURLToPath(new URL('../../../config/machine.json', import.meta.url)),
);
const sensors = machine.components.flatMap((c) => c.sensors);
const analogCount = sensors.filter((s) => s.kind === 'analog').length;
const otherCount = sensors.length - analogCount;
const byTopic = sensorsByTopic(machine);
const T0 = Date.parse('2026-10-27T12:00:00.000Z');

describe('values', () => {
  it('keeps every analog value inside its sim range and its ok band, over many draws', () => {
    for (const s of sensors.filter((x) => x.kind === 'analog')) {
      const [low, high] = okBand(s);
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const v = analogValue(s, () => r);
        expect(v, s.id).toBeGreaterThanOrEqual(low);
        expect(v, s.id).toBeLessThanOrEqual(high);
        expect(valueState(s, v), s.id).toBe('ok');
      }
    }
  });

  it('keeps counters as whole numbers without noise', () => {
    const steps = sensors.find((s) => s.id === 'dyeCPump.steps');
    const lids = sensors.find((s) => s.id === 'check.lidCount');
    expect(steps && analogValue(steps, () => 0.9)).toBe(0);
    expect(lids && analogValue(lids, () => 0.9)).toBe(20);
  });

  it('adds noise to measured values', () => {
    const mass = sensors.find((s) => s.id === 'vessel.mass');
    if (!mass) throw new Error('no vessel.mass');
    expect(analogValue(mass, () => 0)).toBeLessThan(1800);
    expect(analogValue(mass, () => 0.999)).toBeGreaterThan(1800);
  });
});

describe('Schedule: doc 04 publishing rules', () => {
  it('sends all 60 sensors on the first tick', () => {
    const out = new Schedule(machine).tick(T0);
    expect(out).toHaveLength(60);
    expect(new Set(out.map((m) => m.topic)).size).toBe(60);
  });

  it('sends analog sensors every second and digital/enum only on the 5 s heartbeat', () => {
    const schedule = new Schedule(machine);
    const counts = [0, 1, 2, 3, 4, 5].map((i) => schedule.tick(T0 + i * TICK_MS).length);
    expect(counts).toEqual([60, analogCount, analogCount, analogCount, analogCount, 60]);
    expect(HEARTBEAT_MS).toBe(5 * TICK_MS);
    expect(otherCount).toBe(24);
  });

  it('sends everything again after reset (reconnect)', () => {
    const schedule = new Schedule(machine);
    schedule.tick(T0);
    schedule.reset();
    expect(schedule.tick(T0 + TICK_MS)).toHaveLength(60);
  });

  it('publishes only messages the backend will accept, all "ok", from source sim', () => {
    const schedule = new Schedule(machine);
    for (let i = 0; i < 30; i++) {
      for (const { topic, payload } of schedule.tick(T0 + i * TICK_MS)) {
        const sensor = byTopic.get(topic);
        expect(sensor, topic).toBeDefined();
        if (!sensor) continue;
        expect(decodeReading(sensor, payload).ok, topic).toBe(true);
        expect(valueState(sensor, payload.value), topic).toBe('ok');
        expect(payload.source).toBe('sim');
        expect(payload.ts).toBe(new Date(T0 + i * TICK_MS).toISOString());
      }
    }
  });
});
