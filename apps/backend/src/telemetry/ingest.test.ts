import { fileURLToPath } from 'node:url';

import { loadMachineFile } from '@mixline/shared/node';
import { describe, expect, it } from 'vitest';

import { TelemetryIngest } from './ingest.js';
import type { TelemetryRow } from './telemetry-store.js';

const machine = loadMachineFile(
  fileURLToPath(new URL('../../../../config/machine.json', import.meta.url)),
);
const NOW = Date.parse('2026-10-28T10:00:00.000Z');

function setup() {
  const rows: TelemetryRow[] = [];
  const logs: string[] = [];
  const ingest = new TelemetryIngest(machine, (r) => rows.push(r), 2000, {
    warn: (m) => logs.push(`warn: ${m}`),
    log: (m) => logs.push(`log: ${m}`),
  });
  return { ingest, rows, logs };
}

const reading = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    ts: new Date(NOW - 300).toISOString(),
    value: 1834.2,
    unit: 'g',
    source: 'sim',
    ...over,
  });

describe('TelemetryIngest', () => {
  it('accepts a valid reading: queues it and makes it the latest value', () => {
    const { ingest, rows } = setup();
    expect(ingest.handle('lab/mixline/mixer/sensors/mass', reading(), NOW)).toBe(true);
    expect(rows).toEqual([
      {
        receivedAt: new Date(NOW),
        deviceTs: new Date(NOW - 300),
        sensorId: 'vessel.mass',
        value: 1834.2,
        source: 'sim',
      },
    ]);
    expect(ingest.latest()['vessel.mass']).toEqual({
      value: 1834.2,
      ts: new Date(NOW - 300).toISOString(), // device time: within the 2 s tolerance
      receivedAt: new Date(NOW).toISOString(),
      source: 'sim',
    });
  });

  it.each([
    ['an unknown sensor topic', 'lab/mixline/mixer/sensors/nothing', reading()],
    ['another machine', 'lab/other/mixer/sensors/mass', reading()],
    ['a non-sensor topic', 'lab/mixline/state', reading()],
    ['broken JSON', 'lab/mixline/mixer/sensors/mass', '{"ts": '],
    ['binary garbage', 'lab/mixline/mixer/sensors/mass', Buffer.from([0xff, 0x00, 0xfe])],
    ['a wrong unit', 'lab/mixline/mixer/sensors/mass', reading({ unit: 'kg' })],
    [
      'a digital value of 2',
      'lab/mixline/mixer/sensors/base_pump_on',
      reading({ value: 2, unit: 'bool' }),
    ],
    ['an unknown enum code', 'lab/mixline/check/sensors/decision', reading({ value: 9, unit: '' })],
    ['a value as text', 'lab/mixline/mixer/sensors/mass', reading({ value: '1834' })],
    ['an extra field', 'lab/mixline/mixer/sensors/mass', reading({ quality: 'good' })],
    [
      'a local-time timestamp',
      'lab/mixline/mixer/sensors/mass',
      reading({ ts: '2026-10-28T13:00:00+03:00' }),
    ],
  ])('drops %s without throwing', (_case, topic, payload) => {
    const { ingest, rows } = setup();
    expect(ingest.handle(topic, payload, NOW)).toBe(false);
    expect(rows).toEqual([]);
    expect(ingest.latest()).toEqual({});
    expect(ingest.latestValues().size).toBe(0);
  });

  it('latestValues: value and received time (ms) per sensor, for the state logic', () => {
    const { ingest } = setup();
    ingest.handle('lab/mixline/mixer/sensors/mass', reading({ value: 1 }), NOW);
    ingest.handle('lab/mixline/mixer/sensors/mass', reading({ value: 2 }), NOW + 500);
    // The device time is an hour off: the state logic still uses the received time.
    ingest.handle(
      'lab/mixline/mixer/sensors/mixer_rpm',
      reading({ ts: new Date(NOW + 3_600_000).toISOString(), value: 180, unit: 'rpm' }),
      NOW + 700,
    );
    expect(ingest.latestValues()).toEqual(
      new Map([
        ['vessel.mass', { value: 2, receivedAt: NOW + 500 }],
        ['mixer.rpm', { value: 180, receivedAt: NOW + 700 }],
      ]),
    );
  });

  it('a device clock off by more than 2 s: charts get the received time, logged once per station', () => {
    const { ingest, logs } = setup();
    const offBy = (ms: number, at: number) =>
      ingest.handle(
        'lab/mixline/mixer/sensors/mass',
        reading({ ts: new Date(at + ms).toISOString() }),
        at,
      );

    offBy(3_600_000, NOW); // an hour ahead
    expect(ingest.latest()['vessel.mass']?.ts).toBe(new Date(NOW).toISOString());
    offBy(3_600_000, NOW + 1000);
    offBy(3_600_000, NOW + 2000);
    expect(logs).toEqual([
      'warn: device clock of station "mixer" is off by 3600000 ms (tolerance 2000 ms): charts use the received time',
    ]);

    offBy(100, NOW + 3000); // fixed
    expect(ingest.latest()['vessel.mass']?.ts).toBe(new Date(NOW + 3100).toISOString());
    expect(logs[1]).toBe('log: device clock of station "mixer" is back within tolerance');
    expect(logs).toHaveLength(2);
  });
});
