import { brimVolume, machineSchema } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import { bindLine, PART_TABLE, SENSOR_TABLE } from './bindings.js';
import { parseSimConfig } from './simConfig.js';
import { rawMachine, rawSimConfig, realMachine, realSimConfig } from './testing.js';

type Json = Record<string, unknown>;
const components = (m: Json) => m.components as Json[];
const sensorsOf = (m: Json) => components(m).flatMap((c) => c.sensors as Json[]);
const bind =
  (m: Json, config = realSimConfig()) =>
  () =>
    bindLine(machineSchema.parse(m), config);

describe('the sensor table against machine.json', () => {
  it('binds every role and part of the real line', () => {
    const line = bindLine(realMachine(), realSimConfig());
    expect(line.sensors.vesselMass.id).toBe('vessel.mass');
    expect(line.sensors.cyanPumpSteps.id).toBe('dyeCPump.steps');
    expect(line.parts.cups.id).toBe('containerMagazine');
    // Owner, step 17: the measured tub; its inside holds about the estimated 500 ml.
    expect(line.container).toMatchObject({ baseDiameter: 79, topDiameter: 113, height: 77 });
    expect(brimVolume(line.tub)).toBeGreaterThan(450);
    expect(brimVolume(line.tub)).toBeLessThan(550);
    // The end stop: one container radius before the belt's end (owner, step 17).
    expect(line.stations).toEqual({
      feeder: 250,
      filling: 550,
      check: 850,
      end: 1293.5,
      beltEnd: 1350,
      pitch: 300,
    });
    expect(line.parts.waterContainer.id).toBe('waterContainer');
    // Ø250: 1 L of water stands 20.4 mm high.
    expect(1e6 / line.bigTankAreaMm2).toBeCloseTo(20.37, 2);
  });

  it('covers all 54 sensors of this line, so none falls back to simulator v1', () => {
    const ids = new Set(Object.values(SENSOR_TABLE).map((s) => s.id));
    const all = realMachine().components.flatMap((c) => c.sensors.map((s) => s.id));
    expect(all).toHaveLength(54);
    expect(all.filter((id) => !ids.has(id))).toEqual([]);
    expect(ids.size).toBe(Object.keys(SENSOR_TABLE).length);
    expect(new Set(Object.values(PART_TABLE)).size).toBe(Object.keys(PART_TABLE).length);
  });

  it('refuses a machine without a sensor or part it needs, naming each one', () => {
    const m = rawMachine();
    m.components = components(m)
      .filter((c) => c.id !== 'drainBucket')
      .map((c) => ({
        ...c,
        sensors: (c.sensors as Json[]).filter((s) => s.id !== 'vessel.mass'),
      }));
    expect(bind(m)).toThrow(/vesselMass: no sensor "vessel\.mass"[\s\S]*drainBucket: no part/);
  });

  it('refuses another kind, unit or value word', () => {
    const m = rawMachine();
    for (const s of sensorsOf(m)) {
      if (s.id === 'filling.mass') Object.assign(s, { unit: 'kg', measures: undefined });
      if (s.id === 'samplePump.dir')
        s.valueLabels = { '0': 'value.stopped', '1': 'value.reverse', '-1': 'value.forward' };
    }
    expect(bind(m)).toThrow(
      /code 1 should mean value\.forward[\s\S]*fillingMass: "filling\.mass" has unit "kg"/,
    );
  });

  it('refuses stations that are not one equal pitch apart', () => {
    const m = rawMachine();
    const conveyor = m.conveyor as { stations: { id: string; x: number }[] };
    const check = conveyor.stations.find((s) => s.id === 'checkCap');
    if (check) check.x = 900;
    expect(bind(m)).toThrow(/one equal pitch apart/);
  });

  it("refuses supplies that would leave a sensor's sim range", () => {
    const raw = rawSimConfig();
    raw.supplies = { ...raw.supplies, rejectBoxFull: 40, bigTankFullG: 20000 };
    expect(bind(rawMachine(), parseSimConfig(raw))).toThrow(
      /rejectBoxFull: 40 is above reject\.count's sim range[\s\S]*more than the big tank holds/,
    );
  });

  it('refuses an order the vessel scale or the container cannot take (owner, step 17)', () => {
    const raw = rawSimConfig();
    raw.order = { ...raw.order, containersMax: 12 };
    expect(bind(rawMachine(), parseSimConfig(raw))).toThrow(
      /the largest batch \(12 containers and the heel\): 4400 is above vessel\.mass's sim range/,
    );
    const full = rawSimConfig();
    full.order = { ...full.order, fillG: 600 };
    expect(bind(rawMachine(), parseSimConfig(full))).toThrow(
      /order\.fillG: 600 g is more than the container holds \(\d+ ml\)/,
    );
  });
});
