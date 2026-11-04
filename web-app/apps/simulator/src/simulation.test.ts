import {
  type BatchEventPayload,
  decodeBatchMessage,
  decodeReading,
  machineStateSchema,
  type RefillEventPayload,
  sensorsByTopic,
} from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import { PLACE } from './plant.js';
import { seededRandom } from './random.js';
import { TICK_MS } from './schedule.js';
import { type Message, Simulation, type SimulationOptions } from './simulation.js';
import { realMachine, realSimConfig } from './testing.js';

const machine = realMachine();
const config = realSimConfig();
const byTopic = sensorsByTopic(machine);
const T0 = Date.parse('2026-11-04T08:00:00.000Z');

interface Run {
  sim: Simulation;
  messages: Message[];
  /** Messages with the time they were sent. */
  at: number[];
}

/** Runs the simulation in fast time until `batches` batches have finished. */
function run(
  batches: number,
  options: Partial<SimulationOptions> = {},
  check?: (sim: Simulation) => void,
): Run {
  const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(1), ...options });
  const messages: Message[] = [];
  const at: number[] = [];
  let finished = 0;
  for (let t = T0; finished < batches; t += TICK_MS) {
    if (t - T0 > batches * 10 * 60_000) throw new Error('the batches never finished');
    for (const m of sim.advanceTo(t)) {
      messages.push(m);
      at.push(t);
      if (m.kind === 'batch' && m.event === 'finished') finished++;
    }
    check?.(sim);
  }
  return { sim, messages, at };
}

const batchMessages = (r: Run) =>
  r.messages.flatMap((m, i) =>
    m.kind === 'batch' ? [{ event: m.event, payload: m.payload, t: r.at[i] ?? 0 }] : [],
  );
const events = (r: Run) =>
  batchMessages(r).filter(
    (
      m,
    ): m is {
      event: 'started' | 'step' | 'finished' | 'aborted';
      payload: BatchEventPayload;
      t: number;
    } => m.event !== 'refill',
  );
const refills = (r: Run) =>
  batchMessages(r).flatMap((m) => (m.event === 'refill' ? [m.payload as RefillEventPayload] : []));

describe('one batch, start to finish (doc 01 batch logic)', () => {
  const one = run(1);

  it('goes through the steps in order, with 0 to 2 corrections', () => {
    const seq = events(one)
      .filter((e, i, all) => e.event !== 'step' || e.payload.step !== all[i - 1]?.payload.step)
      .map((e) => (e.event === 'step' ? e.payload.step : `${e.event}:${e.payload.step}`))
      .join(' ');
    expect(seq).toMatch(
      /^started:baseFill dyeDose mix sample( correct mix sample){0,2} complete mix finalCheck filling rinse finished:rinse$/,
    );
  });

  it('fills 6 cups, counting each one in the filling step', () => {
    const counts = events(one)
      .filter((e) => e.payload.step === 'filling' && e.event === 'step')
      .map((e) => e.payload.containersDone);
    expect(counts).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const done = one.sim.plant.trayCups + one.sim.plant.rejects;
    expect(done).toBe(6);
  });

  it('takes about 4 minutes (owner, step 15)', () => {
    const e = events(one);
    const minutes = ((e.at(-1)?.t ?? 0) - (e[0]?.t ?? 0)) / 60_000;
    expect(minutes).toBeGreaterThan(3.5);
    expect(minutes).toBeLessThan(4.5);
  });

  it('keeps one batch id from started to finished, and the machine state with it', () => {
    const ids = new Set(events(one).map((e) => e.payload.batchId));
    expect(ids.size).toBe(1);
    const [id] = [...ids];
    expect(id).toBe('B-20261104-080005');
    const states = one.messages.flatMap((m) => (m.kind === 'state' ? [m.payload] : []));
    expect(states.map((s) => [s.status, s.batchId])).toEqual([
      ['idle', null],
      ['running', id],
      ['idle', null],
    ]);
  });

  it('sends only messages the shared formats accept, all from source sim', () => {
    for (const m of one.messages) {
      if (m.kind === 'reading') {
        const sensor = byTopic.get(m.topic);
        expect(sensor && decodeReading(sensor, m.payload).ok, m.topic).toBe(true);
      } else if (m.kind === 'state') {
        expect(machineStateSchema.safeParse(m.payload).success).toBe(true);
      } else {
        expect(decodeBatchMessage(machine, m.event, m.payload).ok).toBe(true);
      }
      expect(m.payload.source).toBe('sim');
    }
  });

  it('ends within ΔE 2.0 of the target, and the rinse leaves clear water', () => {
    const readings = (id: string) =>
      one.messages.flatMap((m, i) =>
        m.kind === 'reading' && byTopic.get(m.topic)?.id === id
          ? [{ v: m.payload.value, t: one.at[i] ?? 0 }]
          : [],
      );
    const steps = events(one);
    const filling = steps.find((e) => e.payload.step === 'filling')?.t ?? 0;
    const rinse = steps.find((e) => e.payload.step === 'rinse')?.t ?? 0;
    const atFill = readings('color.deltaE')
      .filter((r) => r.t <= filling)
      .at(-1);
    expect(atFill?.v).toBeLessThanOrEqual(config.batch.toleranceDeltaE);
    const finalL = readings('color.L').at(-1)?.v ?? 0;
    expect(finalL).toBeGreaterThan(99);
    expect(rinse).toBeGreaterThan(filling);
  });
});

describe('masses balance (step 15 acceptance)', () => {
  it('never creates or loses a gram, at any moment of three batches', () => {
    let worst = 0;
    run(3, {}, (sim) => {
      worst = Math.max(worst, Math.abs(sim.plant.ledger.total()));
    });
    expect(worst).toBeLessThan(1e-6);
  });

  it('every dye tank drops by what the vessel gains, and the vessel by what each cup gains', () => {
    const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(3) });
    const ledger = sim.plant.ledger;
    const snapshot = () => ({
      vessel: ledger.mass(PLACE.vessel),
      tanks: (['cyan', 'magenta', 'yellow', 'black'] as const).reduce(
        (s, d) => s + ledger.mass(PLACE.dyeTank(d)),
        0,
      ),
      cups: sim.plant.cups.reduce((s, c) => s + sim.plant.cupMass(c), 0),
      tray: ledger.mass(PLACE.tray),
      rejects: ledger.mass(PLACE.rejectBox),
      cell: ledger.mass(PLACE.cell),
    });
    let before = snapshot();
    let checked = 0;
    // Pumps switched on in one step move liquid in the next, so look at the state before it.
    let quiet = true;
    for (let t = T0; t < T0 + 4 * 60_000; t += TICK_MS) {
      sim.advanceTo(t);
      const now = snapshot();
      if (quiet) {
        // With only dye and filling pumps moving, the vessel's change is exactly their sum.
        const dyeIn = before.tanks - now.tanks;
        const toCups =
          now.cups + now.tray + now.rejects - (before.cups + before.tray + before.rejects);
        expect(now.vessel - before.vessel).toBeCloseTo(dyeIn - toCups, 6);
        if (dyeIn > 0 || toCups > 0) checked++;
      }
      quiet = !(['base', 'drain', 'sample'] as const).some((p) => sim.plant.isRunning(p));
      before = now;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('between batches: the service (owner, step 15)', () => {
  const many = run(20, { random: seededRandom(11) });
  const tray = machine.components.find((c) => c.id === 'batchTray')?.id;

  it('removes the full tray after every batch, in one refill message with batchId null', () => {
    const list = refills(many);
    expect(list).toHaveLength(19);
    for (const r of list) {
      expect(r.batchId).toBeNull();
      expect(r.items.find((i) => i.component === tray)?.unit).toBe('count');
    }
  });

  it('rejects about 1 cup in 20, and the counts add up', () => {
    const p = many.sim.plant;
    const trayCounts = refills(many).flatMap((r) => r.items.filter((i) => i.component === tray));
    const good = trayCounts.reduce((s, i) => s + i.amount, 0) + p.trayCups;
    const emptiedRejects = refills(many)
      .flatMap((r) => r.items.filter((i) => i.component === 'rejectBox'))
      .reduce((s, i) => s + i.amount, 0);
    const rejected = emptiedRejects + p.rejects;
    expect(good + rejected).toBe(120);
    expect(rejected).toBeGreaterThanOrEqual(2);
    expect(rejected).toBeLessThanOrEqual(14);
  });

  it('refills the big tank, cups and lids before they run out, and says how much', () => {
    const items = refills(many).flatMap((r) => r.items);
    const tank = items.filter((i) => i.component === 'bigTank');
    expect(tank.length).toBeGreaterThan(2);
    for (const i of tank) expect(i).toMatchObject({ action: 'refilled', unit: 'g' });
    expect(items.some((i) => i.component === 'containerMagazine' && i.unit === 'count')).toBe(true);
    expect(items.some((i) => i.component === 'lidMagazine')).toBe(true);
    expect(items.some((i) => i.component === 'drainBucket' && i.action === 'emptied')).toBe(true);
  });

  it('never lets a supply run out, so no float ever trips (alarms belong to the PLC)', () => {
    const tripped = many.messages.filter(
      (m) =>
        m.kind === 'reading' &&
        ['bigTank.lowFloat', 'drainBucket.full', 'vessel.overflow'].includes(
          byTopic.get(m.topic)?.id ?? '',
        ) &&
        m.payload.value !== 0,
    );
    expect(tripped).toEqual([]);
  });

  it('the big tank rises by exactly the grams the message names', () => {
    const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(11) });
    let previous = sim.plant.ledger.mass(PLACE.bigTank);
    let seen = 0;
    for (let t = T0; seen < 1; t += TICK_MS) {
      for (const m of sim.advanceTo(t)) {
        if (m.kind !== 'batch' || m.event !== 'refill') continue;
        const item = (m.payload as RefillEventPayload).items.find((i) => i.component === 'bigTank');
        if (!item) continue;
        expect(sim.plant.ledger.mass(PLACE.bigTank) - previous).toBeCloseTo(item.amount, 1);
        seen++;
      }
      previous = sim.plant.ledger.mass(PLACE.bigTank);
    }
  });
});

describe('the fault hook (doc 04: not used in phase 1)', () => {
  it('a worn cyan pump needs more cyan steps for the same colour', () => {
    const healthy = run(1).sim;
    const worn = run(1, { faults: { pumpDelivery: { cyan: 0.8 } } }).sim;
    const cyanUsed = (sim: Simulation) =>
      config.supplies.dyeTankFullG - sim.plant.ledger.mass(PLACE.dyeTank('cyan'));
    // The PLC commands more steps; what reaches the vessel stays about the same.
    expect(worn.plant.stepsTotal.cyan).toBeGreaterThan(healthy.plant.stepsTotal.cyan * 1.1);
    expect(Math.abs(cyanUsed(worn) / cyanUsed(healthy) - 1)).toBeLessThan(0.1);
    // The research idea (doc 01): commanded grams and weighed grams now differ.
    const commanded = worn.plant.stepsTotal.cyan * config.pumps.dyeGPerStep;
    expect(cyanUsed(worn)).toBeLessThan(commanded * 0.85);
  });
});

describe('connection and clock', () => {
  it('sends every sensor and the state again after a reconnect', () => {
    const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(1) });
    sim.advanceTo(T0 + 10_000);
    sim.reset();
    const again = sim.advanceTo(T0 + 10_000 + TICK_MS);
    expect(again.filter((m) => m.kind === 'reading')).toHaveLength(60);
    expect(again.filter((m) => m.kind === 'state')).toHaveLength(1);
  });

  it('skips ahead after a long pause instead of catching up', () => {
    const sim = new Simulation(machine, config, {
      startMs: T0,
      random: seededRandom(1),
      maxLagMs: 2000,
    });
    sim.advanceTo(T0);
    const late = sim.advanceTo(T0 + 3_600_000);
    expect(late.filter((m) => m.kind === 'reading').length).toBeLessThanOrEqual(60);
    expect(sim.now).toBe(T0 + 3_600_000);
  });
});
