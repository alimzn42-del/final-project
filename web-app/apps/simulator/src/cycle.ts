/**
 * The full-cycle check (plan step 15 acceptance: "masses balance across scales"), run with
 * `pnpm sim:check --cycle`. It uses only what was published on MQTT, the way the backend or a
 * person with an MQTT client would see it, never the simulator's insides:
 *
 * - the batch steps arrive in order, 6 containers are counted, the final ΔE is within tolerance
 *   and the rinse ends with clear water;
 * - every dye dose: the dye tank's scale drops by what the vessel's scale gains, and the dose's
 *   steps × calibrated grams per step agree;
 * - every fill: the vessel drops by what the cup on the filling scale gains, and the check scale
 *   reads the same cup again;
 * - every base pump run: the big tank's level (no scale) falls by what the vessel gains;
 * - the refill message after the batch removes as many cups from the tray as passed the check.
 *
 * Pure analysis of a list of messages, so tests feed it a simulated batch.
 */
import {
  type BatchEventPayload,
  decodeBatchMessage,
  type Machine,
  parseTopic,
  type RefillEventPayload,
  sensorsByTopic,
} from '@mixline/shared';

import { dyeRole, PART_TABLE, type Role, SENSOR_TABLE } from './bindings.js';
import { DYES, type SimConfig } from './simConfig.js';

export interface Heard {
  topic: string;
  payload: unknown;
}

export type CheckResult = [name: string, problems: string[]];

/** Scale noise and rounding on both readings of a pair (two scales, before and after). */
const SCALE_TOLERANCE_G = 1.5;
/** The ultrasonic level has 1 mm steps and ±1 mm noise: about 50 g per mm in a Ø250 tank. */
const LEVEL_TOLERANCE_G = 200;

interface Point {
  t: number;
  v: number;
}

/** Sensor ids from the sensor table, so the check reads the same sensors the process drives. */
const id = (role: Role) => SENSOR_TABLE[role].id;
const PUMPS_ON: Role[] = [
  'basePumpOn',
  'drainPumpOn',
  'fillingPumpOn',
  'samplePumpOn',
  ...DYES.map((d) => dyeRole(d, 'PumpOn')),
];

export function checkCycle(
  machine: Machine,
  config: SimConfig,
  heard: readonly Heard[],
): CheckResult[] {
  const byTopic = sensorsByTopic(machine);
  const series = new Map<string, Point[]>();
  const batch: { event: string; p: BatchEventPayload; t: number }[] = [];
  const refills: { p: RefillEventPayload; t: number }[] = [];
  const invalid: string[] = [];

  for (const { topic, payload } of heard) {
    const parsed = parseTopic(machine, topic);
    if (parsed?.kind === 'sensor') {
      const sensor = byTopic.get(topic);
      const r = payload as { ts?: string; value?: number };
      if (!sensor || typeof r.value !== 'number' || typeof r.ts !== 'string') continue;
      const list = series.get(sensor.id) ?? [];
      list.push({ t: Date.parse(r.ts), v: r.value });
      series.set(sensor.id, list);
    } else if (parsed?.kind === 'batch') {
      const decoded = decodeBatchMessage(machine, parsed.event, payload);
      if (!decoded.ok) {
        invalid.push(decoded.error);
        continue;
      }
      const t = Date.parse(decoded.value.payload.ts);
      if (decoded.value.event === 'refill') refills.push({ p: decoded.value.payload, t });
      else batch.push({ event: decoded.value.event, p: decoded.value.payload, t });
    }
  }
  for (const list of series.values()) list.sort((a, b) => a.t - b.t);

  // One whole batch: the first `started` with a `finished` after it.
  const startIndex = batch.findIndex((b) => b.event === 'started');
  const start = batch[startIndex];
  const end = batch.find(
    (b, i) => i > startIndex && b.event === 'finished' && b.p.batchId === start?.p.batchId,
  );
  if (!start || !end) {
    return [
      ['one full batch (started to finished) was heard', ['no complete batch in the messages']],
    ];
  }
  const inBatch = batch.filter((b) => b.p.batchId === start.p.batchId);
  const within = (sensorId: string) =>
    (series.get(sensorId) ?? []).filter((p) => p.t >= start.t - 5000 && p.t <= end.t + 2000);
  const results: CheckResult[] = [];

  results.push(['every batch message passes its format', invalid.slice(0, 5)]);

  // Steps in order (doc 01), with 0 to max corrections.
  const steps = inBatch
    .filter((b, i, all) => b.event !== 'step' || b.p.step !== all[i - 1]?.p.step)
    .map((b) => (b.event === 'step' ? b.p.step : `${b.event}:${b.p.step}`))
    .join(' ');
  const order = new RegExp(
    `^started:baseFill dyeDose mix sample( correct mix sample){0,${String(config.batch.maxCorrections)}} complete mix finalCheck filling rinse finished:rinse$`,
  );
  results.push([`the steps come in order (${start.p.batchId})`, order.test(steps) ? [] : [steps]]);

  const counted = inBatch
    .filter((b) => b.event === 'step' && b.p.step === 'filling')
    .map((b) => b.p.containersDone);
  const perBatch = machine.container.perBatch;
  const expected = Array.from({ length: perBatch + 1 }, (_, i) => i);
  results.push([
    `${String(perBatch)} containers are counted`,
    counted.join() === expected.join() ? [] : [`containersDone went ${counted.join(', ')}`],
  ]);

  // Colour: within tolerance before filling; clear water at the end of the rinse.
  const fillingAt = inBatch.find((b) => b.p.step === 'filling')?.t ?? end.t;
  const last = (role: Role, t: number) =>
    within(id(role))
      .filter((p) => p.t <= t)
      .at(-1)?.v;
  const finalDeltaE = last('colorDeltaE', fillingAt);
  results.push([
    `the final check is within ΔE ${String(config.batch.toleranceDeltaE)}`,
    finalDeltaE !== undefined && finalDeltaE <= config.batch.toleranceDeltaE
      ? []
      : [`ΔE ${String(finalDeltaE)} before filling`],
  ]);
  const rinseDeltaE = last('colorDeltaE', end.t);
  results.push([
    'the rinse ends with clear water',
    rinseDeltaE !== undefined && rinseDeltaE <= config.rinse.clearDeltaE
      ? []
      : [`ΔE ${String(rinseDeltaE)} to clear water`],
  ]);

  const runs = (role: Role) => onIntervals(within(id(role)));
  // When a pump stops, its scales are read before the next pump starts (doc 02: nothing else
  // moves the liquid in between).
  const starts = PUMPS_ON.flatMap((role) => runs(role).map(([on]) => on)).sort((x, y) => x - y);
  const nextStart = (t: number) => starts.find((s) => s > t) ?? Infinity;
  const before = (role: Role, t: number) =>
    within(id(role))
      .filter((p) => p.t < t)
      .at(-1)?.v;
  const after = (role: Role, off: number, until = nextStart(off)) => {
    const points = within(id(role)).filter((p) => p.t > off);
    return (points.filter((p) => p.t < until).at(-1) ?? points[0])?.v;
  };
  const differ = (x: number | undefined, y: number | undefined, tolerance: number) =>
    x === undefined || y === undefined || Math.abs(x - y) > tolerance;
  const g = (v: number | undefined) => (v === undefined ? 'nothing' : `${v.toFixed(1)} g`);
  const at = (t: number) => new Date(t).toISOString();

  // Dye doses.
  const doseProblems: string[] = [];
  let doses = 0;
  for (const d of DYES) {
    for (const [on, off] of runs(dyeRole(d, 'PumpOn'))) {
      doses++;
      const tankDrop = sub(before(dyeRole(d, 'Mass'), on), after(dyeRole(d, 'Mass'), off));
      const vesselGain = sub(after('vesselMass', off), before('vesselMass', on));
      const steps = after(dyeRole(d, 'PumpSteps'), off);
      const byVolume = steps === undefined ? undefined : steps * config.pumps.dyeGPerStep;
      if (differ(tankDrop, vesselGain, SCALE_TOLERANCE_G)) {
        doseProblems.push(
          `${d} at ${at(on)}: tank dropped ${g(tankDrop)}, vessel gained ${g(vesselGain)}`,
        );
      }
      if (differ(tankDrop, byVolume, SCALE_TOLERANCE_G)) {
        doseProblems.push(
          `${d} at ${at(on)}: ${String(steps)} steps are ${g(byVolume)}, tank dropped ${g(tankDrop)}`,
        );
      }
    }
  }
  results.push([
    `every dye dose: tank drop = vessel gain = steps × g/step (${String(doses)} doses)`,
    cut(doseProblems, doses === 0),
  ]);

  // Fills and the check station: the filling scale is read before its platform goes down.
  const fillProblems: string[] = [];
  const filled: number[] = [];
  const platformDown = runs('fillingPlatformUp').map(([, down]) => down);
  for (const [on, off] of runs('fillingPumpOn')) {
    const down = platformDown.find((t) => t > off) ?? Infinity;
    const cup = after('fillingMass', off, down);
    const vesselDrop = sub(before('vesselMass', on), after('vesselMass', off));
    if (cup !== undefined) filled.push(cup);
    if (differ(cup, vesselDrop, SCALE_TOLERANCE_G)) {
      fillProblems.push(`fill at ${at(on)}: cup ${g(cup)}, vessel dropped ${g(vesselDrop)}`);
    }
  }
  const weighed = runs('checkPlatformUp').map(([up, down]) => ({
    weight: within(id('checkMass'))
      .filter((p) => p.t > up && p.t < down)
      .at(-1)?.v,
    decision: within(id('checkDecision'))
      .filter((p) => p.t <= down)
      .at(-1)?.v,
  }));
  weighed.forEach(({ weight }, i) => {
    if (differ(weight, filled[i], SCALE_TOLERANCE_G)) {
      fillProblems.push(`cup ${String(i + 1)}: check scale ${g(weight)}, filled ${g(filled[i])}`);
    }
  });
  results.push([
    `every fill: vessel drop = cup on the filling scale = check scale (${String(filled.length)} cups)`,
    cut(fillProblems, filled.length !== perBatch || weighed.length !== perBatch),
  ]);

  // The big tank has no scale: its level follows the water it gave.
  const levelProblems: string[] = [];
  const tank = machine.components.find((c) => c.id === PART_TABLE.bigTank)?.geometry;
  const areaMm2 = tank?.shape === 'cylinder' ? Math.PI * (tank.diameter / 2) ** 2 : 0;
  const baseRuns = runs('basePumpOn');
  for (const [on, off] of baseRuns) {
    const levelDrop = sub(before('bigTankLevel', on), after('bigTankLevel', off));
    const vesselGain = sub(after('vesselMass', off), before('vesselMass', on));
    const fromLevel = levelDrop === undefined ? undefined : (levelDrop * areaMm2) / 1000;
    if (differ(fromLevel, vesselGain, LEVEL_TOLERANCE_G)) {
      levelProblems.push(
        `base at ${at(on)}: big tank gave ${g(fromLevel)}, vessel gained ${g(vesselGain)}`,
      );
    }
  }
  results.push([
    `every base pump run: big tank level drop = vessel gain (${String(baseRuns.length)} runs)`,
    cut(levelProblems, baseRuns.length === 0),
  ]);

  // The tray leaves with the cups that passed.
  const passed = weighed.filter((w) => w.decision === 1).length;
  const nextRefill = refills.find((r) => r.t > end.t);
  const trayItem = nextRefill?.p.items.find((i) => i.component === PART_TABLE.tray);
  results.push([
    'the refill after the batch takes the tray with the cups that passed',
    !nextRefill
      ? ['no refill message after the batch (listen longer)']
      : trayItem?.amount === passed
        ? []
        : [`tray ${String(trayItem?.amount)}, passed ${String(passed)}`],
  ]);
  return results;
}

/** [on, off] times of a digital sensor's 1 periods. */
function onIntervals(points: readonly Point[]): [number, number][] {
  const out: [number, number][] = [];
  let on: number | undefined;
  for (const p of points) {
    if (p.v === 1 && on === undefined) on = p.t;
    if (p.v === 0 && on !== undefined) {
      out.push([on, p.t]);
      on = undefined;
    }
  }
  return out;
}

const sub = (a: number | undefined, b: number | undefined) =>
  a === undefined || b === undefined ? undefined : a - b;

function cut(problems: string[], nothingSeen: boolean): string[] {
  if (nothingSeen && problems.length === 0) return ['not enough of it was heard'];
  return problems.slice(0, 5);
}
