import { describe, expect, it } from 'vitest';

import { rawMachine } from './__fixtures__/config.js';
import { machineSchema, type Sensor } from './machine.schema.js';
import {
  batchEventSchema,
  chartTime,
  decodeReading,
  historyResolution,
  machineStateSchema,
  parseJson,
  RAW_HISTORY_MAX_MS,
  readingSchema,
} from './telemetry.js';

const machine = machineSchema.parse(rawMachine());
function sensor(id: string): Sensor {
  const s = machine.components.flatMap((c) => c.sensors).find((x) => x.id === id);
  if (!s) throw new Error(`no sensor ${id}`);
  return s;
}

const ts = '2026-10-27T12:00:00.000Z';

describe('reading payload', () => {
  it('accepts the doc 04 example', () => {
    const example = { ts, value: 1834.2, unit: 'g', source: 'sim' };
    expect(readingSchema.parse(example)).toEqual(example);
  });

  it.each([
    [
      'a local time offset',
      { ts: '2026-10-27T15:00:00+03:00', value: 1, unit: 'g', source: 'sim' },
    ],
    ['a date only', { ts: '2026-10-27', value: 1, unit: 'g', source: 'sim' }],
    ['a value as text', { ts, value: '1834.2', unit: 'g', source: 'sim' }],
    ['an unknown source', { ts, value: 1, unit: 'g', source: 'test' }],
    ['an extra field', { ts, value: 1, unit: 'g', source: 'sim', quality: 'good' }],
    ['a missing unit', { ts, value: 1, source: 'sim' }],
  ])('rejects %s', (_case, payload) => {
    expect(readingSchema.safeParse(payload).success).toBe(false);
  });
});

describe('decodeReading against machine.json', () => {
  it('accepts a correct reading for each sensor kind', () => {
    expect(
      decodeReading(sensor('vessel.mass'), { ts, value: 1834.2, unit: 'g', source: 'sim' }).ok,
    ).toBe(true);
    expect(
      decodeReading(sensor('basePump.on'), { ts, value: 1, unit: 'bool', source: 'hw' }).ok,
    ).toBe(true);
    expect(
      decodeReading(sensor('samplePump.dir'), { ts, value: -1, unit: '', source: 'sim' }).ok,
    ).toBe(true);
  });

  it('rejects a unit that differs from machine.json', () => {
    expect(
      decodeReading(sensor('vessel.mass'), { ts, value: 1.8, unit: 'kg', source: 'sim' }),
    ).toEqual({
      ok: false,
      error: 'vessel.mass: unit "kg" should be "g"',
    });
  });

  it('rejects a digital value other than 0 or 1', () => {
    expect(
      decodeReading(sensor('basePump.on'), { ts, value: 2, unit: 'bool', source: 'sim' }),
    ).toEqual({
      ok: false,
      error: 'basePump.on: digital value 2 should be 0 or 1',
    });
  });

  it('rejects an enum code that has no value word', () => {
    expect(
      decodeReading(sensor('check.decision'), { ts, value: 3, unit: '', source: 'sim' }),
    ).toEqual({
      ok: false,
      error: 'check.decision: enum value 3 is not a known code',
    });
  });

  it('names the sensor and the field when the format is wrong', () => {
    const result = decodeReading(sensor('vessel.mass'), {
      ts: 'yesterday',
      value: 1,
      unit: 'g',
      source: 'sim',
    });
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/^vessel\.mass: ts: expected a UTC time/) as string,
    });
  });

  it('parses JSON text safely', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('{a:1')).toEqual({ ok: false, error: 'payload is not valid JSON' });
  });
});

describe('machine-wide messages', () => {
  it('accepts the doc 04 state example', () => {
    const state = { ts, mode: 'auto', status: 'running', batchId: 'B-0012', source: 'sim' };
    expect(machineStateSchema.parse(state)).toEqual(state);
  });

  it('allows no batch while idle, but not while running', () => {
    const idle = { ts, mode: 'manual', status: 'idle', batchId: null, source: 'hw' };
    expect(machineStateSchema.safeParse(idle).success).toBe(true);
    expect(machineStateSchema.safeParse({ ...idle, status: 'running' }).success).toBe(false);
  });

  it('accepts the doc 04 batch example (step name from the doc 04 step list)', () => {
    const event = {
      ts,
      batchId: 'B-0012',
      step: 'dyeDose',
      recipe: { targetLab: [55, 10, -20] },
      containersDone: 3,
      source: 'sim',
    };
    expect(batchEventSchema.parse(event)).toEqual(event);
  });

  it('rejects an unknown batch step and an L* outside 0..100', () => {
    const base = {
      ts,
      batchId: 'B-1',
      step: 'mix',
      recipe: { targetLab: [55, 10, -20] },
      containersDone: 0,
      source: 'sim',
    };
    expect(batchEventSchema.safeParse({ ...base, step: 'dosing' }).success).toBe(false);
    expect(
      batchEventSchema.safeParse({ ...base, recipe: { targetLab: [120, 0, 0] } }).success,
    ).toBe(false);
  });
});

describe('chart time and history resolution', () => {
  const received = Date.parse('2026-10-28T10:00:00.000Z');

  it('uses the device time within the tolerance, the received time beyond it', () => {
    expect(chartTime(received - 2000, received, 2000)).toBe(received - 2000);
    expect(chartTime(received + 2000, received, 2000)).toBe(received + 2000);
    expect(chartTime(received - 2001, received, 2000)).toBe(received);
    expect(chartTime(received + 3_600_000, received, 2000)).toBe(received); // clock an hour ahead
  });

  it('reads raw readings up to one hour, the 1-minute summary beyond', () => {
    expect(historyResolution(0, RAW_HISTORY_MAX_MS)).toBe('raw');
    expect(historyResolution(0, RAW_HISTORY_MAX_MS + 1)).toBe('1m');
  });
});
