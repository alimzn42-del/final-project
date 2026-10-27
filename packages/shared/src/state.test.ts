import { describe, expect, it } from 'vitest';

import { rawMachine } from './__fixtures__/config.js';
import { machineSchema, type Sensor } from './machine.schema.js';
import {
  type LatestValue,
  machineStates,
  OFFLINE_AFTER_MS,
  sensorState,
  type State,
  valueState,
  worstState,
} from './state.js';

const machine = machineSchema.parse(rawMachine());
const allSensors = machine.components.flatMap((c) => c.sensors);
function sensor(id: string): Sensor {
  const s = allSensors.find((x) => x.id === id);
  if (!s) throw new Error(`no sensor ${id}`);
  return s;
}

const NOW = Date.parse('2026-10-27T12:00:00.000Z');

/** Every sensor at its nominal value, just received; then apply overrides. */
function readings(overrides: Record<string, number> = {}, receivedAt = NOW) {
  const map = new Map<string, LatestValue>();
  for (const s of allSensors) {
    const value = overrides[s.id] ?? s.sim?.nominal ?? 0;
    map.set(s.id, { value, receivedAt });
  }
  return map;
}

describe('valueState: limits from machine.json', () => {
  it('treats "below" as strictly below: the limit value itself is OK', () => {
    const dye = sensor('dyeC.mass'); // warnBelow 150, faultBelow 60
    expect(valueState(dye, 150)).toBe('ok');
    expect(valueState(dye, 149.9)).toBe('warning');
    expect(valueState(dye, 60)).toBe('warning');
    expect(valueState(dye, 59.9)).toBe('fault');
  });

  it('treats "above" as strictly above', () => {
    const slip = sensor('conveyor.slip'); // warnAbove 5, faultAbove 10
    expect(valueState(slip, 5)).toBe('ok');
    expect(valueState(slip, 5.1)).toBe('warning');
    expect(valueState(slip, 10.1)).toBe('fault');
  });

  it('applies warnBelow and warnAbove together (fill weight window)', () => {
    const fill = sensor('filling.mass'); // warnBelow 291, warnAbove 309
    expect(valueState(fill, 300)).toBe('ok');
    expect(valueState(fill, 290)).toBe('warning');
    expect(valueState(fill, 310)).toBe('warning');
  });

  it('uses faultWhen for digital sensors', () => {
    const estop = sensor('cabinet.estop'); // faultWhen 1
    expect(valueState(estop, 0)).toBe('ok');
    expect(valueState(estop, 1)).toBe('fault');
  });

  it('lets fault beat warning when both match', () => {
    const s: Sensor = { ...sensor('basePump.on'), limits: { warnWhen: 1, faultWhen: 1 } };
    expect(valueState(s, 1)).toBe('fault');
  });

  it('is OK for a sensor without limits', () => {
    expect(valueState(sensor('mixer.rpm'), 9999)).toBe('ok');
  });
});

describe('sensorState: offline after 10 s without a message', () => {
  const s = sensor('vessel.mass');
  it('is offline when nothing was ever received', () => {
    expect(sensorState(s, undefined, NOW)).toBe('offline');
  });

  it('is still online at exactly 10 s, offline just after', () => {
    expect(sensorState(s, { value: 1800, receivedAt: NOW - OFFLINE_AFTER_MS }, NOW)).toBe('ok');
    expect(sensorState(s, { value: 1800, receivedAt: NOW - OFFLINE_AFTER_MS - 1 }, NOW)).toBe(
      'offline',
    );
  });

  it('shows offline, not the old value, once the data is stale', () => {
    const estop = sensor('cabinet.estop');
    expect(sensorState(estop, { value: 1, receivedAt: NOW - 60_000 }, NOW)).toBe('offline');
  });
});

describe('worstState: doc 03 ranking', () => {
  it.each<[State[], State]>([
    [['ok', 'warning', 'offline'], 'warning'],
    [['ok', 'offline'], 'offline'],
    [['offline', 'fault', 'warning'], 'fault'],
    [['ok', 'none'], 'ok'],
    [['none', 'none'], 'none'],
    [[], 'none'],
  ])('%j -> %s', (states, expected) => {
    expect(worstState(states)).toBe(expected);
  });
});

describe('machineStates on the real machine.json', () => {
  it('is all OK when every sensor is at its nominal value', () => {
    const st = machineStates(machine, readings(), NOW);
    expect(st.line).toBe('ok');
    expect([...st.sections.values()].every((s) => s === 'ok')).toBe(true);
    expect(st.components.get('vessel')).toBe('ok');
    expect(st.components.get('pedestal')).toBe('none'); // no sensors
    expect(st.components.get('table')).toBe('none');
  });

  it('shows a fault from level 1: camera ΔE too high -> color -> Mixing & Color -> line', () => {
    const st = machineStates(machine, readings({ 'color.deltaE': 7 }), NOW);
    expect(st.sensors.get('color.deltaE')).toBe('fault');
    expect(st.components.get('camera')).toBe('fault');
    expect(st.subsections.get('mixingColor/color')).toBe('fault');
    expect(st.subsections.get('mixingColor/mixing')).toBe('ok');
    expect(st.sections.get('mixingColor')).toBe('fault');
    expect(st.sections.get('conveyor')).toBe('ok');
    expect(st.line).toBe('fault');
  });

  it('does not roll a child up into its parent (grouping only)', () => {
    const st = machineStates(machine, readings({ 'color.deltaE': 7 }), NOW);
    expect(st.components.get('colorBox')).toBe('none');
  });

  it('shows the state of a pending part (pending is a look, not a state)', () => {
    const st = machineStates(machine, readings({ 'check.mass': 280 }), NOW);
    expect(machine.components.find((c) => c.id === 'checkPlatform')?.status).toBe('pending');
    expect(st.components.get('checkPlatform')).toBe('warning');
    expect(st.subsections.get('conveyor/checkCap')).toBe('warning');
    expect(st.line).toBe('warning');
  });

  it('counts parts without a subsection in their section (conveyor motor)', () => {
    const st = machineStates(machine, readings({ 'conveyor.slip': 12 }), NOW);
    expect(st.components.get('conveyorMotor')).toBe('fault');
    expect([...st.subsections.entries()].filter(([k]) => k.startsWith('conveyor/'))).toEqual(
      expect.arrayContaining([['conveyor/feeder', 'ok']]),
    );
    expect(st.sections.get('conveyor')).toBe('fault');
  });

  it('is offline everywhere when no data has arrived', () => {
    const st = machineStates(machine, new Map(), NOW);
    expect(st.line).toBe('offline');
    expect(st.components.get('vessel')).toBe('offline');
    expect(st.components.get('pedestal')).toBe('none');
  });

  it('lets a fault win over offline parts elsewhere', () => {
    const latest = readings({ 'cabinet.estop': 1 });
    latest.set('vessel.mass', { value: 1800, receivedAt: NOW - 30_000 });
    const st = machineStates(machine, latest, NOW);
    expect(st.components.get('vessel')).toBe('offline');
    expect(st.sections.get('mixingColor')).toBe('offline');
    expect(st.sections.get('cabinet')).toBe('fault');
    expect(st.line).toBe('fault');
  });
});
