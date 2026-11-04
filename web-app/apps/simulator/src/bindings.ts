/**
 * The sensor table (owner, step 15: inside the simulator, checked against machine.json at
 * start-up). It says which sensor and which part of machine.json plays which role in this line's
 * process, for example "the vessel scale is vessel.mass". machine.json still gives every topic,
 * unit and range; only "how this line's process works" lives here.
 *
 * The simulator refuses to start when a sensor or part in the table is missing from machine.json,
 * or has another kind, unit or value words. A sensor that is not in the table keeps simulator
 * v1's behaviour (its nominal value plus a little noise).
 */
import type { Machine, MachineComponent, Sensor } from '@mixline/shared';

import { DYES, type Dye, type SimConfig, STACK_LIGHT_CODES } from './simConfig.js';

type Spec =
  | { id: string; kind: 'analog'; unit: string }
  | { id: string; kind: 'digital' | 'enum'; codes: Readonly<Record<number, string>> };

const analog = (id: string, unit: string): Spec => ({ id, kind: 'analog', unit });
const digital = (id: string, off: string, on: string): Spec => ({
  id,
  kind: 'digital',
  codes: { 0: `value.${off}`, 1: `value.${on}` },
});
const enumOf = (id: string, codes: Record<number, string>): Spec => ({
  id,
  kind: 'enum',
  codes: Object.fromEntries(Object.entries(codes).map(([k, v]) => [k, `value.${v}`])),
});

type DyeSuffix = 'Mass' | 'PumpOn' | 'PumpSteps' | 'PumpSpeed' | 'PumpLoad';

/** A dye tank's scale and its pump's signals (doc 02), e.g. cyanMass = dyeC.mass. */
const dyeSensors = <D extends Dye>(dye: D, letter: string) =>
  ({
    [`${dye}Mass`]: analog(`dye${letter}.mass`, 'g'),
    [`${dye}PumpOn`]: digital(`dye${letter}Pump.on`, 'off', 'on'),
    [`${dye}PumpSteps`]: analog(`dye${letter}Pump.steps`, 'steps'),
    [`${dye}PumpSpeed`]: analog(`dye${letter}Pump.speed`, 'steps/s'),
    [`${dye}PumpLoad`]: analog(`dye${letter}Pump.load`, 'raw'),
  }) as Record<`${D}${DyeSuffix}`, Spec>;

/** The role of every sensor of this line. */
export const SENSOR_TABLE = {
  bigTankLevel: analog('bigTank.level', 'mm'),
  bigTankVolume: analog('bigTank.volume', 'L'),
  bigTankLowFloat: digital('bigTank.lowFloat', 'normal', 'triggered'),
  magazineCount: analog('magazine.count', 'count'),
  vesselMass: analog('vessel.mass', 'g'),
  mixerRpm: analog('mixer.rpm', 'rpm'),
  vesselOverflow: digital('vessel.overflow', 'normal', 'triggered'),
  basePumpOn: digital('basePump.on', 'off', 'on'),
  basePumpCurrent: analog('basePump.current', 'A'),
  drainPumpOn: digital('drainPump.on', 'off', 'on'),
  drainPumpCurrent: analog('drainPump.current', 'A'),
  drainBucketFull: digital('drainBucket.full', 'normal', 'triggered'),
  fillingPumpOn: digital('fillingPump.on', 'off', 'on'),
  ...dyeSensors('cyan', 'C'),
  ...dyeSensors('magenta', 'M'),
  ...dyeSensors('yellow', 'Y'),
  ...dyeSensors('black', 'K'),
  colorL: analog('color.L', ''),
  colorA: analog('color.a', ''),
  colorB: analog('color.b', ''),
  colorDeltaE: analog('color.deltaE', ''),
  colorWhiteRef: analog('color.whiteRef', ''),
  samplePumpOn: digital('samplePump.on', 'off', 'on'),
  samplePumpDir: enumOf('samplePump.dir', { 0: 'stopped', 1: 'forward', [-1]: 'reverse' }),
  conveyorOn: digital('conveyor.on', 'off', 'on'),
  conveyorSpeedCmd: analog('conveyor.speedCmd', 'mm/s'),
  conveyorSpeed: analog('conveyor.speed', 'mm/s'),
  conveyorSlip: analog('conveyor.slip', '%'),
  feederPresent: digital('feederArrival.present', 'empty', 'present'),
  feederFingers: enumOf('feeder.fingers', { 0: 'holding', 1: 'releasing' }),
  fillingPresent: digital('fillingArrival.present', 'empty', 'present'),
  fillingPlatformUp: digital('filling.platformUp', 'down', 'up'),
  fillingMass: analog('filling.mass', 'g'),
  checkPresent: digital('checkArrival.present', 'empty', 'present'),
  checkPlatformUp: digital('check.platformUp', 'down', 'up'),
  checkMass: analog('check.mass', 'g'),
  checkDecision: enumOf('check.decision', { 0: 'none', 1: 'pass', 2: 'reject' }),
  lidCount: analog('check.lidCount', 'count'),
  rejectCount: analog('reject.count', 'count'),
  trayArrival: digital('tray.arrival', 'empty', 'present'),
  cabinetTemp: analog('cabinet.temp', 'C'),
  estop: digital('cabinet.estop', 'released', 'pressed'),
  mode: enumOf('cabinet.mode', { 0: 'manual', 1: 'auto' }),
  stackLight: enumOf(
    'cabinet.stackLight',
    Object.fromEntries(Object.entries(STACK_LIGHT_CODES).map(([word, code]) => [code, word])),
  ),
} as const satisfies Record<string, Spec>;
export type Role = keyof typeof SENSOR_TABLE;

/**
 * The parts a worker refills or empties between batches, named in the batch/refill message by
 * their machine.json id (owner, step 15).
 */
export const PART_TABLE = {
  bigTank: 'bigTank',
  cyanTank: 'dyeCTank',
  magentaTank: 'dyeMTank',
  yellowTank: 'dyeYTank',
  blackTank: 'dyeKTank',
  cups: 'containerMagazine',
  lids: 'lidMagazine',
  drainBucket: 'drainBucket',
  rejectBox: 'rejectBox',
  tray: 'batchTray',
} as const;
export type Part = keyof typeof PART_TABLE;

/** Conveyor stations by their id in machine.json's conveyor block. */
const STATIONS = { feeder: 'feeder', filling: 'filling', check: 'checkCap' } as const;

/** Everything the process needs from machine.json, checked. */
export interface Line {
  sensors: Readonly<Record<Role, Sensor>>;
  parts: Readonly<Record<Part, MachineComponent>>;
  container: { fillTargetG: number; perBatch: number; tareG: number };
  /** Floor area of the big tank, from its diameter: turns litres into a level. */
  bigTankAreaMm2: number;
  bigTankHeightMm: number;
  /** Conveyor positions (x, mm): stations one pitch apart, then the belt end. */
  stations: { feeder: number; filling: number; check: number; beltEnd: number; pitch: number };
}

export const dyeRole = <S extends DyeSuffix>(dye: Dye, suffix: S): `${Dye}${S}` =>
  `${dye}${suffix}`;

export const dyeTank = (dye: Dye) => `${dye}Tank` as const;

/** Reads the line out of machine.json; throws one error listing every problem. */
export function bindLine(machine: Machine, config: SimConfig): Line {
  const problems: string[] = [];
  const byId = new Map<string, Sensor>();
  for (const c of machine.components) for (const s of c.sensors) byId.set(s.id, s);

  const sensors: Partial<Record<Role, Sensor>> = {};
  for (const [role, spec] of Object.entries(SENSOR_TABLE) as [Role, Spec][]) {
    const sensor = byId.get(spec.id);
    if (!sensor) {
      problems.push(`${role}: no sensor "${spec.id}" in machine.json`);
      continue;
    }
    problems.push(...mismatches(role, spec, sensor));
    sensors[role] = sensor;
  }

  const parts: Partial<Record<Part, MachineComponent>> = {};
  for (const [part, id] of Object.entries(PART_TABLE) as [Part, string][]) {
    const component = machine.components.find((c) => c.id === id);
    if (component) parts[part] = component;
    else problems.push(`${part}: no part "${id}" in machine.json`);
  }

  const tank = parts.bigTank?.geometry;
  if (tank && tank.shape !== 'cylinder') problems.push('bigTank: should be a cylinder');
  const x = (id: string) => {
    const station = machine.conveyor.stations.find((s) => s.id === id);
    if (!station) problems.push(`conveyor: no station "${id}" in machine.json`);
    return station?.x ?? 0;
  };
  const stations = {
    feeder: x(STATIONS.feeder),
    filling: x(STATIONS.filling),
    check: x(STATIONS.check),
    beltEnd: machine.conveyor.endX,
    pitch: 0,
  };
  stations.pitch = stations.filling - stations.feeder;
  if (stations.pitch <= 0 || stations.check - stations.filling !== stations.pitch) {
    problems.push('conveyor: feeder, filling and check stations must be one equal pitch apart');
  }
  if (stations.beltEnd <= stations.check) {
    problems.push('conveyor: the belt must end after the check station');
  }

  const sizes = {
    tankFull: config.supplies.bigTankFullG,
    tankHolds: tank?.shape === 'cylinder' ? Math.PI * (tank.diameter / 2) ** 2 * tank.height : 0,
  };
  const batchG = machine.container.perBatch * machine.container.fillTargetG + config.batch.heelG;
  problems.push(
    ...rangeProblems([
      [sensors.vesselMass, batchG, 'the batch (6 cups and the heel)'],
      [sensors.magazineCount, config.supplies.cupsFull, 'supplies.cupsFull'],
      [sensors.lidCount, config.supplies.lidsFull, 'supplies.lidsFull'],
      [sensors.rejectCount, config.supplies.rejectBoxFull, 'supplies.rejectBoxFull'],
      ...DYES.map(
        (d) =>
          [
            sensors[dyeRole(d, 'Mass')],
            config.supplies.dyeTankFullG,
            'supplies.dyeTankFullG',
          ] as const,
      ),
    ]),
  );
  // 1 g of water is 1 cm³ = 1000 mm³.
  if (sizes.tankHolds && sizes.tankFull * 1000 > sizes.tankHolds) {
    problems.push('supplies.bigTankFullG: more than the big tank holds');
  }
  if (config.batch.firstPortionG >= batchG) {
    problems.push('batch.firstPortionG: must be less than the whole batch');
  }

  if (problems.length) {
    throw new Error(
      `the simulator's sensor table does not match machine.json (${String(problems.length)} problem(s)):\n${problems.map((p) => `- ${p}`).join('\n')}`,
    );
  }
  const cylinder = tank?.shape === 'cylinder' ? tank : { diameter: 0, height: 0 };
  return {
    sensors: sensors as Record<Role, Sensor>,
    parts: parts as Record<Part, MachineComponent>,
    container: {
      fillTargetG: machine.container.fillTargetG,
      perBatch: machine.container.perBatch,
      tareG: machine.container.tareG,
    },
    bigTankAreaMm2: Math.PI * (cylinder.diameter / 2) ** 2,
    bigTankHeightMm: cylinder.height,
    stations,
  };
}

function mismatches(role: Role, spec: Spec, sensor: Sensor): string[] {
  if (sensor.kind !== spec.kind) {
    return [`${role}: "${spec.id}" is ${sensor.kind}, the simulator needs ${spec.kind}`];
  }
  if (spec.kind === 'analog') {
    return sensor.unit === spec.unit
      ? []
      : [`${role}: "${spec.id}" has unit "${sensor.unit}", the simulator needs "${spec.unit}"`];
  }
  const labels = sensor.valueLabels ?? {};
  return Object.entries(spec.codes)
    .filter(([code, key]) => labels[code] !== key)
    .map(([code, key]) => `${role}: "${spec.id}" code ${code} should mean ${key}`);
}

/** The simulator keeps every value inside the sensor's sim range. */
function rangeProblems(
  checks: readonly (readonly [Sensor | undefined, number, string])[],
): string[] {
  return checks
    .filter(([sensor, value]) => sensor?.sim && value > sensor.sim.max)
    .map(
      ([sensor, value, what]) =>
        `${what}: ${String(value)} is above ${sensor?.id ?? ''}'s sim range (max ${String(sensor?.sim?.max)})`,
    );
}
