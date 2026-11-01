import { describe, expect, it } from 'vitest';

import { rawMachine, rawMachineWithTestLimits } from './__fixtures__/config.js';
import { machineSchema, type Sensor } from './machine.schema.js';
import {
  type LatestValue,
  machineStates,
  OFFLINE_AFTER_MS,
  sensorState,
  type State,
  stateChanges,
  toStateSnapshot,
  valueState,
  worstState,
} from './state.js';

/**
 * The limit logic is generic. The real machine.json has no limits (the PLC
 * owns them), so limit tests run on a copy with made-up TEST_LIMITS.
 */
const machine = machineSchema.parse(rawMachineWithTestLimits());
const realMachine = machineSchema.parse(rawMachine());
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

describe('valueState: generic limit logic (test limits)', () => {
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

describe('machineStates roll-up (real machine.json + test limits)', () => {
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

describe('toStateSnapshot: plain JSON for the WebSocket and GET /api/state', () => {
  it('keeps every id and survives a JSON round trip', () => {
    const st = machineStates(machine, readings({ 'color.deltaE': 7 }), NOW);
    const snap = toStateSnapshot(st);
    expect(snap.line).toBe('fault');
    expect(snap.sections.mixingColor).toBe('fault');
    expect(snap.subsections['mixingColor/color']).toBe('fault');
    expect(snap.components.camera).toBe('fault');
    expect(snap.sensors['color.deltaE']).toBe('fault');
    expect(Object.keys(snap.sensors)).toHaveLength(st.sensors.size);
    expect(Object.keys(snap.components)).toHaveLength(st.components.size);
    expect(Object.keys(snap.subsections)).toHaveLength(st.subsections.size);
    expect(Object.keys(snap.sections)).toHaveLength(st.sections.size);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

describe('stateChanges: only what changed, for the live push', () => {
  const okSnap = toStateSnapshot(machineStates(machine, readings(), NOW));

  it('sends everything when there is no previous snapshot', () => {
    expect(stateChanges(undefined, okSnap)).toEqual(okSnap);
  });

  it('is undefined when nothing changed (nothing to push)', () => {
    const again = toStateSnapshot(machineStates(machine, readings(), NOW + 500));
    expect(stateChanges(okSnap, again)).toBeUndefined();
  });

  it('lists only the changed ids, through every level', () => {
    const fault = toStateSnapshot(machineStates(machine, readings({ 'color.deltaE': 7 }), NOW));
    expect(stateChanges(okSnap, fault)).toEqual({
      line: 'fault',
      sections: { mixingColor: 'fault' },
      subsections: { 'mixingColor/color': 'fault' },
      components: { camera: 'fault' },
      sensors: { 'color.deltaE': 'fault' },
    });
  });

  it('leaves out the line and the groups that did not change', () => {
    const latest = readings({ 'cabinet.estop': 1 });
    const prev = toStateSnapshot(machineStates(machine, latest, NOW));
    latest.set('conveyor.slip', { value: 12, receivedAt: NOW });
    const next = toStateSnapshot(machineStates(machine, latest, NOW));
    const changes = stateChanges(prev, next);
    expect(changes).toEqual({
      sections: { conveyor: 'fault' },
      components: { conveyorMotor: 'fault' },
      sensors: { 'conveyor.slip': 'fault' },
    });
    expect(changes).not.toHaveProperty('line');
    expect(changes).not.toHaveProperty('subsections');
  });

  it('reports a recovery too (fault back to ok)', () => {
    const fault = toStateSnapshot(machineStates(machine, readings({ 'color.deltaE': 7 }), NOW));
    expect(stateChanges(fault, okSnap)?.line).toBe('ok');
    expect(stateChanges(fault, okSnap)?.sensors).toEqual({ 'color.deltaE': 'ok' });
  });

  it('reports going offline with time alone, with no new message', () => {
    const later = toStateSnapshot(machineStates(machine, readings(), NOW + OFFLINE_AFTER_MS + 1));
    const changes = stateChanges(okSnap, later);
    expect(changes?.line).toBe('offline');
    expect(Object.values(changes?.sensors ?? {}).every((s) => s === 'offline')).toBe(true);
    expect(Object.keys(changes?.sensors ?? {})).toHaveLength(allSensors.length);
  });
});

describe('the real machine.json: no limits yet, the PLC owns them', () => {
  it('has no limits on any sensor', () => {
    const withLimits = realMachine.components.flatMap((c) => c.sensors).filter((s) => s.limits);
    expect(withLimits.map((s) => s.id)).toEqual([]);
  });

  it('is only ok or offline, whatever the values', () => {
    const extremes = new Map<string, LatestValue>();
    for (const s of realMachine.components.flatMap((c) => c.sensors)) {
      extremes.set(s.id, { value: (s.sim?.max ?? 0) * 10 + 1, receivedAt: NOW });
    }
    const live = machineStates(realMachine, extremes, NOW);
    expect(new Set(live.sensors.values())).toEqual(new Set(['ok']));
    expect(live.line).toBe('ok');

    const silent = machineStates(realMachine, new Map(), NOW);
    expect(new Set(silent.sensors.values())).toEqual(new Set(['offline']));
    expect(silent.line).toBe('offline');
  });
});
