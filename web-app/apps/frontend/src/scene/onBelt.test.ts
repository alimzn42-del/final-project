import { type LatestReading, machineSchema } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import machineJson from '../../../../config/machine.json';
import { remember, type TubMemory, tubsOnBelt } from './onBelt';

const machine = machineSchema.parse(machineJson);
const ts = '2026-11-09T12:00:00.000Z';
const read = (values: Record<string, number>): Record<string, LatestReading> =>
  Object.fromEntries(
    Object.entries(values).map(([id, value]) => [id, { value, ts, receivedAt: ts, source: 'sim' }]),
  );
const everywhere = () => true;
const at = (station: string) => machine.conveyor.stations.find((s) => s.id === station)?.x;

/** Feeds readings one after another, as they arrive, and returns the tubs after the last. */
function after(...steps: Record<string, number>[]) {
  let memory: TubMemory = new Map();
  let tubs = tubsOnBelt(machine, {}, memory, everywhere);
  for (const step of steps) {
    const readings = read(step);
    memory = remember(machine, readings, memory);
    tubs = tubsOnBelt(machine, readings, memory, everywhere);
  }
  return tubs;
}

describe('containers on the belt (owner, step 17: only while a sensor sees one)', () => {
  it('shows none before any reading, and none where the sensor sees nothing', () => {
    expect(after()).toEqual([]);
    expect(after({ 'feederArrival.present': 0 })).toEqual([]);
  });

  it('shows an empty one at the feeder, standing on the belt', () => {
    const [tub] = after({ 'feederArrival.present': 1 });
    const { surfaceY, centerlineZ } = machine.conveyor;
    expect(tub).toEqual({
      station: 'feeder',
      position: [at('feeder'), surfaceY, centerlineZ],
      fillMl: 0,
      lid: false,
    });
  });

  it('fills at the filling station while lifted, keeps the fill when lowered, starts empty again', () => {
    const lifted = after(
      { 'fillingArrival.present': 1, 'filling.platformUp': 0, 'filling.mass': 0 },
      { 'fillingArrival.present': 1, 'filling.platformUp': 1, 'filling.mass': 120 },
    );
    expect(lifted[0]?.fillMl).toBe(120);
    expect(lifted[0]?.position[1]).toBe(machine.conveyor.surfaceY + machine.conveyor.liftMm);

    const lowered = after(
      { 'fillingArrival.present': 1, 'filling.platformUp': 1, 'filling.mass': 350.2 },
      { 'fillingArrival.present': 1, 'filling.platformUp': 0, 'filling.mass': 0.1 },
    );
    expect(lowered[0]?.fillMl).toBe(350.2);
    expect(lowered[0]?.position[1]).toBe(machine.conveyor.surfaceY);

    const next = after(
      { 'fillingArrival.present': 1, 'filling.platformUp': 1, 'filling.mass': 350.2 },
      { 'fillingArrival.present': 0, 'filling.platformUp': 0, 'filling.mass': 0 },
      { 'fillingArrival.present': 1, 'filling.platformUp': 0, 'filling.mass': 0 },
    );
    expect(next[0]?.fillMl).toBe(0);
  });

  it('puts the lid on at the check station once the cup passes, and at the end of the belt', () => {
    const weighed = { 'checkArrival.present': 1, 'check.platformUp': 1, 'check.mass': 349.8 };
    expect(after({ ...weighed, 'check.decision': 0 })[0]?.lid).toBe(false);
    expect(after({ ...weighed, 'check.decision': 2 })[0]?.lid).toBe(false);
    expect(after({ ...weighed, 'check.decision': 1 })[0]?.lid).toBe(true);

    const end = after(weighed, {
      'checkArrival.present': 0,
      'check.platformUp': 0,
      'check.mass': 0,
      'beltEnd.present': 1,
    });
    expect(end).toEqual([expect.objectContaining({ station: 'end', fillMl: 349.8, lid: true })]);
    expect(end[0]?.position[0]).toBe(at('end'));
  });

  it('draws only where the station sensor is visible on the page', () => {
    const readings = read({ 'feederArrival.present': 1, 'fillingArrival.present': 1 });
    const memory = remember(machine, readings, new Map());
    const tubs = tubsOnBelt(machine, readings, memory, (id) => id === 'fillingArrival.present');
    expect(tubs.map((t) => t.station)).toEqual(['filling']);
  });
});
