import { type LatestReading, machineSchema } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import machineJson from '../../../../config/machine.json';
import { type Belt, EMPTY_BELT, endStop, follow, FORGET_AFTER_MS, tubsOnBelt, xAt } from './onBelt';

const machine = machineSchema.parse(machineJson);
const { conveyor } = machine;
const T0 = Date.parse('2026-11-09T12:00:00.000Z');
const x = (station: string) => conveyor.stations.find((s) => s.id === station)?.x ?? NaN;

/** The readings the scene holds, each with the time of its last message. */
type Values = Record<string, number>;
let readings: Record<string, LatestReading> = {};
const at = (s: number, values: Values) => {
  const ts = new Date(T0 + s * 1000).toISOString();
  for (const [id, value] of Object.entries(values)) {
    // Like the live data: a sensor's latest reading, its time when it last changed or beat.
    readings = { ...readings, [id]: { value, ts, receivedAt: ts, source: 'sim' } };
  }
  return { readings, now: T0 + s * 1000 };
};

/** Feeds updates in order: [seconds, the sensors that changed]; returns the belt after them. */
function run(...steps: [number, Values][]): { belt: Belt; now: number } {
  readings = {};
  let belt = EMPTY_BELT;
  let now = T0;
  for (const [s, values] of steps) {
    const update = at(s, values);
    now = update.now;
    belt = follow(machine, belt, update.readings, now);
  }
  return { belt, now };
}
const everywhere = () => true;
const shown = (r: { belt: Belt; now: number }) =>
  tubsOnBelt(machine, r.belt, readings, r.now, everywhere);

const stopped = { 'conveyor.on': 0 };
const empty = {
  'feederArrival.present': 0,
  'fillingArrival.present': 0,
  'checkArrival.present': 0,
  'beltEnd.present': 0,
};

describe('containers follow the belt (owner, step 17, option b)', () => {
  it('appears where a station sees one: an empty container at the feeder, on the belt', () => {
    const now = run([0, { ...stopped, ...empty }], [1, { 'feederArrival.present': 1 }]);
    expect(shown(now)).toEqual([
      {
        id: 1,
        position: [x('feeder'), conveyor.surfaceY, conveyor.centerlineZ],
        ml: 0,
        lid: false,
      },
    ]);
  });

  it('slides at the belt speed while it runs, and stops where the belt stopped', () => {
    const moving = run(
      [0, { ...stopped, ...empty, 'feederArrival.present': 1 }],
      [10, { 'conveyor.on': 1, 'feederArrival.present': 0 }],
    );
    const [tub] = moving.belt.tubs;
    if (!tub) throw new Error('no tub');
    // 1.5 s after the start, 150 mm further at 100 mm/s.
    expect(xAt(machine, moving.belt, tub, T0 + 11_500)).toBeCloseTo(x('feeder') + 150, 6);

    const after = run(
      [0, { ...stopped, ...empty, 'feederArrival.present': 1 }],
      [10, { 'conveyor.on': 1, 'feederArrival.present': 0 }],
      [12, { 'conveyor.on': 0 }],
    );
    expect(after.belt.tubs[0]?.x).toBeCloseTo(x('feeder') + 2 * conveyor.speedMmPerS, 6);
  });

  it('is put on the station when its sensor sees it; fills there while lifted', () => {
    const pitch = x('filling') - x('feeder');
    const seconds = pitch / conveyor.speedMmPerS;
    const r = run(
      [0, { ...stopped, ...empty, 'feederArrival.present': 1 }],
      [10, { 'conveyor.on': 1, 'feederArrival.present': 0 }],
      // The estimate is 20 mm short: the arrival sensor puts it right.
      [10 + seconds - 0.2, { 'conveyor.on': 0, 'fillingArrival.present': 1 }],
      [20, { 'filling.platformUp': 1, 'filling.mass': 120 }],
    );
    const [tub] = shown(r);
    expect(tub?.position[0]).toBe(x('filling'));
    expect(tub?.position[1]).toBe(conveyor.surfaceY + conveyor.liftMm);
    expect(tub?.ml).toBe(120);
    expect(r.belt.tubs).toHaveLength(1);
  });

  it('keeps its fill when lowered and on its way; gets its lid at the check once it passes', () => {
    const r = run(
      [0, { ...stopped, ...empty, 'fillingArrival.present': 1 }],
      [1, { 'filling.platformUp': 1, 'filling.mass': 350.2 }],
      [2, { 'filling.platformUp': 0, 'filling.mass': 0.1 }],
      [5, { 'conveyor.on': 1, 'fillingArrival.present': 0 }],
      [8, { 'conveyor.on': 0, 'checkArrival.present': 1 }],
      [9, { 'check.platformUp': 1, 'check.mass': 349.9, 'check.decision': 0 }],
      [10, { 'check.decision': 1 }],
      // The lid's weight on the check scale is not liquid.
      [11, { 'check.mass': 355.9 }],
    );
    expect(shown(r)).toEqual([expect.objectContaining({ ml: 349.9, lid: true })]);
  });

  it('goes when it is pushed off at the check (the belt standing still)', () => {
    const r = run(
      [0, { ...stopped, ...empty, 'checkArrival.present': 1 }],
      [1, { 'check.decision': 2 }],
      [3, { 'checkArrival.present': 0 }],
    );
    expect(r.belt.tubs).toEqual([]);
  });

  it('waits at the end stop and goes when taken, even if the belt starts at once', () => {
    const toEnd = (endStop(machine) - 1150) / conveyor.speedMmPerS;
    const r = run(
      [0, { ...stopped, ...empty, 'checkArrival.present': 1, 'check.decision': 1 }],
      [5, { 'conveyor.on': 1, 'checkArrival.present': 0 }],
      [8, { 'conveyor.on': 0 }],
      // At 1150 now, between the check and the end: no sensor, still followed.
      [20, { 'conveyor.on': 1 }],
      [20 + toEnd, { 'conveyor.on': 0, 'beltEnd.present': 1 }],
    );
    expect(shown(r)).toEqual([
      expect.objectContaining({
        position: [x('end'), conveyor.surfaceY, conveyor.centerlineZ],
        lid: true,
      }),
    ]);
    const taken = run(
      [0, { ...stopped, ...empty, 'beltEnd.present': 1 }],
      [5, { 'beltEnd.present': 0, 'conveyor.on': 1 }],
    );
    expect(taken.belt.tubs).toEqual([]);
  });

  it('never slides past the end stop', () => {
    const r = run([0, { ...stopped, ...empty, 'beltEnd.present': 1 }], [1, { 'conveyor.on': 1 }]);
    const [tub] = r.belt.tubs;
    if (!tub) throw new Error('no tub');
    expect(xAt(machine, r.belt, tub, T0 + 60_000)).toBe(endStop(machine));
  });

  it('forgets a container nobody has seen for a long time', () => {
    const r = run(
      [0, { ...stopped, ...empty, 'checkArrival.present': 1 }],
      [1, { 'conveyor.on': 1, 'checkArrival.present': 0 }],
      [4, { 'conveyor.on': 0 }],
      [4 + FORGET_AFTER_MS / 1000 + 1, { 'feederArrival.present': 0 }],
    );
    expect(r.belt.tubs).toEqual([]);
  });

  it('draws only where the nearest station is on the page', () => {
    const r = run([
      0,
      { ...stopped, ...empty, 'feederArrival.present': 1, 'fillingArrival.present': 1 },
    ]);
    const tubs = tubsOnBelt(
      machine,
      r.belt,
      readings,
      r.now,
      (id) => id === 'fillingArrival.present',
    );
    expect(tubs.map((t) => t.position[0])).toEqual([x('filling')]);
  });
});
