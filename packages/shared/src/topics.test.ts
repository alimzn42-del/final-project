import { describe, expect, it } from 'vitest';

import { rawMachine } from './__fixtures__/config.js';
import { machineSchema } from './machine.schema.js';
import {
  batchTopic,
  healthTopic,
  parseTopic,
  sensorsByTopic,
  sensorTopic,
  stateTopic,
  subscriptions,
  twinTopic,
} from './topics.js';

const machine = machineSchema.parse(rawMachine());
const root = { site: 'lab', machine: 'mixline' };

describe('topic builders', () => {
  it('builds the doc 04 example topic for the vessel scale', () => {
    expect(sensorTopic(root, { station: 'mixer', variable: 'mass' })).toBe(
      'lab/mixline/mixer/sensors/mass',
    );
  });

  it('builds every topic form', () => {
    const s = { station: 'dye_c', variable: 'mass' };
    expect(twinTopic(root, s)).toBe('lab/mixline/dye_c/twin/mass');
    expect(healthTopic(root, 'dye_c', 'dyeCPump')).toBe('lab/mixline/dye_c/health/dyeCPump');
    expect(stateTopic(root)).toBe('lab/mixline/state');
    expect(batchTopic(root, 'started')).toBe('lab/mixline/batch/started');
  });

  it('gives the subscription patterns', () => {
    expect(subscriptions(root)).toEqual({
      sensors: 'lab/mixline/+/sensors/+',
      state: 'lab/mixline/state',
      batch: 'lab/mixline/batch/+',
    });
  });

  it('takes site and machine from machine.json', () => {
    expect(stateTopic(machine)).toBe('lab/mixline/state');
  });
});

describe('parseTopic', () => {
  it('reads every topic form', () => {
    expect(parseTopic(root, 'lab/mixline/mixer/sensors/mass')).toEqual({
      kind: 'sensor',
      station: 'mixer',
      variable: 'mass',
    });
    expect(parseTopic(root, 'lab/mixline/dye_c/twin/mass')).toEqual({
      kind: 'twin',
      station: 'dye_c',
      variable: 'mass',
    });
    expect(parseTopic(root, 'lab/mixline/dye_c/health/dyeCPump')).toEqual({
      kind: 'health',
      station: 'dye_c',
      component: 'dyeCPump',
    });
    expect(parseTopic(root, 'lab/mixline/state')).toEqual({ kind: 'state' });
    expect(parseTopic(root, 'lab/mixline/batch/finished')).toEqual({
      kind: 'batch',
      event: 'finished',
    });
  });

  it('round-trips every sensor topic in machine.json', () => {
    for (const c of machine.components) {
      for (const s of c.sensors) {
        expect(parseTopic(machine, sensorTopic(machine, s))).toEqual({
          kind: 'sensor',
          station: s.station,
          variable: s.variable,
        });
      }
    }
  });

  it.each([
    ['another site', 'plant/mixline/mixer/sensors/mass'],
    ['another machine', 'lab/other/mixer/sensors/mass'],
    ['an unknown type', 'lab/mixline/mixer/values/mass'],
    ['an unknown batch event', 'lab/mixline/batch/exploded'],
    ['too many segments', 'lab/mixline/mixer/sensors/mass/extra'],
    ['too few segments', 'lab/mixline/mixer/sensors'],
    ['an empty segment', 'lab/mixline//sensors/mass'],
    ['a trailing slash', 'lab/mixline/state/'],
  ])('rejects %s', (_case, topic) => {
    expect(parseTopic(root, topic)).toBeUndefined();
  });
});

describe('sensorsByTopic', () => {
  it('maps all 60 sensor topics to their sensors', () => {
    const map = sensorsByTopic(machine);
    expect(map.size).toBe(60);
    expect(map.get('lab/mixline/mixer/sensors/mass')?.id).toBe('vessel.mass');
    expect(map.get('lab/mixline/check/sensors/decision')?.id).toBe('check.decision');
  });
});
